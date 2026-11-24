import ChildProfile from '../models/ChildProfile.js'
import ChildSpecialist from '../models/ChildSpecialist.js'
import User from '../models/User.js'
import File from '../models/File.js'
import UnifiedAnalysisResult from '../models/UnifiedAnalysisResult.js'

// The parent remains the storage owner, including materials uploaded by a specialist.
export async function accessibleChild(user, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const child = await ChildProfile.findByPk(id)
  if (!child) return null
  if (user.role === 'parent') return child.ownerId === user.id ? child : null
  if (user.role !== 'specialist') return null
  const owner = await User.findOne({ where: { _id: child.ownerId, deletedAt: null } })
  if (!owner || !await ChildSpecialist.findOne({ where: { childId: id, specialistId: user.id } })) return null
  return child
}
export async function accessibleFile(user, id) {
  if (typeof id !== 'string') return null
  const file = await File.findByPk(id)
  if (!file) return null
  if (user.role === 'parent') return file.user === user.id ? file : null
  const child = await accessibleChild(user, file.childProfileId)
  return child && child.ownerId === file.user ? file : null
}
export async function materialScope(req, res, next) {
  try {
    req.materialOwnerId = req.user.id
    if (req.user.role !== 'specialist' || req.path === '/avatar') return next()
    // Multipart upload sessions validate their creator and current assignment at every step.
    if (['/upload/chunk', '/upload/complete', '/capabilities', '/status-analyze'].includes(req.path)) return next()
    const fileRoute = req.baseUrl.endsWith('/files')
    const fileTarget = fileRoute && (['/links','/download','/change'].includes(req.path) || (req.method === 'DELETE' && req.path === '/'))
    let fileId = fileRoute ? (fileTarget ? (req.path === '/change' ? req.body?.fileId : req.query.id || req.query.fileId) : null) : req.params.fileId || req.query.id || req.body?.fileId
    if (req.params.analysisId) fileId = (await UnifiedAnalysisResult.findByPk(req.params.analysisId))?.fileId
    if (fileId) {
      const file = await accessibleFile(req.user, fileId)
      if (!file) return res.status(404).json({ message: 'Материал не найден' })
      req.materialOwnerId = file.user
      req.materialChildId = file.childProfileId
      return next()
    }
    const child = await accessibleChild(req.user, req.body?.childProfileId || req.query.childProfileId)
    if (!child) return res.status(403).json({ message: 'Выберите назначенного вам ребёнка' })
    req.materialOwnerId = child.ownerId
    req.materialChildId = child._id
    next()
  } catch (error) { next(error) }
}
