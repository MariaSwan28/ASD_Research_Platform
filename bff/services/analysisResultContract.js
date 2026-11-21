// Validate the ML boundary before a result can be marked completed or saved.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = value => typeof value === 'string' && value.trim().length > 0
const requireValue = condition => { if (!condition) throw new Error('invalid_model_result') }

function validateParameter(item) {
  requireValue(object(item) && text(item.key) && text(item.label) && text(item.type) && Object.hasOwn(item, 'value'))
  for (const key of ['unit', 'description']) requireValue(item[key] === undefined || typeof item[key] === 'string')
  const value = item.value
  if (value === null) return
  const checks = {
    string: () => typeof value === 'string',
    integer: () => Number.isInteger(value),
    number: () => typeof value === 'number' && Number.isFinite(value),
    boolean: () => typeof value === 'boolean',
    array: () => Array.isArray(value),
    object: () => object(value),
    table: () => Array.isArray(value)
  }
  if (checks[item.type]) requireValue(checks[item.type]())
  if (item.type === 'object') {
    for (const [key, child] of Object.entries(value)) {
      validateParameter(child)
      requireValue(child.key === key)
    }
  }
  if (item.type === 'table') {
    requireValue(Array.isArray(item.columns) && item.columns.length > 0)
    requireValue(item.columns.every(column => object(column) && text(column.key) && text(column.label)))
    const keys = item.columns.map(column => column.key)
    requireValue(new Set(keys).size === keys.length)
    requireValue(value.every(row => object(row) && Object.keys(row).every(key => keys.includes(key))))
  }
}

export function validateAnalysisResult(result, expected) {
  requireValue(object(result) && ['1.0', '1.1', '1.2'].includes(result.schema_version))
  requireValue(result.analysis_id === expected.analysisId && object(result.input) && result.input.file_id === expected.fileId)
  requireValue(object(result.model) && result.model.id === expected.model.id && result.model.version === expected.model.version)
  requireValue(text(result.model.name) && result.model.modality === expected.model.modality && result.input.modality === expected.model.modality)
  requireValue(result.model.operation === expected.model.operation)
  requireValue(['completed', 'partial', 'failed'].includes(result.status) && text(result.summary))
  requireValue(object(result.execution) && text(result.execution.started_at) && text(result.execution.finished_at))
  requireValue(Number.isFinite(Date.parse(result.execution.started_at)) && Number.isFinite(Date.parse(result.execution.finished_at)))
  requireValue(Number.isInteger(result.execution.duration_ms) && result.execution.duration_ms >= 0)
  requireValue(Array.isArray(result.parameters) && Array.isArray(result.artifacts) && Array.isArray(result.warnings))
  result.parameters.forEach(validateParameter)
  requireValue(new Set(result.parameters.map(item => item.key)).size === result.parameters.length)
  requireValue(result.warnings.every(item => typeof item === 'string'))
  requireValue(result.artifacts.every(item => object(item) && text(item.id) && text(item.label) && text(item.media_type) &&
    Object.keys(item).every(key => ['id', 'label', 'media_type', 'file_id'].includes(key)) &&
    (item.file_id === undefined || text(item.file_id))))
  if (['1.1', '1.2'].includes(result.schema_version)) {
    requireValue(object(result.conclusion) && ['code', 'title', 'explanation'].every(key => text(result.conclusion[key])))
    requireValue(Array.isArray(result.metrics) && Array.isArray(result.limitations) && result.limitations.every(x => typeof x === 'string'))
    result.metrics.forEach(item => {
      validateParameter(item)
      requireValue(['string', 'number', 'integer', 'boolean'].includes(item.type) && text(item.description))
    })
    requireValue(new Set(result.metrics.map(item => item.key)).size === result.metrics.length)
    requireValue(Object.hasOwn(result, 'raw_output'))
  }
  requireValue(result.status !== 'partial' || result.schema_version === '1.2')
  if (result.status === 'completed') requireValue(result.error === null)
  else requireValue(object(result.error) && text(result.error.code) && text(result.error.message) && (result.status !== 'failed' || result.parameters.length === 0))
  return result
}

export function failedAnalysisResult({ analysisId, fileId, model, startedAt }, code, message) {
  const finishedAt = new Date().toISOString()
  return {
    schema_version: '1.2', analysis_id: analysisId, status: 'failed',
    model: { id: model.id, name: model.label, version: model.version, modality: model.modality, operation: model.operation },
    input: { file_id: fileId, modality: model.modality },
    execution: { started_at: startedAt, finished_at: finishedAt, duration_ms: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) },
    conclusion: { code, title: 'Анализ не выполнен', explanation: message }, metrics: [], limitations: [], raw_output: null,
    summary: message, parameters: [], artifacts: [], warnings: [], error: { code, message }
  }
}
