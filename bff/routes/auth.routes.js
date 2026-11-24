import Router from 'express'
import { body } from 'express-validator'
// import authMiddleware from '../middleware/auth.middleware.js'
import { userController } from '../controllers/userController.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { normalizeFullName } from '../services/fullName.js'

const router = new Router()

router.post(
  '/registration',
  body('fullName').isString().bail().customSanitizer(normalizeFullName).isLength({ min: 2, max: 200 }),
  body('email').isEmail(),
  body('password').isLength({ min: 8, max: 32 }),
  userController.registration
)
router.post('/login', userController.login)
router.post('/logout', userController.logout)
router.get('/activate/:link', userController.activate)
router.get('/refresh', userController.refresh)
router.patch('/profile', authMiddleware, body('fullName').isString().bail().customSanitizer(normalizeFullName).isLength({ min: 2, max: 200 }), userController.updateProfile)

export { router }
