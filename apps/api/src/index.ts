import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { config } from './config'
import { prisma } from './db/client'
import { asyncHandler } from './lib/async-handler'
import { userContext } from './middleware/user-context'
import { errorMiddleware } from './middleware/error'
import healthRouter from './routes/health'
import usersRouter from './routes/users'
import rawMaterialsRouter from './routes/raw-materials'
import finishedGoodsRouter from './routes/finished-goods'
import movementsRouter from './routes/movements'
import locationsRouter from './routes/locations'
import gradesRouter from './routes/grades'
import profilesRouter from './routes/profiles'
import labelsRouter from './routes/labels'
import locksRouter from './routes/locks'
import uploadsRouter from './routes/uploads'
import searchRouter from './routes/search'
import lowStockRouter from './routes/low-stock'
import pdfRouter from './routes/pdf'
import settingsRouter from './routes/settings'

const app = express()

// Ensure upload directories exist
for (const dir of ['photos', 'drawings']) {
  fs.mkdirSync(path.join(config.uploadsDir, dir), { recursive: true })
}

app.use(cors())
app.use(express.json())

// Health check (no auth)
app.use('/api/health', healthRouter)

// Users list public — needed before auth middleware so the login dropdown works
app.get('/api/users', asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } })
  res.json({ data: users })
}))

// PDF routes — no DB needed, data comes from the POST body
app.use('/api/pdf', pdfRouter)

// Auth middleware on all remaining /api routes
app.use('/api', userContext)

app.use('/api/users', usersRouter)
app.use('/api/raw-materials', rawMaterialsRouter)
app.use('/api/finished-goods', finishedGoodsRouter)
app.use('/api/movements', movementsRouter)
app.use('/api/locations', locationsRouter)
app.use('/api/grades', gradesRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/labels', labelsRouter)
app.use('/api/locks', locksRouter)
app.use('/api/uploads', uploadsRouter)
app.use('/api/search', searchRouter)
app.use('/api/low-stock', lowStockRouter)
app.use('/api/settings', settingsRouter)

// Serve uploaded files
app.use('/uploads', express.static(config.uploadsDir))

// Serve built frontend in production
if (!config.isDev) {
  const webDist = path.join(__dirname, '../../web/dist')
  app.use(express.static(webDist))
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')))
}

app.use(errorMiddleware)

app.listen(config.port, () => {
  console.log(`StockManager API running on port ${config.port} (${config.nodeEnv})`)
})
