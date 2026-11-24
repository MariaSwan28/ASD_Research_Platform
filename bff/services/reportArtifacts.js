import { resolveArtifact } from './artifactService.js'
import { validateReport } from './reportContract.js'

// Recheck files at the BFF boundary; a saved JSON reference alone is not a file.
export async function verifyReportArtifacts(result, expected) {
  if (result.schema_version !== '1.3' || result.status === 'failed') return result
  const record = { id: expected.analysisId, ownerId: expected.ownerId, result }
  const cache = new Map()
  for (let i = 0; i < result.report.blocks.length; i++) {
    const block = result.report.blocks[i]
    if (block.status !== 'ready' || !block.artifact_id) continue
    if (!cache.has(block.artifact_id)) {
      try { cache.set(block.artifact_id, Boolean(await resolveArtifact(record, block.artifact_id))) }
      catch { cache.set(block.artifact_id, false) }
    }
    if (!cache.get(block.artifact_id)) result.report.blocks[i] = { id: block.id, status: 'unavailable', message: 'Файл результата недоступен' }
  }
  if (validateReport(result.report, result.artifacts).length && result.status === 'completed') {
    result.status = 'partial'
    result.error = { code: 'incomplete_report', message: 'Не получены обязательные блоки отчёта' }
  }
  return result
}
