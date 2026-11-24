import { materialScope } from '../services/materialAccess.js'
import Router from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { requireRoles } from '../middleware/roles.middleware.js'
import fileController from '../controllers/fileController.js'
import { mlController } from '../controllers/mlController.js'
import { modelRegistryController } from '../controllers/modelRegistryController.js'
import { textAnalysisController } from '../controllers/textAnalysisController.js'
import { unifiedAnalysisController } from '../controllers/unifiedAnalysisController.js'

const router = new Router()
router.use(authMiddleware, requireRoles('parent', 'specialist'))

router.get('/capabilities', materialScope, modelRegistryController.list)
router.get('/available/:fileId', materialScope, unifiedAnalysisController.available)
router.post('/analyze', materialScope, unifiedAnalysisController.analyze)
router.get('/analyses/:analysisId/artifacts/:artifactId', materialScope, unifiedAnalysisController.artifact)
router.get('/analyses/:fileId', materialScope, unifiedAnalysisController.history)
router.post('/text/predict', materialScope, textAnalysisController.predict)
router.get('/text/history/:fileId', materialScope, textAnalysisController.history)

router.post(
  '/start-analyze/:fileId',
  (req, res, next) => { req.body = { fileId: req.params.fileId, modelId: 'movement-pose-v1' }; next() },
  materialScope, unifiedAnalysisController.analyze
)
router.get('/status-analyze', materialScope, mlController.getStatus)
router.get('/feature', requireRoles('specialist'), materialScope, mlController.getFeature)

export { router }
