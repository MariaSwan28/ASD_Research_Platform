import { accessibleChild } from '../services/materialAccess.js'
import ChildProfile from '../models/ChildProfile.js'
import File from '../models/File.js'
import User from '../models/User.js'
import ChildSpecialist from '../models/ChildSpecialist.js'
import { Op } from 'sequelize'
import { normalizeFullName, validFullName } from '../services/fullName.js'

const normalize = body => ({
  fullName: normalizeFullName(body.fullName),
  name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : normalizeFullName(body.fullName).slice(0, 100),
  birthDate: body.birthDate || null,
  notes: typeof body.notes === 'string' ? body.notes.trim() : ''
})

const childController = {
  async list(req, res) {
    try {
      let where = { ownerId: req.user.id }
      let attributes
      if (req.user.role === 'specialist') {
        const links = await ChildSpecialist.findAll({ where: { specialistId: req.user.id } })
        const owners = await User.findAll({ where: { deletedAt: null }, attributes: ['_id'] })
        where = { _id: { [Op.in]: links.map(link => link.childId) }, ownerId: { [Op.in]: owners.map(user => user._id) } }
        attributes = undefined
      }
      const children = await ChildProfile.findAll({ where, attributes, order: [['createdAt', 'ASC']] })
      if (req.user.role === 'specialist') return res.json(children)
      const ids = children.map(child => child._id)
      const links = await ChildSpecialist.findAll({ where: { childId: { [Op.in]: ids } } })
      const specialists = await User.findAll({ where: { _id: { [Op.in]: links.map(link => link.specialistId) }, role: 'specialist', deletedAt: null }, attributes: ['_id', 'email', 'fullName'] })
      res.json(children.map(child => ({ ...child.toJSON(), specialists: links.filter(link => link.childId === child._id).map(link => specialists.find(user => user._id === link.specialistId)).filter(Boolean).map(user => ({ id: user._id, email: user.email, fullName: user.fullName })) })))
    } catch (e) { res.status(500).json({ message: 'Не удалось загрузить профили' }) }
  },
  async detail(req, res) {
    try {
      const child = await accessibleChild(req.user, req.params.id)
      if (!child) return res.status(404).json({ message: 'Профиль не найден' })
      res.json(child)
    } catch { res.status(500).json({ message: 'Не удалось загрузить профиль' }) }
  },
  async create(req, res) {
    try {
      const data = normalize(req.body || {})
      if (!validFullName(data.fullName) || !data.name || data.name.length > 100 || data.notes.length > 2000) {
        return res.status(400).json({ message: 'Укажите ФИО ребёнка (от 2 до 200 символов); имя в кабинете — до 100 символов' })
      }
      if (data.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate) || Number.isNaN(Date.parse(data.birthDate)) || new Date(data.birthDate) > new Date())) {
        return res.status(400).json({ message: 'Некорректная дата рождения' })
      }
      const child = await ChildProfile.create({ ...data, ownerId: req.user.id })
      res.status(201).json(child)
    } catch (e) { res.status(500).json({ message: 'Не удалось создать профиль' }) }
  },
  async update(req, res) {
    try {
      const child = await accessibleChild(req.user, req.params.id)
      if (!child) return res.status(404).json({ message: 'Профиль не найден' })
      const data = normalize(req.body || {})
      if (!validFullName(data.fullName) || !data.name || data.name.length > 100 || data.notes.length > 2000) return res.status(400).json({ message: 'Некорректные данные профиля' })
      if (data.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate) || Number.isNaN(Date.parse(data.birthDate)) || new Date(data.birthDate) > new Date())) return res.status(400).json({ message: 'Некорректная дата рождения' })
      await child.update(data)
      return res.json(child)
    } catch (e) { return res.status(500).json({ message: 'Не удалось изменить профиль' }) }
  },
  async remove(req, res) {
    try {
      const child = await accessibleChild(req.user, req.params.id)
      if (!child) return res.status(404).json({ message: 'Профиль не найден' })
      const associatedFiles = await File.count({ where: { user: child.ownerId, childProfileId: child._id } })
      if (associatedFiles > 0) return res.status(409).json({ message: 'Сначала удалите или перенесите материалы ребёнка' })
      await child.destroy()
      return res.json({ message: 'Профиль удалён' })
    } catch (e) { return res.status(500).json({ message: 'Не удалось удалить профиль' }) }
  }
}
export default childController
