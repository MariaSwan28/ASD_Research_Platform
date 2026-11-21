import fs from 'node:fs/promises'
import path from 'node:path'
import { constants } from 'node:fs'
import { Transaction } from 'sequelize'
import sequelize from '../DB/database.js'
import { CONFIG } from '../config/config.js'
import User from '../models/User.js'
import ChildProfile from '../models/ChildProfile.js'
import { File, Tag } from '../models/index.js'

export const MAX_FILE_BYTES = 200 * 1024 * 1024
export const CHUNK_BYTES = 512 * 1024
export const storageError = (message, status = 400) => Object.assign(new Error(message), { status })
export function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 240 || /[\\/\x00-\x1f]/.test(name) || ['.', '..'].includes(name)) throw storageError('Недопустимое имя файла')
  return name
}
export function metadata(name) {
  const ext = path.extname(name).toLowerCase()
  const types = { '.txt':['text','text/plain'], '.md':['text','text/markdown'], '.mp4':['video','video/mp4'], '.mov':['video','video/quicktime'], '.webm':['video','video/webm'], '.wav':['audio','audio/wav'], '.mp3':['audio','audio/mpeg'], '.m4a':['audio','audio/mp4'], '.flac':['audio','audio/flac'], '.ogg':['audio','audio/ogg'], '.png':['image','image/png'], '.jpg':['image','image/jpeg'], '.jpeg':['image','image/jpeg'], '.gif':['image','image/gif'], '.pdf':['document','application/pdf'], '.docx':['document','application/vnd.openxmlformats-officedocument.wordprocessingml.document'], '.csv':['table','text/csv'], '.xlsx':['table','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], '.json':['data','application/json'], '.zip':['archive','application/zip'] }
  const [materialCategory, mimeType] = types[ext] || ['other', 'application/octet-stream']
  return { materialCategory, mimeType }
}
export function ownedPath(userId, relative = '') {
  if (typeof userId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(userId)) throw storageError('Недопустимый владелец')
  const root = path.resolve(CONFIG.FILE_PATH, userId)
  const result = path.resolve(root, relative)
  const distance = path.relative(root, result)
  if (distance === '..' || distance.startsWith('..' + path.sep) || path.isAbsolute(distance)) throw storageError('Недопустимый путь файла')
  return result
}
export function tagsList(value) {
  const tags = value == null ? [] : Array.isArray(value) ? value : [value]
  if (tags.length > 20 || tags.some(x => typeof x !== 'string' || x.length > 100)) throw storageError('Недопустимые теги')
  return [...new Set(tags.map(x => x.trim()).filter(Boolean))]
}

export async function saveMaterial({ userId, name, stagedPath, expectedSize, parentId, childProfileId, tags }) {
  validateName(name)
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_FILE_BYTES) throw storageError('Недопустимый размер файла', 413)
  const tagNames = tagsList(tags)
  if ((await fs.stat(stagedPath)).size !== expectedSize) throw storageError('Размер полученного файла не совпадает с заявленным')
  let destination, copied = false
  try {
    return await sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
      const user = await User.findByPk(userId, { transaction })
      if (!user) throw storageError('Пользователь не найден', 404)
      if (Number(user.usedSpace) + expectedSize > Number(user.diskSpace)) throw storageError('Нет места на диске')
      if (childProfileId && !await ChildProfile.findOne({ where: { _id: childProfileId, ownerId: userId }, transaction })) throw storageError('Нет доступа к профилю ребёнка', 403)
      const parent = parentId ? await File.findOne({ where: { _id: parentId, user: userId, type: 'dir' }, transaction }) : null
      if (parentId && (!parent || parent.childProfileId !== (childProfileId || null))) throw storageError('Папка не найдена', 404)
      const relative = path.join(parent ? parent.path : childProfileId ? path.join('children', childProfileId) : '', name)
      destination = ownedPath(userId, relative)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      try { await fs.copyFile(stagedPath, destination, constants.COPYFILE_EXCL); copied = true } catch (error) {
        if (error.code === 'EEXIST') throw storageError('Файл уже существует')
        throw error
      }
      const file = await File.create({ name, type: path.extname(name).slice(1).toLowerCase() || 'bin', size: expectedSize,
        path: relative, user: userId, parent: parent?._id || null, childProfileId: childProfileId || null, ...metadata(name) }, { transaction })
      user.usedSpace = Number(user.usedSpace) + expectedSize
      await user.save({ transaction })
      const savedTags = []
      for (const name of tagNames) {
        const [tag] = await Tag.findOrCreate({ where: { name }, transaction }); savedTags.push(tag)
      }
      await file.setTags(savedTags, { transaction })
      return file
    })
  } catch (error) {
    if (copied) await fs.rm(destination, { force: true }).catch(() => {})
    throw error
  }
}
