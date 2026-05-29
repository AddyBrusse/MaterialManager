# 25 — File Storage

## Where

Filesystem, not Postgres BLOBs. DB stores the relative path.

```
/data/uploads/
├── photos/
│   ├── raw/<uuid>.jpg
│   └── finished/<uuid>.jpg
└── drawings/
    └── finished/<uuid>.pdf
```

`/data` is a mounted Docker volume on QNAP. In dev: `./data/uploads`.

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
