import ChildProfile from '../models/ChildProfile.js'
import File from '../models/File.js'

const normalize = body => ({
  name: typeof body.name === 'string' ? body.name.trim() : '',
  birthDate: body.birthDate || null,
  notes: typeof body.notes === 'string' ? body.notes.trim() : ''
})

const childController = {
  async list(req, res) {
    try {
      const children = await ChildProfile.findAll({ where: { ownerId: req.user.id }, order: [['createdAt', 'ASC']] })
      res.json(children)
    } catch (e) { res.status(500).json({ message: 'Не удалось загрузить профили' }) }
  },
  async create(req, res) {
    try {
      const data = normalize(req.body || {})
      if (!data.name || data.name.length > 100 || data.notes.length > 2000) {
        return res.status(400).json({ message: 'Укажите имя или псевдоним (до 100 символов)' })
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
      const child = await ChildProfile.findOne({ where: { _id: req.params.id, ownerId: req.user.id } })
      if (!child) return res.status(404).json({ message: 'Профиль не найден' })
      const data = normalize(req.body || {})
      if (!data.name || data.name.length > 100 || data.notes.length > 2000) return res.status(400).json({ message: 'Некорректные данные профиля' })
      if (data.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate) || Number.isNaN(Date.parse(data.birthDate)) || new Date(data.birthDate) > new Date())) return res.status(400).json({ message: 'Некорректная дата рождения' })
      await child.update(data)
      return res.json(child)
    } catch (e) { return res.status(500).json({ message: 'Не удалось изменить профиль' }) }
  },
  async remove(req, res) {
    try {
      const child = await ChildProfile.findOne({ where: { _id: req.params.id, ownerId: req.user.id } })
      if (!child) return res.status(404).json({ message: 'Профиль не найден' })
      const associatedFiles = await File.count({ where: { user: req.user.id, childProfileId: child._id } })
      if (associatedFiles > 0) return res.status(409).json({ message: 'Сначала удалите или перенесите материалы ребёнка' })
      await child.destroy()
      return res.json({ message: 'Профиль удалён' })
    } catch (e) { return res.status(500).json({ message: 'Не удалось удалить профиль' }) }
  }
}
export default childController
