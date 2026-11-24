import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { failedAnalysisResult, validateAnalysisResult } from '../services/analysisResultContract.js'

const model = { id: 'test-text', label: 'Test text', version: '1', modality: 'text', operation: 'classification',
  extensions: ['.txt'], status: 'configured' }

function successful(context) {
  return { ...failedAnalysisResult(context, 'x', 'x'), status: 'completed', summary: 'Done', error: null,
    parameters: [{ key: 'label', label: 'Class', type: 'integer', value: 0 },
      { key: 'unknown_metric', label: 'Unknown metric', type: 'array', value: Array.from({ length: 65 }, (_, i) => i) }] }
}

test('contract rejects mismatched identity, invalid types, duplicate keys and hidden table columns', () => {
  const expected = { analysisId: randomUUID(), fileId: randomUUID(), model, startedAt: new Date().toISOString() }
  assert.equal(validateAnalysisResult(successful(expected), expected).status, 'completed')
  for (const mutate of [
    r => { r.analysis_id = 'wrong' }, r => { r.input.file_id = 'wrong' },
    r => { r.model.version = 'wrong' }, r => { r.error = { code: 'x', message: 'x' } },
    r => { r.parameters[0].value = false },
    r => { r.parameters.push(r.parameters[0]) },
    r => { r.parameters.push({ key: 'table', label: 'T', type: 'table', columns: [{ key: 'x', label: 'X' }], value: [{ x: 1, hidden: 2 }] }) }
  ]) {
    const result = structuredClone(successful(expected)); mutate(result)
    assert.throws(() => validateAnalysisResult(result, expected), /invalid_model_result/)
  }
})

test('HTTP + SQLite: ownership, canonical persistence, failures, old history and video flag', async () => {
  const temp = await fs.mkdtemp(path.resolve('.adapter-test-'))
  let mode = 'success', calls = 0, forwarded
  const videoModel = { ...model, id: 'test-video', label: 'Video', modality: 'video', operation: 'movement-analysis', extensions: ['.mp4'] }
  const otherVideoModel = { ...videoModel, id: 'other-video', operation: 'other-video-operation' }
  const registry = [model, videoModel, otherVideoModel]
  const ml = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/api/capabilities') return res.end(JSON.stringify({ models: registry }))
    let body = ''; for await (const chunk of req) body += chunk
    const payload = JSON.parse(body); forwarded = payload; calls++
    const selected = registry.find(item => req.url.includes(`/models/${item.id}/`))
    const context = { analysisId: payload.analysis_id, fileId: payload.file_id, model: selected, startedAt: new Date().toISOString() }
    let result = mode === 'failure' || mode === 'busy' ? failedAnalysisResult(context, mode, 'Test failure') : successful(context)
    if (mode === 'invalid') result = { status: 'completed', invented: 1 }
    if (mode === 'failure') res.statusCode = 503
    if (mode === 'busy') res.statusCode = 409
    res.end(JSON.stringify(result))
  })
  ml.listen(0, '127.0.0.1'); await once(ml, 'listening')
  process.env.DB_PATH = path.join(temp, 'test.sqlite')
  process.env.FILE_PATH = path.join(temp, 'files')
  process.env.DATASET_DIR = path.join(temp, 'dataset')
  process.env.ML_API_URL = `http://127.0.0.1:${ml.address().port}`
  process.env.JWT_ACCESS_SECRET = 'adapter-test-only'
  process.env.JWT_REFRESH_SECRET = 'adapter-test-only-refresh'
  const { default: express } = await import('express')
  const { default: jwt } = await import('jsonwebtoken')
  const { default: db } = await import('../DB/database.js')
  const { default: User } = await import('../models/User.js')
  const { File } = await import('../models/index.js')
  const { default: Records } = await import('../models/UnifiedAnalysisResult.js')
  const { default: TextRecords } = await import('../models/TextAnalysisResult.js')
  const { router } = await import('../routes/ml.routes.js')
  const { router: fileRouter } = await import('../routes/file.routes.js')
  const app = express(); app.use(express.json()); app.use('/api/ml', router); app.use('/api/files', fileRouter)
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/ml`
  try {
    await db.sync()
    const owner = await User.create({ email: 'owner@test.invalid', password: 'not-used' })
    const other = await User.create({ email: 'other@test.invalid', password: 'not-used' })
    const headers = id => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_ACCESS_SECRET)}`, 'Content-Type': 'application/json' })
    const file = await File.create({ name: 'sample.txt', type: 'txt', path: 'sample.txt', size: 5, user: owner._id })
    const video = await File.create({ name: 'sample.mp4', type: 'mp4', path: 'sample.mp4', size: 5, user: owner._id })
    await fs.mkdir(path.join(process.env.FILE_PATH, owner._id), { recursive: true })
    await fs.writeFile(path.join(process.env.FILE_PATH, owner._id, file.path), 'hello')
    await fs.writeFile(path.join(process.env.FILE_PATH, owner._id, video.path), 'fixture')
    const analyze = (fileId = file._id, modelId = model.id, user = owner._id) => fetch(`${base}/analyze`, {
      method: 'POST', headers: headers(user), body: JSON.stringify({ fileId, modelId, video_path: '/client-controlled', analysis_id: 'client-controlled' })
    })
    assert.equal((await fetch(`${base}/analyses/${file._id}`)).status, 401)
    assert.equal((await fetch(`${base}/status-analyze`)).status, 401)
    assert.equal((await analyze(file._id, model.id, other._id)).status, 404)
    assert.equal(calls, 0)
    let response = await analyze(); assert.equal(response.status, 200)
    let result = await response.json()
    assert.equal(result.status, 'completed'); assert.equal(forwarded.text, 'hello')
    assert.notEqual(forwarded.analysis_id, 'client-controlled')
    const listed = await (await fetch(base.replace('/api/ml', '/api/files'), { headers: headers(owner._id) })).json()
    assert.equal(listed.find(item => item._id === file._id).latestAnalysisStatus, 'completed')
    assert.equal(listed.find(item => item._id === file._id).hasSavedAnalysis, true)
    const otherList = await (await fetch(base.replace('/api/ml', '/api/files'), { headers: headers(other._id) })).json()
    assert.deepEqual(otherList, [])
    let record = await Records.findByPk(result.analysis_id)
    assert.equal(record.status, 'completed')
    assert.deepEqual(JSON.parse(record.resultJson).parameters[1].value, Array.from({ length: 65 }, (_, i) => i))
    for (const [nextMode, status, code] of [['failure', 503, 'failure'], ['busy', 409, 'busy'], ['invalid', 502, 'invalid_model_result']]) {
      mode = nextMode; response = await analyze(); assert.equal(response.status, status)
      result = await response.json(); assert.equal(result.status, 'failed'); assert.equal(result.error.code, code)
      record = await Records.findByPk(result.analysis_id); assert.equal(record.status, 'failed')
    }
    await TextRecords.create({ ownerId: owner._id, fileId: file._id, modelId: 'parent-story-nb', modelVersion: 'old', resultJson: '{"label":0}' })
    const history = await (await fetch(`${base}/analyses/${file._id}`, { headers: headers(owner._id) })).json()
    assert.equal(history.length, 5); assert.ok(history.some(item => item.result.conclusion.code === 'legacy_summary' && item.result.conclusion.title.includes('без РАС')))
    assert.equal((await fetch(`${base}/analyses/${file._id}`, { headers: headers(other._id) })).status, 404)
    mode = 'failure'; await analyze(video._id, videoModel.id); await video.reload(); assert.equal(video.hasAnalysis, false)
    mode = 'success'; await analyze(video._id, otherVideoModel.id); await video.reload(); assert.equal(video.hasAnalysis, false)
    await analyze(video._id, videoModel.id); await video.reload(); assert.equal(video.hasAnalysis, true)
    assert.equal(forwarded.video_path, path.join(process.env.FILE_PATH, owner._id, video.path))
  } finally {
    await new Promise(resolve => server.close(resolve))
    await new Promise(resolve => ml.close(resolve))
    await db.close(); await fs.rm(temp, { recursive: true, force: true })
  }
})


