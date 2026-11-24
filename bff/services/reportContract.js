import { isDeepStrictEqual } from 'node:util'
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = v => typeof v === 'string' && v.trim().length > 0
const id = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(v)
const need = c => { if (!c) throw new Error('invalid_model_result') }
const keysOnly = (v, keys) => Object.keys(v).every(k => keys.includes(k))
const scalar = v => v === null || ['string', 'boolean'].includes(typeof v) || (typeof v === 'number' && Number.isFinite(v))
const media = {
  image: ['image/png', 'image/jpeg', 'image/webp'],
  audio: ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/webm'],
  video: ['video/mp4', 'video/webm', 'video/quicktime']
}
export function validateReportSchema(schema) {
  need(object(schema) && keysOnly(schema, ['version', 'blocks']) && schema.version === '1.0')
  need(Array.isArray(schema.blocks) && schema.blocks.length > 0 && schema.blocks.length <= 100)
  for (const block of schema.blocks) {
    need(object(block) && keysOnly(block, ['id', 'type', 'title', 'required', 'description', 'columns', 'media_types']))
    need(id(block.id) && ['text', 'table', 'image', 'audio', 'video', 'file'].includes(block.type) && text(block.title) && typeof block.required === 'boolean')
    need(block.description === undefined || typeof block.description === 'string')
    if (block.type === 'table') {
      need(Array.isArray(block.columns) && block.columns.length > 0 && block.columns.length <= 50)
      for (const col of block.columns) need(object(col) && keysOnly(col, ['key','label','unit']) && id(col.key) && text(col.label) && (col.unit === undefined || typeof col.unit === 'string'))
      need(new Set(block.columns.map(col => col.key)).size === block.columns.length)
    } else need(block.columns === undefined)
    if (block.media_types !== undefined) {
      need((media[block.type] || block.type === 'file') && Array.isArray(block.media_types) && block.media_types.length > 0 && block.media_types.every(text))
      if (media[block.type]) need(block.media_types.every(mime => media[block.type].includes(mime)))
    }
  }
  need(new Set(schema.blocks.map(block => block.id)).size === schema.blocks.length)
  return schema
}
export function validateReport(report, artifacts, expectedSchema) {
  need(object(report) && keysOnly(report, ['schema','blocks']))
  validateReportSchema(report.schema)
  if (expectedSchema !== undefined) need(isDeepStrictEqual(report.schema, expectedSchema))
  need(Array.isArray(report.blocks) && report.blocks.length === report.schema.blocks.length)
  const files = new Map(artifacts.map(item => [item.id, item]))
  need(files.size === artifacts.length)
  const missing = []
  report.schema.blocks.forEach((definition, i) => {
    const block = report.blocks[i]
    need(object(block) && block.id === definition.id && keysOnly(block, ['id','status','data','artifact_id','message']) && ['ready','unavailable'].includes(block.status))
    if (block.status === 'unavailable') {
      need(text(block.message) && !Object.hasOwn(block,'data') && !Object.hasOwn(block,'artifact_id'))
      if (definition.required) missing.push(block.id)
      return
    }
    need(block.message === undefined)
    if (definition.type === 'text') need(text(block.data) && block.artifact_id === undefined)
    else if (definition.type === 'table') {
      const columns = new Set(definition.columns.map(col => col.key))
      need(Array.isArray(block.data) && block.artifact_id === undefined && block.data.every(row => object(row) && Object.keys(row).every(key => columns.has(key)) && Object.values(row).every(scalar)))
    } else {
      const artifact = files.get(block.artifact_id)
      need(id(block.artifact_id) && artifact && !Object.hasOwn(block, 'data'))
      if (media[definition.type]) need(media[definition.type].includes(artifact.media_type))
      if (definition.media_types) need(definition.media_types.includes(artifact.media_type))
    }
  })
  return missing
}
export function emptyReport(schema) {
  validateReportSchema(schema)
  return { schema: structuredClone(schema), blocks: schema.blocks.map(block => ({ id: block.id, status: 'unavailable', message: 'Анализ не выполнен' })) }
}
export function finiteJson(value, seen = new Set()) {
  if (scalar(value)) return true
  if ((!object(value) && !Array.isArray(value)) || seen.has(value)) return false
  seen.add(value)
  const valid = Object.values(value).every(child => finiteJson(child, seen))
  seen.delete(value)
  return valid
}
