import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { File } from '../models/index.js'
import fileService from '../services/fileService.js'
const execute = promisify(execFile)

export const videoController = {
  async getVideoMetadata(req, res) {
    const file = await File.findOne({ where: { _id: req.params.fileId, user: req.user.id } })
    if (!file) return res.status(404).json({ error: 'File not found' })
    try {
      const result = await execute('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', fileService.getPath(file)], { timeout: 15000, maxBuffer: 32768 })
      const seconds = Number(JSON.parse(result.stdout).format?.duration)
      return res.json({ name: file.name, size: file.size, mimeType: file.mimeType, duration: Number.isFinite(seconds) ? seconds : null })
    } catch { return res.json({ name: file.name, size: file.size, mimeType: file.mimeType, duration: null }) }
  }
}