test('presentation 1.1 requires human-readable fields and retains 1.0 support', () => {
  const expected = { analysisId: randomUUID(), fileId: randomUUID(), model, startedAt: new Date().toISOString() }
  const result = { ...successful(expected), conclusion: { code: 'ok', title: 'Готово', explanation: 'Объяснение' },
    metrics: [{ key: 'zero', label: 'Ноль', type: 'integer', value: 0, description: 'Описание' }],
    limitations: ['Ограничение'], raw_output: { future: [false, 0, null] } }
  assert.equal(validateAnalysisResult(result, expected), result)
  for (const mutate of [r => { delete r.conclusion }, r => { r.conclusion.title = '' },
    r => { delete r.metrics[0].description }, r => { r.metrics.push(r.metrics[0]) },
    r => { delete r.raw_output }, r => { r.limitations = 'invalid' }]) {
    const bad = structuredClone(result); mutate(bad)
    assert.throws(() => validateAnalysisResult(bad, expected), /invalid_model_result/)
  }
  const legacy = structuredClone(result); legacy.schema_version = '1.0'
  for (const key of ['conclusion', 'metrics', 'limitations', 'raw_output']) delete legacy[key]
  assert.equal(validateAnalysisResult(legacy, expected), legacy)
})

test('1.2 partial reports keep successful data and reject partial in old schemas',()=>{
 const expected={analysisId:randomUUID(),fileId:randomUUID(),model,startedAt:new Date().toISOString()}
 const result={...successful(expected),status:'partial',error:{code:'classifier_failed',message:'Classifier unavailable'}}
 assert.equal(validateAnalysisResult(result,expected).status,'partial')
 const legacy={...result,schema_version:'1.1'}
 assert.throws(()=>validateAnalysisResult(legacy,expected),/invalid_model_result/)
})
