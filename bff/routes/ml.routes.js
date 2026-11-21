import Router from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import fileController from '../controllers/fileController.js'
import { mlController } from '../controllers/mlController.js'
import { modelRegistryController } from '../controllers/modelRegistryController.js'
import { textAnalysisController } from '../controllers/textAnalysisController.js'
import { unifiedAnalysisController } from '../controllers/unifiedAnalysisController.js'

const router = new Router()

router.get('/capabilities', authMiddleware, modelRegistryController.list)
router.get('/available/:fileId', authMiddleware, unifiedAnalysisController.available)
router.post('/analyze', authMiddleware, unifiedAnalysisController.analyze)
router.get('/analyses/:analysisId/artifacts/:artifactId', authMiddleware, unifiedAnalysisController.artifact)
router.get('/analyses/:fileId', authMiddleware, unifiedAnalysisController.history)
router.post('/text/predict', authMiddleware, textAnalysisController.predict)
router.get('/text/history/:fileId', authMiddleware, textAnalysisController.history)

router.post(
  '/start-analyze/:fileId',
  authMiddleware,
  (req, res, next) => { req.body = { fileId: req.params.fileId, modelId: 'movement-pose-v1' }; next() },
  unifiedAnalysisController.analyze
)
router.get('/status-analyze', authMiddleware, mlController.getStatus)
router.get('/feature', authMiddleware, mlController.getFeature)

export { router }
