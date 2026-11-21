import { saveMaterial, validateName, tagsList, MAX_FILE_BYTES, CHUNK_BYTES } from '../services/materialStorage.js'
import fileService from '../services/fileService.js'
import fs from 'fs'
import User from '../models/User.js'
import { File, Tag } from '../models/index.js'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { CONFIG } from '../config/config.js'
import sequelize from '../DB/database.js'
import { Op } from 'sequelize'
import UnifiedAnalysisResult from '../models/UnifiedAnalysisResult.js'
import TextAnalysisResult from '../models/TextAnalysisResult.js'
import { ownedChildId } from '../services/childAccess.js'

import { mlService } from '../services/mlSerivce.js'

const activeUploads = new Map()
const reapUploads = setInterval(() => {
  for (const [id, info] of activeUploads) if (!info.completing && !info.receiving.size && Date.now() - info.createdAt > 3600000) {
    cleanupTempFiles(info.tempDir); activeUploads.delete(id)
  }
}, 600000)
reapUploads.unref()

const cleanupTempFiles = tempDir => {
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  } catch (e) {
    console.error('Cleanup error:', e)
  }
}

async function withAnalysisSummary(files, ownerId) {
  const ids = files.filter(file => file.type !== 'dir').map(file => file._id)
  if (!ids.length) return files
  const where = { ownerId, fileId: { [Op.in]: ids } }
  const records = await UnifiedAnalysisResult.findAll({ where, attributes: ['fileId', 'status', 'createdAt'], order: [['createdAt', 'DESC']] })
  const old = await TextAnalysisResult.findAll({ where, attributes: ['fileId', 'createdAt'], order: [['createdAt', 'DESC']] })
  const latest = new Map()
  for (const item of [...records, ...old].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
    if (!latest.has(item.fileId)) latest.set(item.fileId, item.status || 'completed')
  }
  return files.map(file => ({ ...file.toJSON(), hasSavedAnalysis: latest.has(file._id), latestAnalysisStatus: latest.get(file._id) || null }))
}

class FileController {
  async createDir (req, res) {
    try {
      const { name, type, parent } = req.body
      validateName(name)
      if (type !== 'dir') return res.status(400).json({ message: 'Недопустимый тип папки' })
      const childProfileId = await ownedChildId(req.user.id, req.body.childProfileId)
      if (childProfileId === undefined) return res.status(403).json({ message: 'Нет доступа к профилю ребёнка' })
      const file = new File({ name, type, parent, user: req.user.id, childProfileId })
      const parentFile = parent
        ? await File.findOne({ where: { _id: parent, user: req.user.id, type: 'dir' } })
        : null
      if (parent && (!parentFile || parentFile.childProfileId !== childProfileId)) {
        return res.status(404).json({ message: 'Родительская папка не найдена' })
      }
      if (!parentFile) {
        file.path = name
        await fileService.createDir(file)
      } else {
        parentFile.childs = file._id
        await parentFile.save()
        file.path = path.join(parentFile.path, file.name)
        await fileService.createDir(file)
      }
      await file.save()
      console.log('create dir done')
      return res.json(file)
    } catch (e) {
      console.log('create dir error', e)
      return res.status(400).json(e)
    }
  }

  async getFiles (req, res) {
    try {
      const { sort } = req.query
      const childProfileId = await ownedChildId(req.user.id, req.query.childProfileId)
      if (childProfileId === undefined) return res.status(403).json({ message: 'Нет доступа к профилю ребёнка' })
      let files
      switch (sort) {
        case 'name':
          files = await File.findAll({
            where: {
              user: req.user.id,
              childProfileId,
              parent: req.query.parent ? req.query.parent : null
            },
            order: [['name', 'ASC']],
            include: {
              model: Tag,
              as: 'tags',
              attributes: ['name'],
              through: { attributes: [] }
            }
          })
          break
        case 'type':
          files = await File.findAll({
            where: {
              user: req.user.id,
              childProfileId,
              parent: req.query.parent ? req.query.parent : null
            },
            order: [['type', 'ASC']],
            include: {
              model: Tag,
              as: 'tags',
              attributes: ['name'],
              through: { attributes: [] }
            }
          })
          break
        case 'date':
          files = await File.findAll({
            where: {
              user: req.user.id,
              childProfileId,
              parent: req.query.parent ? req.query.parent : null
            },
            order: [['date', 'ASC']],
            include: {
              model: Tag,
              as: 'tags',
              attributes: ['name'],
              through: { attributes: [] }
            }
          })
          break
        default:
          files = await File.findAll({
            where: {
              user: req.user.id,
              childProfileId,
              parent: req.query.parent ? req.query.parent : null
            },
            include: {
              model: Tag,
              as: 'tags',
              attributes: ['name'],
              through: { attributes: [] }
            }
          })
          break
      }
      console.log('get Files done')
      return res.json(await withAnalysisSummary(files, req.user.id))
    } catch (e) {
      console.log('get Files error', e)
      return res.status(500).json({ message: 'Can not get files' })
    }
  }

