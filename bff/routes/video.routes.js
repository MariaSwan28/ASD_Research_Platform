import { materialScope } from '../services/materialAccess.js'
import UnifiedAnalysisResult from '../models/UnifiedAnalysisResult.js'
import { resolveArtifact } from '../services/artifactService.js'
import express from 'express'
const router = express.Router()
router.use(authMiddleware, requireRoles('parent', 'specialist'))
import { videoController } from '../controllers/videoController.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { requireRoles } from '../middleware/roles.middleware.js'
import { File } from '../models/index.js'
import fs from 'fs'
router.get('/stream/:fileId/:userId', requireRoles('specialist'), materialScope, async (req, res) => {
  try {
    const { fileId, userId } = req.params
    if (req.user.role !== 'specialist' || req.materialOwnerId !== userId) return res.status(403).json({ error: 'Access denied' })

    const file = await File.findOne({
      where: { _id: fileId, user: userId }
    })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    let savedArtifact = null
    const records = await UnifiedAnalysisResult.findAll({ where: { fileId, ownerId: userId }, order: [['createdAt', 'DESC']], limit: 40 })
    for (const record of records) {
      try { savedArtifact = await resolveArtifact(record, 'processed-video') } catch {}
      if (savedArtifact) break
    }
    if (!savedArtifact) return res.status(404).json({ error: 'Обработанное видео не найдено' })
    const videoPath = savedArtifact.path

    console.log('videoPath:', videoPath)
    console.log('exists:', fs.existsSync(videoPath))

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found' })
    }

    const stat = fs.statSync(videoPath)
    const fileSize = stat.size
    const range = req.headers.range

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

      // Проверка валидности диапазона
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileSize || end >= fileSize) {
        res.status(416).header('Content-Range', `bytes */${fileSize}`)
        return res.end()
      }

      const chunksize = end - start + 1

      console.log(
        `Streaming: bytes ${start}-${end}/${fileSize} (${chunksize} bytes)`
      )

      const stream = fs.createReadStream(videoPath, {
        start,
        end,
        highWaterMark: 64 * 1024 // 64KB chunks
      })

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache'
      })

      stream.on('error', err => {
        console.error('Stream error:', err)
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream error' })
        }
      })

      stream.pipe(res)
    } else {
      // Для маленьких файлов — отправляем целиком
      console.log(`Sending full file: ${fileSize} bytes`)

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      })

      const stream = fs.createReadStream(videoPath)
      stream.on('error', err => {
        console.error('Stream error:', err)
      })
      stream.pipe(res)
    }
  } catch (error) {
    console.error('Streaming error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming error' })
    }
  }
})

router.get(
  '/metadata/:fileId',
  materialScope, videoController.getVideoMetadata
)
export { router }
