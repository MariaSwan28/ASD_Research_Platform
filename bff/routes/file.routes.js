import { materialScope } from '../services/materialAccess.js'
import Router from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { materialAccess } from '../middleware/roles.middleware.js'
import fileController from '../controllers/fileController.js'

const router = new Router()
router.use(authMiddleware, materialAccess)

router.post('', materialScope, fileController.createDir)
router.post('/upload', materialScope, fileController.uploadFile)

router.post('/upload/init', materialScope, fileController.initUpload)
router.post('/upload/chunk', materialScope, fileController.uploadChunk)
router.post('/upload/complete', materialScope, fileController.completeUpload)

router.post('/avatar', materialScope, fileController.uploadAvatar)
router.post('/change', materialScope, fileController.changeFileLink)
router.get('', materialScope, fileController.getFiles)
router.get('/links', materialScope, fileController.getLinks)
router.get('/download', materialScope, fileController.downloadFile)
router.get('/search', materialScope, fileController.searchFile)
router.delete('/', materialScope, fileController.deleteFile)
router.delete('/avatar', materialScope, fileController.deleteAvatar)

export { router }
