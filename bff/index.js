import fs from 'node:fs/promises'
import { authMiddleware } from './middleware/auth.middleware.js'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import { migrateStorage } from './services/storageMigration.js'
import { migrateRoles } from './services/roleMigration.js'
import { migrateNames } from './services/nameMigration.js'
import { migrateAdministration } from './services/adminMigration.js'
import { router as adminRouter } from './routes/admin.routes.js'
import { materialAccess } from './middleware/roles.middleware.js'
import { requestLimit } from './middleware/requestLimit.js'
import express from 'express'
import fileUpload from 'express-fileupload'
import cookieParser from 'cookie-parser'
import { router as authRouter } from './routes/auth.routes.js'
import { router as fileRouter } from './routes/file.routes.js'
import { router as videoRouter } from './routes/video.routes.js'
import { router as mlRouter } from './routes/ml.routes.js'
import { router as childRouter } from './routes/child.routes.js'
import ChildProfile from './models/ChildProfile.js'
import AnalysisRecord from './models/AnalysisRecord.js'
import TextAnalysisResult from './models/TextAnalysisResult.js'
import UnifiedAnalysisResult from './models/UnifiedAnalysisResult.js'
import File from './models/File.js'
import sequelize from './DB/database.js'
import { errorHandler } from './middleware/errorMiddleware.js'
import { CONFIG } from './config/config.js'
import cors from 'cors'
import { userService } from './services/userService.js'

console.log(CONFIG.VERSION)

if (CONFIG.IS_PROD && (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32 ||
    !process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32 || process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET)) {
  throw new Error('Set independent JWT secrets (at least 32 characters)')
}
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next() })
app.get('/health', (req, res) => res.json({ status: 'ok' }))
app.use('/api/auth/login', requestLimit())
app.use('/api/auth/registration', requestLimit({ max: 10 }))
app.use('/api/ml/analyze', requestLimit({ max: 12, windowMs: 600000 }))
const PORT = CONFIG.PORT

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:3000,http://localhost:3000').split(',').map(value => value.trim()).filter(Boolean)

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)

    if (!CONFIG.IS_PROD || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(null, false) // Не блокируем, а просто запрещаем
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Range',
    'Origin',
    'X-Requested-With',
    'Accept'
  ],
  exposedHeaders: [
    'Content-Range',
    'Accept-Ranges',
    'Content-Length',
    'Content-Type'
  ],
  credentials: true,
  optionsSuccessStatus: 200
}

// app.use(cors(corsOptions))

// Дополнительный middleware для видео запросов
app.use('/api/video', (req, res, next) => {
  // Разрешаем все заголовки для видео
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')

  // Для preflight запросов
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Range, Authorization, Content-Type'
    )
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(200).end()
  }
  next()
})

app.use(cors(corsOptions))
// app.use(cors({
//     origin: true,
//     credentials: true
// }));
app.use('/api/files', authMiddleware, materialAccess,
  fileUpload({
    limits: { fileSize: 200 * 1024 * 1024 },
    abortOnLimit: true, useTempFiles: true, tempFileDir: '/tmp/asd-uploads',
    defCharset: 'utf8',
    defParamCharset: 'utf8'
  })
)
// app.use(corsMiddleware)
app.use((req, res, next) => {
  const cleanup = () => {
    for (const value of Object.values(req.files || {})) for (const file of Array.isArray(value) ? value : [value]) {
      if (file.tempFilePath) fs.rm(file.tempFilePath, { force: true }).catch(() => {})
    }
  }
  res.once('finish', cleanup)
  next()
})
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(express.static(CONFIG.STATIC_PATH || 'static'))
app.use(express.static('public'))
app.use('/api/auth', authRouter)
app.use('/api/files', fileRouter)
app.use('/api/children', childRouter)
app.use('/api/admin', adminRouter)
app.use('/api/video', videoRouter)
app.use(`/api/ml`, mlRouter)
app.use(errorHandler)

const start = async () => {
  try {
    if (!CONFIG.FILE_PATH || !CONFIG.DATASET_DIR || !CONFIG.DB_PATH) throw new Error('Storage paths are required')
    await fs.mkdir(CONFIG.FILE_PATH, { recursive: true })
    // Upload sessions are in-memory: stale parts cannot be resumed after restart.
    await fs.rm(CONFIG.FILE_PATH + '/temp', { recursive: true, force: true })
    await fs.rm('/tmp/asd-uploads', { recursive: true, force: true })
    // Программная миграция только добавляемого nullable-поля SQLite.
    // Не применять sync({ alter: true }) к пользовательской БД.
    const tables = await sequelize.getQueryInterface().showAllTables()
    if (tables.includes('Files')) {
      const schema = await sequelize.getQueryInterface().describeTable('Files')
      if (!schema.childProfileId) {
        await sequelize.getQueryInterface().addColumn('Files', 'childProfileId', { type: 'UUID', allowNull: true })
      }
    }
    await migrateRoles(sequelize)
    await migrateNames(sequelize)
    await migrateAdministration(sequelize)
    await migrateStorage(sequelize)
    console.log('DB is start')
    await sequelize.query('PRAGMA journal_mode = WAL;')
    await sequelize.query('PRAGMA synchronous = NORMAL;')
    await sequelize.query('PRAGMA busy_timeout = 5000;') // Ожидание 5 сек вместо ошибки
    const legacyAdmin = await User.findOne({ where: { email: 'admin@mail.ru' } })
    if (legacyAdmin && await bcrypt.compare('!oRka12*', legacyAdmin.password)) {
      if (!CONFIG.SUPREUSER_PASS) throw new Error('Rotate the legacy admin password via SUPREUSER_PASS')
      legacyAdmin.password = await bcrypt.hash(CONFIG.SUPREUSER_PASS, 15)
      await legacyAdmin.save()
    }
    if (CONFIG.SUPERUSER_LOGIN && CONFIG.SUPREUSER_PASS) {
      const existing = await User.findOne({ where: { email: CONFIG.SUPERUSER_LOGIN } })
      if (!existing) await userService.registration(CONFIG.SUPERUSER_LOGIN, CONFIG.SUPREUSER_PASS, new Date(), 'male')
      await User.update({ role: 'admin' }, { where: { email: CONFIG.SUPERUSER_LOGIN } })
    }
    app.listen(PORT, '0.0.0.0', () => {
      console.log('Server started on port ', PORT)
    })
  } catch (e) {
    console.error('Startup failed', e.message)
    process.exitCode = 1
  }
}

start()
