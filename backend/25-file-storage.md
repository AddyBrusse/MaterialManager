# 25 — File Storage

## Where

Filesystem, not Postgres BLOBs. DB stores the relative path.

```
/data/uploads/
├── photos/
│   ├── raw/<uuid>.jpg
│   └── finished/<uuid>.jpg
├── drawings/
│   └── finished/<uuid>.pdf
└── attachments/
    └── <articleId>/<timestamp>-<bestandsnaam>
```

`/data` is a mounted Docker volume on QNAP. In dev: `./data/uploads`.

De map zelf komt uit `config.uploadsDir` (env `UPLOADS_DIR`). Dat is het
**enige** dat verandert als dit naar de NAS verhuist: wijs die variabele naar
een share en deze route, de statische `/uploads`-mount en elk opgeslagen
`attachment.path` blijven werken.

## Upload flow

- Frontend uses `<input type="file" accept="image/*" capture="environment">` for photos (camera capture only on mobile, but the same input works on desktop too)
- POST multipart to `/api/uploads/photo` or `/api/uploads/drawing`
- Server validates mime type + size, writes to filesystem, returns `{ path: 'photos/raw/abc.jpg' }`
- Caller sets that path on the item record

## Constraints

- Photos: jpg/png, max ~5 MB, server downscales to a reasonable max width (e.g. 1600px) if needed
- Drawings: PDF, max ~25 MB
- Filename = `<uuid>.<ext>` — never trust client filenames

## Serving

- Express serves `/data/uploads` under `/uploads/*` as static, read-only
- Frontend uses `<img src="/uploads/photos/raw/abc.jpg">` and `<PdfViewer src="/uploads/drawings/finished/xyz.pdf">`

## Thumbnails

Not generated server-side in v1. Browser scales. Add later if perf becomes an issue.

## Cleanup

When an item is deleted, its files should be deleted too. Implement in the delete service. Orphan scan job can be added later if needed.

## Artikelbijlagen

**Gebouwd.** Per artikel één map — NC-programma's, tekeningen, STEP-bestanden,
foto's en overige documenten door elkaar:

- `POST /api/uploads/attachment/:articleId` — multipart, geeft
  `{ path, sizeBytes }` terug
- `DELETE /api/uploads/attachment/:articleId/:filename`
- Frontend: `hooks/useArticleAttachmentUpload.ts`, getoond in
  `ArticleFilesTab`

Eén map per artikel-id, zodat de boom ook rechtstreeks op schijf (straks over
SMB) leesbaar is: "alles van ART-0002" zonder databasequery.

Bestandsnaam is `<timestamp>-<opgeschoonde originele naam>` — anders dan bij
foto's en tekeningen, waar de naam een UUID is. Dat is bewust: een monteur
moet een NC-programma aan zijn naam kunnen herkennen in de verkenner.

Limiet 150 MB per bestand, want CAD-samenstellingen lopen in de tientallen MB.
