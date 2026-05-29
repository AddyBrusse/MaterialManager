import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { config } from '../config'
import { AppError } from '../middleware/error'

const router = Router()

function makeStorage(subdir: string) {
  return multer.diskStorage({
    destination: path.join(config.uploadsDir, subdir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
    },
  })
}

const photoUpload = multer({
  storage: makeStorage('photos'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new AppError(400, 'VALIDATION', 'Alleen afbeeldingen toegestaan'))
    } else {
      cb(null, true)
    }
  },
})

const drawingUpload = multer({
  storage: makeStorage('drawings'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, 'VALIDATION', 'Alleen PDF toegestaan'))
    } else {
      cb(null, true)
    }
  },
})

router.post('/photo', photoUpload.single('file'), (req, res) => {
  if (!req.file) throw new AppError(400, 'VALIDATION', 'Geen bestand ontvangen')
  res.json({ data: { path: `/uploads/photos/${req.file.filename}` } })
})

router.post('/drawing', drawingUpload.single('file'), (req, res) => {
  if (!req.file) throw new AppError(400, 'VALIDATION', 'Geen bestand ontvangen')
  res.json({ data: { path: `/uploads/drawings/${req.file.filename}` } })
})

export default router
