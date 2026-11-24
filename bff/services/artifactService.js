import fs from 'node:fs/promises'
import path from 'node:path'
import { CONFIG } from '../config/config.js'

export async function resolveArtifact(record, artifactId) {
  const result = typeof record.resultJson === 'string' ? JSON.parse(record.resultJson) : record.result
  const artifact = result?.artifacts?.find(item => item.id === artifactId)
  if (!artifact) return null
  const safeId = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(String(value))
  if (!safeId(record.ownerId) || !safeId(record.id)) return null
  const datasetRoot = await fs.realpath(CONFIG.DATASET_DIR)
  const root = path.join(datasetRoot, String(record.ownerId), 'runs', String(record.id))
  const canonicalRoot = await fs.realpath(root)
  if (canonicalRoot !== root) return null
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'))
  const entry = manifest[artifactId]
  if (!entry || typeof entry.path !== 'string' || entry.media_type !== artifact.media_type || path.isAbsolute(entry.path) || entry.path.split(/[\\/]/).includes('..')) return null
  const actual = await fs.realpath(path.resolve(root, entry.path))
  const relative = path.relative(canonicalRoot, actual)
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return null
  const stat = await fs.stat(actual)
  return stat.isFile() ? { path: actual, name: path.basename(actual), type: artifact.media_type } : null
}
