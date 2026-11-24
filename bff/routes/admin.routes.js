import Router from 'express'
import { body } from 'express-validator'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { requireRoles } from '../middleware/roles.middleware.js'
import { adminController } from '../controllers/adminController.js'
import { requestLimit } from '../middleware/requestLimit.js'
import { normalizeFullName } from '../services/fullName.js'
const router = new Router()
router.use(authMiddleware, requireRoles('admin'))
router.get('/users', adminController.users)
router.post('/users', requestLimit({ max: 20 }), body('email').isString().bail().trim().isEmail(), body('password').isString().bail().isLength({ min: 8, max: 32 }), body('role').isIn(['parent', 'specialist']), body('fullName').isString().bail().customSanitizer(normalizeFullName).isLength({ min: 2, max: 200 }), adminController.createUser)
router.patch('/users/:id/role', adminController.changeRole)
router.patch('/users/:id/profile', body('email').optional().isString().bail().trim().isEmail(), adminController.updateName)
router.patch('/users/:id', body('email').optional().isString().bail().trim().isEmail(), adminController.updateUser)
router.delete('/users/:id', adminController.removeUser)
router.get('/children', adminController.children)
router.post('/children', (req, res) => res.status(403).json({ message: 'Профили детей создают родители в своём кабинете' }))
router.patch('/children/:childId', adminController.updateChild)
router.delete('/children/:childId', adminController.removeChild)
router.put('/children/:childId/specialists', adminController.assign)
router.delete('/children/:childId/specialists/:specialistId', adminController.unassign)
export { router }
