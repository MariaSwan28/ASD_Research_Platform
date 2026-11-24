import bcrypt from 'bcryptjs'
import { validationResult } from 'express-validator'
import { Op } from 'sequelize'
import sequelize from '../DB/database.js'
import User from '../models/User.js'
import ChildProfile from '../models/ChildProfile.js'
import ChildSpecialist from '../models/ChildSpecialist.js'
import File from '../models/File.js'
import { Token } from '../models/Token.js'
import AnalysisRecord from '../models/AnalysisRecord.js'
import UnifiedAnalysisResult from '../models/UnifiedAnalysisResult.js'
import TextAnalysisResult from '../models/TextAnalysisResult.js'
import { normalizeFullName, validFullName } from '../services/fullName.js'

const publicUser = user => ({ id: user._id, email: user.email, fullName: user.fullName, role: user.role })
const failure = (res, error, message) => res.status(error.name === 'SequelizeUniqueConstraintError' ? 409 : 500).json({ message: error.name === 'SequelizeUniqueConstraintError' ? 'Почта уже используется другой учётной записью' : message })
const reply = (res, result) => result.error ? res.status(result.status).json({ message: result.error }) : res.status(result.status || 200).json(result.data)
const invalid = (status, error) => ({ status, error })
const validBirthDate = value => !value || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10))

