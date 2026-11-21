import { resolveArtifact } from '../services/artifactService.js'
import { mlHeaders } from '../services/mlHeaders.js'
import fetch from 'node-fetch'
import { randomUUID } from 'node:crypto'
import { validateAnalysisResult, failedAnalysisResult } from '../services/analysisResultContract.js'
import fs from 'fs/promises'
import path from 'path'
import { File } from '../models/index.js'
import TextAnalysisResult from '../models/TextAnalysisResult.js'
import UnifiedAnalysisResult from '../models/UnifiedAnalysisResult.js'
import fileService from '../services/fileService.js'
import { modelRegistryService } from '../services/modelRegistryService.js'
import { CONFIG } from '../config/config.js'

const MAX_TEXT_CHARS = 20000
const MAX_TEXT_BYTES = 100000
const FILE_ID = /^[0-9a-f-]{36}$/i
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i
const base = process.env.ML_API_URL || 'http://ml-service:5010'

async function callModel(modelId, payload, timeoutMs, expected) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}/api/models/${encodeURIComponent(modelId)}/analyze`, {
      method: 'POST', headers: mlHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload), signal: controller.signal
    })
    let result
    try { result = await response.json() } catch (error) {
      if (error.name === 'AbortError') throw error
      throw new Error('invalid_model_result')
    }
    validateAnalysisResult(result, expected)
    if (response.ok !== ['completed', 'partial'].includes(result.status)) throw new Error('invalid_model_result')
    return { result, httpStatus: response.ok ? 200 : response.status === 400 ? 422 : response.status }
  } finally { clearTimeout(timer) }
}

function safeStoredPath(file) {
  const ownedRoot = path.resolve(CONFIG.FILE_PATH, String(file.user))
  const candidate = path.resolve(fileService.getPath(file))
  const relative = path.relative(ownedRoot, candidate)
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('invalid_stored_file_path')
  }
  return candidate
}

async function capabilitiesForFile(file) {
  const capabilities = await modelRegistryService.listCapabilities()
  const ext = path.extname(file.name).toLowerCase()
  return (capabilities.models || []).filter(model =>
    Array.isArray(model.extensions) && model.extensions.includes(ext)
  )
}

// Only user-owned files go through this controller. Never accept a client path.
export const unifiedAnalysisController = {
  async artifact(req, res) {
    const record = await UnifiedAnalysisResult.findOne({ where: { id: req.params.analysisId, ownerId: req.user.id } })
    if (!record) return res.status(404).json({ message: 'Результат не найден' })
    const file = await File.findOne({ where: { _id: record.fileId, user: req.user.id } })
    if (!file) return res.status(404).json({ message: 'Материал не найден' })
    try {
      const artifact = await resolveArtifact(record, req.params.artifactId)
      if (!artifact) return res.status(404).json({ message: 'Файл результата не найден' })
      res.type(artifact.type)
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(artifact.name)}"`)
      return res.sendFile(artifact.path)
    } catch { return res.status(404).json({ message: 'Файл результата недоступен' }) }
  },
  async available(req, res) {
    const file = await File.findOne({ where: { _id: req.params.fileId, user: req.user.id } })
    if (!file) return res.status(404).json({ message: 'Материал не найден' })
    if (file.type === 'dir') return res.json({ models: [] })
    try {
      return res.json({ models: await capabilitiesForFile(file) })
    } catch (error) {
      return res.status(503).json({ message: 'Реестр моделей временно недоступен' })
    }
  },

  async analyze(req, res) {
    const { fileId, modelId } = req.body || {}
    if (typeof fileId !== 'string' || !FILE_ID.test(fileId) ||
        typeof modelId !== 'string' || !MODEL_ID.test(modelId)) {
      return res.status(400).json({ message: 'Неверный идентификатор файла или модели' })
    }
    const file = await File.findOne({ where: { _id: fileId, user: req.user.id } })
    if (!file || file.type === 'dir') return res.status(404).json({ message: 'Материал не найден' })
    let model
    try {
      const compatible = await capabilitiesForFile(file)
      model = compatible.find(item => item.id === modelId)
    } catch {
      return res.status(503).json({ message: 'ML-сервис недоступен' })
    }
    if (!model) return res.status(422).json({ message: 'Модель не поддерживает формат материала' })
    if (model.status !== 'configured') return res.status(503).json({ message: 'Модель пока недоступна', reason: model.reason })

    try { safeStoredPath(file) } catch {
      return res.status(422).json({ message: 'Некорректный путь сохранённого файла' })
    }
    let payload
    let timeoutMs = 30000
    if (model.modality === 'text') {
      if (file.size > MAX_TEXT_BYTES) return res.status(413).json({ message: 'Слишком большой текстовый файл' })
      let content
      try {
        content = await fs.readFile(safeStoredPath(file), 'utf8')
      } catch { return res.status(404).json({ message: 'Файл недоступен на диске' }) }
      if (!content.trim() || content.length > MAX_TEXT_CHARS) {
        return res.status(422).json({ message: 'Для анализа нужен текст до 20000 символов' })
      }
      payload = { text: content }
    } else if (model.modality === 'video') {
      payload = { user_id: req.user.id, video_path: safeStoredPath(file) }
      timeoutMs = 1200000
    } else {
      // A future trusted developer adapter receives a validated shared file
      // path. The frontend and BFF stay unchanged for other modalities.
      payload = { user_id: req.user.id, file_path: safeStoredPath(file), file_name: file.name }
      timeoutMs = 1200000
    }
    const expected = { analysisId: randomUUID(), fileId: file._id, model, startedAt: new Date().toISOString() }
    // IDs and paths are supplied by the authenticated backend, never the client.
    payload.analysis_id = expected.analysisId
    payload.file_id = file._id
    payload.user_id = req.user.id
    payload.file_path = safeStoredPath(file)
    payload.file_name = file.name
    let result, httpStatus
    try {
      const response = await callModel(modelId, payload, timeoutMs, expected)
      result = response.result
      httpStatus = response.httpStatus
    } catch (error) {
      console.warn('Generic ML analysis failed:', modelId, error.message)
      const code = error.name === 'AbortError' ? 'model_timeout' :
        error.message === 'invalid_model_result' ? 'invalid_model_result' : 'ml_service_unavailable'
      const message = code === 'model_timeout' ? 'Истекло время ожидания ML-сервиса; выполнение могло продолжиться' :
        code === 'invalid_model_result' ? 'ML-сервис вернул результат с неверной структурой' : 'ML-сервис недоступен'
      result = failedAnalysisResult(expected, code, message)
      httpStatus = code === 'invalid_model_result' ? 502 : 503
    }
    try {
      await UnifiedAnalysisResult.create({
        id: expected.analysisId, ownerId: req.user.id, childProfileId: file.childProfileId || null,
        fileId: file._id, modelId, modelVersion: model.version,
        status: result.status, resultJson: JSON.stringify(result)
      })
      if (model.operation === 'movement-analysis' && ['completed', 'partial'].includes(result.status)) {
        file.hasAnalysis = true
        await file.save()
      }
      // Aliases keep older clients functional; canonical fields are stored as-is.
      return res.status(httpStatus).json({ ...result, analysisId: result.analysis_id,
        fileId: file._id, childProfileId: file.childProfileId || null,
        model_id: modelId, model_version: model.version,
        ...(result.error ? { message: result.error.message, reason: result.error.code } : {}) })
    } catch (error) {
      console.warn('Cannot persist ML result:', error.message)
      return res.status(500).json({ message: 'Не удалось сохранить результат анализа' })
    }
  },

  async history(req, res) {
    const file = await File.findOne({ where: { _id: req.params.fileId, user: req.user.id } })
    if (!file) return res.status(404).json({ message: 'Материал не найден' })
    const where = { fileId: file._id, ownerId: req.user.id }
    if (req.query.modelId) {
      if (!MODEL_ID.test(String(req.query.modelId))) return res.status(400).json({ message: 'Неверная модель' })
      where.modelId = req.query.modelId
    }
    const records = await UnifiedAnalysisResult.findAll({ where, order: [['createdAt', 'DESC']], limit: 40 })
    const items = records.map(record => ({
      id: record.id, date: record.createdAt, modelId: record.modelId,
      modelVersion: record.modelVersion, status: record.status,
      result: JSON.parse(record.resultJson)
    }))
    // Preserve visibility of text analyses created before stage 9.
    if (!req.query.modelId || req.query.modelId === 'parent-story-nb') {
      const previous = await TextAnalysisResult.findAll({
        where: { fileId: file._id, ownerId: req.user.id },
        order: [['createdAt', 'DESC']], limit: 40
      })
      items.push(...previous.map(record => ({
        id: record.id, date: record.createdAt, modelId: record.modelId,
        modelVersion: record.modelVersion, status: 'completed',
        result: JSON.parse(record.resultJson)
      })))
    }
    return res.json(items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40))
  }
}
