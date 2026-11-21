import Router from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import childController from '../controllers/childController.js'

const router = new Router()
router.use(authMiddleware)
router.get('/', childController.list)
router.post('/', childController.create)
router.patch('/:id', childController.update)
router.delete('/:id', childController.remove)
export { router }
