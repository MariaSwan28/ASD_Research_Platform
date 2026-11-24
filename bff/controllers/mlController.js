import { accessibleFile } from '../services/materialAccess.js'
import UnifiedAnalysisResult from '../models/UnifiedAnalysisResult.js'
import AnalysisRecord from '../models/AnalysisRecord.js'
import { File, Tag } from '../models/index.js'

import path from 'path'
import fileService from '../services/fileService.js'
import fs from 'fs'

import { mlService } from '../services/mlSerivce.js'

class MLController {
  async getFeature (req, res) {
    try {
      const userId = req.materialOwnerId

      const file = await File.findOne({
        where: { _id: req.query.id, user: userId }
      })

      if (!file) {
        return res.status(404).json({
          success: false,
          message: 'Файл не найден'
        })
      }

      const jsonFileName = file.name.replace(/\.[^/.]+$/, '.json')
      console.log(jsonFileName)
      const records = await UnifiedAnalysisResult.findAll({ where: { fileId: file._id, ownerId: userId }, order: [['createdAt', 'DESC']], limit: 40 })
      const saved = records.map(record => JSON.parse(record.resultJson)).find(result => result.model?.operation === 'movement-analysis' && result.raw_output?.video_metadata)
      if (!saved) return res.status(404).json({ success: false, message: 'Сохранённый результат не найден' })
      const jsonData = saved.raw_output

      // Извлекаем ID видео
      const videoId =
        jsonData.video_metadata?.video_id ||
        file.name.replace(/\.[^/.]+$/, '') ||
        'unknown'

      // Получение предсказания от ML модели
      const classification = jsonData.classification
      const mlPrediction = classification ? { ...classification, available: true,
        probability_normal: classification.probabilities?.['0'], probability_asd: classification.probabilities?.['1'] } : { available: false }

      const response = {
        success: true,
        fileInfo: {
          id: file._id,
          name: file.name,
          jsonFileName: jsonFileName,
          videoId: videoId,
          size: file.size,
          date: file.date,
          childProfileId: file.childProfileId || null
        },
        analytics: jsonData,
        mlPrediction: mlPrediction
      }

      return res.json(response)
    } catch (e) {
      console.error('getFeature error:', e)

      if (e instanceof SyntaxError) {
        return res.status(400).json({
          success: false,
          message: 'Неверный формат JSON файла'
        })
      }

      res.status(500).json({
        success: false,
        message: 'Ошибка загрузки аналитики',
        error: process.env.NODE_ENV === 'development' ? e.message : undefined
      })
    }
  }

  async startAnalysis (req, res) {
    try {
      const { fileId } = req.params

      const file = await File.findOne({
        where: { _id: fileId, user: req.materialOwnerId }
      })

      if (!file) {
        return res.status(404).json({ error: 'File not found' })
      }

      // Проверяем, не анализируется ли уже
      const status = await mlService.getStatus()
      if (status.is_analyzing) {
        return res.status(409).json({
          error: 'Другое видео уже анализируется',
          progress: status.progress,
          current_video: status.current_video
        })
      }

      const videoPath = fileService.getPath(file)

      // Запускаем анализ (это может занять много времени!)
      const result = await mlService.movment_analyze(req.materialOwnerId, videoPath)

      if (!result || result.error) {
        return res.status(502).json({
          status: 'failed',
          error: 'ML-сервис не смог завершить анализ'
        })
      }

      file.hasAnalysis = true
      await file.save()
      await AnalysisRecord.create({
        ownerId: req.materialOwnerId, childProfileId: file.childProfileId || null,
        fileId: file._id, modelId: 'movement-video', status: 'completed'
      })

      res.json({
        status: 'completed',
        result: result
      })
    } catch (error) {
      console.error('Start analysis error:', error)

      // Если 409 - другой анализ в процессе
      if (error.message.includes('Уже выполняется')) {
        return res.status(409).json({ error: error.message })
      }

      res.status(500).json({ error: error.message })
    }
  }

  async getStatus (req, res) {
    try {
      const status = await mlService.getStatus()
      const file = status.current_file_id ? await accessibleFile(req.user, status.current_file_id) : null
      res.json({ is_analyzing:Boolean(status.is_analyzing), progress:file ? status.progress : 0,
        ...(file ? {current_file_id:file._id} : {}) })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  }
}
const mlController = new MLController()
export { mlController }
