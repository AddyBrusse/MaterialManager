import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
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

// Strip characters that are unsafe on Windows/NAS (SMB) filesystems, keeping
// the rest of the original name readable — attachments are meant to be
// browsable directly on disk (one folder per article), not just opaque blobs.
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 200)
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

// ── Article attachments ─────────────────────────────────────────────────────
// General-purpose file cabinet per article — NC-programma's, tekeningen,
// step-bestanden, foto's, overige documenten (see ArticleAttachment in
// @stockmanager/web/api/articles). One folder per article id under
// uploadsDir/attachments/, so the same tree reads naturally when browsed
// directly on disk (over SMB, once this moves to the NAS) — no DB lookup
// needed to see "everything for ART-0002" in a file explorer.
//
// uploadsDir itself is the ONE thing that changes on that migration — see
// config.ts (UPLOADS_DIR env var). Point it at a NAS share instead of a
// local folder and this route, the static /uploads mount, and every stored
// attachment.path keep working unchanged.
const ARTICLE_ID_RE = /^[A-Za-z0-9_-]+$/

function attachmentDir(articleId: string): string {
  return path.join(config.uploadsDir, 'attachments', articleId)
}

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const articleId = req.params.articleId
      if (!ARTICLE_ID_RE.test(articleId)) return cb(new AppError(400, 'VALIDATION', 'Ongeldig artikel-id'), '')
      const dir = attachmentDir(articleId)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
    },
  }),
  // Generous cap — this is the catch-all for NC programs, drawings, step
  // files and photos; CAD assemblies in particular can run tens of MB.
  limits: { fileSize: 150 * 1024 * 1024 },
})

router.post('/attachment/:articleId', attachmentUpload.single('file'), (req, res) => {
  if (!req.file) throw new AppError(400, 'VALIDATION', 'Geen bestand ontvangen')
  res.json({
    data: {
      path: `/uploads/attachments/${req.params.articleId}/${req.file.filename}`,
      sizeBytes: req.file.size,
    },
  })
})

router.delete('/attachment/:articleId/:filename', (req, res) => {
  const { articleId, filename } = req.params
  if (!ARTICLE_ID_RE.test(articleId) || filename !== path.basename(filename)) {
    throw new AppError(400, 'VALIDATION', 'Ongeldig pad')
  }
  const target = path.join(attachmentDir(articleId), filename)
  fs.rm(target, { force: true }, () => res.json({ data: { ok: true } }))
})

export default router
