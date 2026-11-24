import Router from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import childController from '../controllers/childController.js'
import { requireRoles } from '../middleware/roles.middleware.js'

const router = new Router()
router.use(authMiddleware, requireRoles('parent', 'specialist'))
router.get('/', childController.list)
router.get('/:id', childController.detail)
router.post('/', requireRoles('parent'), childController.create)
router.patch('/:id', childController.update)
router.delete('/:id', childController.remove)
export { router }
