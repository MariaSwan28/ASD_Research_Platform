import { mlHeaders } from '../services/mlHeaders.js'
import fetch from 'node-fetch'
import fs from 'fs/promises'
import path from 'path'
import { File } from '../models/index.js'
import TextAnalysisResult from '../models/TextAnalysisResult.js'
import fileService from '../services/fileService.js'

const MAX_TEXT_CHARS = 20000

export const textAnalysisController = {
  async predict (req, res) {
    // Text comes from an already stored file. Ownership is checked in the DB.
    const fileId = req.body?.fileId
    if (typeof fileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(fileId)) {
      return res.status(400).json({ message: 'Укажите идентификатор текстового файла' })
    }
    const file = await File.findOne({ where: { _id: fileId, user: req.user.id } })
    if (!file) return res.status(404).json({ message: 'Файл не найден' })
    if (file.type === 'dir' || path.extname(file.name).toLowerCase() !== '.txt') {
      return res.status(400).json({ message: 'Для анализа требуется TXT-файл' })
    }
    if (file.size > 100000) return res.status(413).json({ message: 'Слишком большой текстовый файл' })
    let text
    try {
      text = await fs.readFile(fileService.getPath(file), { encoding: 'utf8', flag: 'r' })
    } catch {
      return res.status(404).json({ message: 'Содержимое файла недоступно' })
    }
    if (!text.trim() || text.length > MAX_TEXT_CHARS) {
      return res.status(400).json({ message: 'Для анализа нужен текст длиной до 20000 символов' })
    }
    const base = process.env.ML_API_URL || 'http://ml-service:5010'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
      const response = await fetch(`${base}/api/text/predict`, {
        method: 'POST',
        headers: mlHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text }),
        signal: controller.signal
      })
      const result = await response.json()
      if (!response.ok) {
        return res.status(response.status === 400 ? 422 : 503).json({
          message: result.error === 'text_has_no_known_words'
            ? 'В тексте нет слов из словаря обученной модели'
            : 'Текстовая модель пока недоступна или не смогла обработать материал',
          reason: result.reason || result.error
        })
      }
      const saved = await TextAnalysisResult.create({
        ownerId: req.user.id,
        childProfileId: file.childProfileId || null,
        fileId: file._id,
        modelId: result.model_id,
        modelVersion: result.model_version,
        resultJson: JSON.stringify(result)
      })
      return res.json({ ...result, analysisId: saved.id, childProfileId: file.childProfileId || null, fileId: file._id })
    } catch (error) {
      console.error('Text analysis request failed:', error.message)
      return res.status(503).json({ message: 'Сервис текстового анализа недоступен' })
    } finally {
      clearTimeout(timeout)
    }
  },
  async history (req, res) {
    const file = await File.findOne({ where: { _id: req.params.fileId, user: req.user.id } })
    if (!file) return res.status(404).json({ message: 'Файл не найден' })
    const records = await TextAnalysisResult.findAll({
      where: { fileId: file._id, ownerId: req.user.id },
      order: [['createdAt', 'DESC']], limit: 20
    })
    return res.json(records.map(record => ({
      id: record.id, date: record.createdAt,
      modelId: record.modelId, modelVersion: record.modelVersion,
      result: JSON.parse(record.resultJson)
    })))
  }
}