  async getLinks (req, res) {
    try {
      console.log('Получено содержимое .txt')
      const file = await File.findOne({
        where: { _id: req.query.fileId, user: req.user.id }
      })
      if (!file) return res.status(404).json({ message: 'Файл не найден' })
      const pathToFile = fileService.getPath(file)
      fs.readFile(pathToFile, 'utf-8', (err, data) => {
        if (err) {
          console.log(`Can't read file`)
        }
        const obj = JSON.parse(data)
        const arr = []
        Object.entries(obj).forEach(([key, value]) => {
          if (value.type === 'linkNested') {
            arr.push({ name: key, content: value.content })
          }
        })
        console.log('get Links done')
        return res.json(arr)
      })
    } catch (e) {
      return res.status(500).json({ message: 'Can not get files' })
    }
  }

  async initUpload (req, res) {
    try {
      const { fileName, fileSize, totalChunks, parent, tags } = req.body
      validateName(fileName)
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES ||
          !Number.isSafeInteger(totalChunks) || totalChunks !== Math.ceil(fileSize / CHUNK_BYTES)) {
        return res.status(400).json({ message: 'Неверный размер файла или число частей' })
      }
      if ([...activeUploads.values()].filter(x => x.user === req.user.id).length >= 3) return res.status(429).json({ message: 'Слишком много незавершённых загрузок' })
      const childProfileId = await ownedChildId(req.user.id, req.body.childProfileId)
      if (childProfileId === undefined) return res.status(403).json({ message: 'Нет доступа к профилю ребёнка' })
      const user = await User.findByPk(req.user.id)
      if (!user || Number(user.usedSpace) + fileSize > Number(user.diskSpace)) return res.status(400).json({ message: 'Нет места на диске' })
      const folder = parent ? await File.findOne({ where: { _id: parent, user: req.user.id, type: 'dir' } }) : null
      if (parent && (!folder || folder.childProfileId !== childProfileId)) return res.status(404).json({ message: 'Папка не найдена' })
      const uploadId = uuidv4()
      const tempDir = path.join(CONFIG.FILE_PATH, 'temp', uploadId)
      fs.mkdirSync(tempDir, { recursive: true })
      activeUploads.set(uploadId, { fileName, fileSize, totalChunks, uploadedChunks: new Set(), receiving: new Set(),
        parent: parent || null, user: req.user.id, tags: tagsList(tags), childProfileId, tempDir, createdAt: Date.now(), completing: false })
      return res.json({ uploadId })
    } catch (error) { return res.status(error.status || 400).json({ message: error.status ? error.message : 'Не удалось начать загрузку' }) }
  }

  async uploadChunk (req, res) {
    const { uploadId, chunkIndex } = req.body
    const info = activeUploads.get(uploadId)
    if (!info || info.user !== req.user.id) return res.status(404).json({ message: 'Загрузка не найдена' })
    const index = Number(chunkIndex), chunk = req.files?.chunk
    if (!/^(0|[1-9][0-9]*)$/.test(String(chunkIndex)) || !Number.isSafeInteger(index) || index < 0 || index >= info.totalChunks || !chunk || Array.isArray(chunk)) return res.status(400).json({ message: 'Некорректная часть файла' })
    if (info.completing || info.receiving.has(index)) return res.status(409).json({ message: 'Часть файла уже обрабатывается' })
    const expected = index === info.totalChunks - 1 ? info.fileSize - CHUNK_BYTES * index : CHUNK_BYTES
    if (chunk.size !== expected || chunk.truncated) return res.status(400).json({ message: 'Неверный размер части файла' })
    if (info.uploadedChunks.has(index)) return res.json({ uploaded: info.uploadedChunks.size, total: info.totalChunks })
    info.receiving.add(index)
    try {
      await chunk.mv(path.join(info.tempDir, `chunk_${index}`))
      info.uploadedChunks.add(index); info.createdAt = Date.now()
      return res.json({ uploaded: info.uploadedChunks.size, total: info.totalChunks })
    } catch { return res.status(500).json({ message: 'Не удалось сохранить часть файла' }) }
    finally { info.receiving.delete(index) }
  }

  async completeUpload (req, res) {
    const info = activeUploads.get(req.body.uploadId)
    if (!info || info.user !== req.user.id) return res.status(404).json({ message: 'Загрузка не найдена' })
    if (info.completing || info.receiving.size) return res.status(409).json({ message: 'Загрузка ещё выполняется' })
    if (info.uploadedChunks.size !== info.totalChunks) return res.status(400).json({ message: 'Не все части загружены' })
    info.completing = true
    const combined = path.join(info.tempDir, 'combined')
    try {
      const output = await fs.promises.open(combined, 'wx')
      try {
        for (let i = 0; i < info.totalChunks; i++) await output.writeFile(await fs.promises.readFile(path.join(info.tempDir, `chunk_${i}`)))
      } finally { await output.close() }
      const file = await saveMaterial({ userId: req.user.id, name: info.fileName, stagedPath: combined, expectedSize: info.fileSize,
        parentId: info.parent, childProfileId: info.childProfileId, tags: info.tags })
      return res.json(file)
    } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не удалось сохранить файл' }) }
    finally { cleanupTempFiles(info.tempDir); activeUploads.delete(req.body.uploadId) }
  }

  async uploadFile (req, res) {
    const file = req.files?.file
    if (!file || Array.isArray(file) || file.truncated) return res.status(400).json({ message: 'Файл не передан или превышает ограничение' })
    const staged = path.join(CONFIG.FILE_PATH, 'temp', uuidv4())
    try {
      validateName(file.name)
      const childProfileId = await ownedChildId(req.user.id, req.body.childProfileId)
      if (childProfileId === undefined) return res.status(403).json({ message: 'Нет доступа к профилю ребёнка' })
      fs.mkdirSync(path.dirname(staged), { recursive: true })
      await file.mv(staged)
      const saved = await saveMaterial({ userId: req.user.id, name: file.name, stagedPath: staged, expectedSize: file.size,
        parentId: req.body.parent || null, childProfileId, tags: req.body.tags })
      return res.json(saved)
    } catch (error) { return res.status(error.status || 500).json({ message: error.status ? error.message : 'Не удалось сохранить файл' }) }
    finally { await fs.promises.rm(staged, { force: true }).catch(() => {}) }
  }

  async downloadFile (req, res) {
    try {
      const file = await File.findOne({
        where: { _id: req.query.id, user: req.user.id }
      })
      if (!file) return res.status(404).json({ message: 'Файл не найден' })
      const path = fileService.getPath(file)
      if (fs.existsSync(path)) {
        return res.download(path, file.name)
      }
      console.log('download File done')
      return res.status(400).json({ message: 'Ошибка скачивания' })
    } catch (e) {
      console.log('download File error', e)
      res.status(500).json({ message: 'Ошибка скачивания файла' })
    }
  }

  async deleteFile (req, res) {
    try {
      const file = await File.findOne({
        where: { _id: req.query.id, user: req.user.id }
      })
      if (!file) {
        return res.status(404).json({ message: 'Файл не найден' })
      }
      const user = await User.findOne({
        where: { _id: req.user.id }
      })
      if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' })
      }
      // Quota changes only after the filesystem deletion succeeds.
      fileService.deleteFile(file)
      await sequelize.transaction(async transaction => {
        await user.reload({ transaction })
        user.usedSpace = Math.max(0, Number(user.usedSpace) - Number(file.size))
        await user.save({ transaction })
        await file.destroy({ transaction })
      })
      const records = await UnifiedAnalysisResult.findAll({ where: { ownerId: req.user.id, fileId: file._id } })
      for (const record of records) await fs.promises.rm(path.join(CONFIG.DATASET_DIR, req.user.id, 'runs', record.id), { force: true, recursive: true }).catch(() => {})
      await UnifiedAnalysisResult.destroy({ where: { ownerId: req.user.id, fileId: file._id } })
      await TextAnalysisResult.destroy({ where: { ownerId: req.user.id, fileId: file._id } })
      console.log('delete File done')
      return res.json({ message: 'Файл был удалён' })
    } catch (e) {
      console.log('delete File error', e)
      return res.status(400).json({ message: 'Dir is not empty' })
    }
  }

  async changeFileLink (req, res) {
    try {
      for (const key of ['linkName', 'linkNameOld']) if (req.body[key] != null && (typeof req.body[key] !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(req.body[key]) || req.body[key].length > 240)) return res.status(400).json({ message: 'Недопустимое имя ссылки' })
      const file = await File.findOne({
        where: { _id: req.body.fileId, user: req.user.id }
      })
      if (!file) {
        return res.status(400).json({ message: 'Файл не найден' })
      }
      const path = fileService.getPath(file)
      if (req.body.type === 'add') {
        fileService.addFileLink(path, req.body.linkName, req.body.link)
        return res.json({ message: 'link was added' })
      } else if (req.body.type === 'change') {
        fileService.changeFileLink(
          path,
          req.body.linkNameOld,
          req.body.linkName,
          req.body.link,
          arr => {
            res.json(arr)
          }
        )
      } else {
        fileService.deleteFileLink(path, JSON.parse(req.body.link).name)
        return res.json({ message: 'link was deleted' })
      }
    } catch (e) {
      console.log('delete link error', e)
      return res.status(400).json({ message: 'delete link error' })
    }
  }

  async searchFile (req, res) {
    try {
      const searchName = req.query.search
      let files = await File.findAll({
        where: { user: req.user.id }
      })
      files = files.filter(file => file.name.includes(searchName))
      console.log('search File done')
      return res.json(await withAnalysisSummary(files, req.user.id))
    } catch (e) {
      console.log('search File error', e)
      return res.status(400).json({ message: 'Search error' })
    }
  }

  async uploadAvatar (req, res) {
    try {
      const file = req.files?.file
      if (!file || Array.isArray(file) || file.size > 2 * 1024 * 1024 || file.truncated) return res.status(400).json({ message: 'Выберите изображение JPEG или PNG до 2 МБ' })
      const bytes = file.tempFilePath ? await fs.promises.readFile(file.tempFilePath) : file.data
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      if (!png && !jpeg) return res.status(400).json({ message: 'Поддерживаются JPEG и PNG' })
      const user = await User.findByPk(req.user.id)
      const avatarName = uuidv4() + (png ? '.png' : '.jpg')
      await fs.promises.mkdir(CONFIG.STATIC_PATH, { recursive: true })
      await file.mv(path.join(CONFIG.STATIC_PATH, avatarName))
      user.avatar = avatarName
      await user.save()
      console.log('upload Avatar done')
      return res.json({ id: user._id, _id: user._id, email: user.email, avatar: user.avatar, usedSpace: user.usedSpace, diskSpace: user.diskSpace, isActivated: user.isActivated, date: user.date, gender: user.gender })
    } catch (e) {
      console.log('upload Avatar error', e)
      return res
        .status(400)
        .json({ message: 'При загрузке аватара произошла ошибка' })
    }
  }

  async deleteAvatar (req, res) {
    try {
      const user = await User.findByPk(req.user.id)
      fs.unlinkSync(path.join(CONFIG.STATIC_PATH, user.avatar))
      user.avatar = null
      await user.save()
      console.log('delete Avatar done')
      return res.json({ id: user._id, _id: user._id, email: user.email, avatar: user.avatar, usedSpace: user.usedSpace, diskSpace: user.diskSpace, isActivated: user.isActivated, date: user.date, gender: user.gender })
    } catch (e) {
      console.log('delete Avatar error', e)
      return res
        .status(400)
        .json({ message: 'При удалении аватара произошла ошибка' })
    }
  }
}

export default new FileController()