export const adminController = {
  async users(req, res) {
    try {
      const users = await User.findAll({ where: { deletedAt: null, role: { [Op.in]: ['parent', 'specialist'] } }, attributes: ['_id', 'email', 'fullName', 'role'], order: [['fullName', 'ASC'], ['email', 'ASC']] })
      const owners = await User.findAll({ where: { deletedAt: null }, attributes: ['_id'] })
      const children = await ChildProfile.findAll({ where: { ownerId: { [Op.in]: owners.map(user => user._id) } }, attributes: ['_id', 'ownerId'] })
      const links = await ChildSpecialist.findAll({ where: { childId: { [Op.in]: children.map(child => child._id) } } })
      res.json(users.map(user => ({ ...publicUser(user), childCount: user.role === 'parent' ? children.filter(child => child.ownerId === user._id).length : links.filter(link => link.specialistId === user._id).length })))
    } catch (e) { failure(res, e, 'Не удалось загрузить пользователей') }
  },
  async createUser(req, res) {
    try {
      if (!validationResult(req).isEmpty()) return res.status(400).json({ message: 'Укажите ФИО, корректную почту, пароль от 8 до 32 символов и роль родителя или специалиста' })
      const { email, password, fullName, role } = req.body
      const user = await User.create({ email, password: await bcrypt.hash(password, 15), fullName, role })
      res.status(201).json(publicUser(user))
    } catch (e) { failure(res, e, 'Не удалось создать пользователя') }
  },
  async updateUser(req, res) {
    try {
      const fullName = normalizeFullName(req.body?.fullName)
      if (!validFullName(fullName) || !validationResult(req).isEmpty()) return res.status(400).json({ message: 'Укажите ФИО от 2 до 200 символов и корректную почту' })
      const user = await User.findOne({ where: { _id: req.params.id, deletedAt: null } })
      if (!user) return res.status(404).json({ message: 'Пользователь не найден' })
      if (user.role === 'admin') return res.status(403).json({ message: 'Профиль администратора изменяется в личном кабинете' })
      const values = { fullName }
      if (req.body.email !== undefined) values.email = req.body.email
      // Ownership, role, password and archive state cannot be changed by profile updates.
      await user.update(values)
      res.json(publicUser(user))
    } catch (e) { failure(res, e, 'Не удалось сохранить пользователя') }
  },
  async updateName(req, res) { return adminController.updateUser(req, res) },
  async removeUser(req, res) {
    try {
      const result = await sequelize.transaction(async transaction => {
        const user = await User.findByPk(req.params.id, { transaction })
        if (!user || user.deletedAt) return invalid(404, 'Пользователь не найден')
        if (user.role === 'admin') return invalid(403, 'Администратора нельзя удалить из этого раздела')
        const children = await ChildProfile.findAll({ where: { ownerId: user._id }, attributes: ['_id'], transaction })
        await ChildSpecialist.destroy({ where: { [Op.or]: [{ specialistId: user._id }, { childId: { [Op.in]: children.map(child => child._id) } }] }, transaction })
        await Token.destroy({ where: { userId: user._id }, transaction })
        await user.update({ deletedAt: new Date() }, { transaction })
        return { data: { message: 'Учётная запись удалена из рабочих списков. Вход закрыт, назначения сняты.' } }
      })
      reply(res, result)
    } catch (e) { failure(res, e, 'Не удалось удалить пользователя') }
  },
  async changeRole(req, res) {
    const role = req.body?.role
    if (!['parent', 'specialist'].includes(role)) return res.status(400).json({ message: 'Выберите роль родителя или специалиста' })
    try {
      const result = await sequelize.transaction(async transaction => {
        const user = await User.findOne({ where: { _id: req.params.id, deletedAt: null }, transaction })
        if (!user) return invalid(404, 'Пользователь не найден')
        if (user.role === 'admin') return invalid(403, 'Роль администратора здесь изменить нельзя')
        if (user.role === role) return { data: publicUser(user) }
        if (role === 'specialist' && (await ChildProfile.count({ where: { ownerId: user._id }, transaction }) || await File.count({ where: { user: user._id, type: { [Op.ne]: 'dir' } }, transaction }))) return invalid(409, 'У пользователя есть профили или материалы. Создайте отдельную учётную запись специалиста.')
        if (role === 'parent' && await ChildSpecialist.count({ where: { specialistId: user._id }, transaction })) return invalid(409, 'Сначала снимите все назначения этого специалиста')
        await user.update({ role }, { transaction })
        return { data: publicUser(user) }
      })
      reply(res, result)
    } catch (e) { failure(res, e, 'Не удалось изменить роль') }
  },
  async children(req, res) {
    try {
      const users = new Map((await User.findAll({ where: { deletedAt: null }, attributes: ['_id', 'email', 'fullName', 'role'] })).map(user => [user._id, publicUser(user)]))
      const children = await ChildProfile.findAll({ where: { ownerId: { [Op.in]: [...users.keys()] } }, attributes: ['_id', 'ownerId', 'name', 'fullName', 'birthDate'], order: [['fullName', 'ASC'], ['createdAt', 'ASC']] })
      const links = await ChildSpecialist.findAll({ attributes: ['childId', 'specialistId'] })
      res.json(children.map(child => ({ ...child.toJSON(), ownerEmail: users.get(child.ownerId)?.email || '', ownerFullName: users.get(child.ownerId)?.fullName || '', specialists: links.filter(link => link.childId === child._id && users.get(link.specialistId)?.role === 'specialist').map(link => users.get(link.specialistId)) })))
    } catch (e) { failure(res, e, 'Не удалось загрузить профили') }
  },
  async updateChild(req, res) {
    const fullName = normalizeFullName(req.body?.fullName)
    const birthDate = req.body?.birthDate || null
    if (!validFullName(fullName) || !validBirthDate(birthDate)) return res.status(400).json({ message: 'Укажите ФИО ребёнка и корректную дату рождения' })
    try {
      const result = await sequelize.transaction(async transaction => {
        const child = await ChildProfile.findByPk(req.params.childId, { transaction })
        if (!child || !await User.findOne({ where: { _id: child.ownerId, deletedAt: null }, transaction })) return invalid(404, 'Профиль не найден')
        if (req.body.ownerId && req.body.ownerId !== child.ownerId) return invalid(409, 'Изменение владельца профиля пока не поддерживается')
        await child.update({ fullName, name: fullName.slice(0, 100), ...(Object.hasOwn(req.body, 'birthDate') ? { birthDate } : {}) }, { transaction })
        // Private parent notes are neither returned nor overwritten.
        return { data: { _id: child._id, fullName: child.fullName, birthDate: child.birthDate, ownerId: child.ownerId } }
      })
      reply(res, result)
    } catch (e) { failure(res, e, 'Не удалось изменить профиль ребёнка') }
  },
  async removeChild(req, res) {
    try {
      const result = await sequelize.transaction(async transaction => {
        const child = await ChildProfile.findByPk(req.params.childId, { transaction })
        if (!child || !await User.findOne({ where: { _id: child.ownerId, deletedAt: null }, transaction })) return invalid(404, 'Профиль не найден')
        await File.update({ childProfileId: null }, { where: { childProfileId: child._id, user: child.ownerId }, transaction })
        for (const Model of [AnalysisRecord, UnifiedAnalysisResult, TextAnalysisResult]) await Model.update({ childProfileId: null }, { where: { childProfileId: child._id, ownerId: child.ownerId }, transaction })
        await ChildSpecialist.destroy({ where: { childId: child._id }, transaction })
        await child.destroy({ transaction })
        return { data: { message: 'Профиль удалён. Материалы и результаты сохранены в общих материалах родителя.' } }
      })
      reply(res, result)
    } catch (e) { failure(res, e, 'Не удалось удалить профиль ребёнка') }
  },
  async assign(req, res) {
    try {
      if (typeof req.body?.specialistId !== 'string') return res.status(400).json({ message: 'Выберите специалиста' })
      const result = await sequelize.transaction(async transaction => {
        const child = await ChildProfile.findByPk(req.params.childId, { transaction })
        if (!child || !await User.findOne({ where: { _id: child.ownerId, deletedAt: null }, transaction })) return invalid(404, 'Профиль не найден')
        const user = await User.findOne({ where: { _id: req.body.specialistId, role: 'specialist', deletedAt: null }, transaction })
        if (!user) return invalid(400, 'Назначить можно только действующего специалиста')
        await ChildSpecialist.findOrCreate({ where: { childId: child._id, specialistId: user._id }, defaults: { assignedBy: req.user.id }, transaction })
        return { data: { message: 'Специалист назначен' } }
      })
      reply(res, result)
    } catch (e) { failure(res, e, 'Не удалось назначить специалиста') }
  },
  async unassign(req, res) {
    try { await ChildSpecialist.destroy({ where: { childId: req.params.childId, specialistId: req.params.specialistId } }); res.json({ message: 'Назначение снято' }) }
    catch (e) { failure(res, e, 'Не удалось снять назначение') }
  }
}
