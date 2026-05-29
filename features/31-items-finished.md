# 31 — Finished Goods

## Identity

- Article number: `ART-NNNN`, unique
- Created in Settings (admin) — these are catalog entries, not per-piece

## Fields

| Field | Notes |
|---|---|
| art_no | `ART-NNNN` |
| name | required |
| customer | optional |
| photo | optional, camera or upload |
| drawing | optional, PDF |
| location | Cabinet → Shelf → Box |
| min_stock | optional |
| current_stock | updated by movements |

## Location model

Cabinet → Shelf → Box. Box is the smallest unit. Each finished good lives in exactly one box.

If a box is meant to hold one article: enforce uniqueness of `location_slot_id` across finished goods (decide during build).

## Lookup

No scanning. Users find finished goods via search by:
- art_no
- name
- customer
- location

## Drawing viewer

PDFs viewed inline via PDF.js or browser-native `<iframe src=".pdf">`. Mantine doesn't ship a PDF viewer — pick library at build time (pdfjs-dist or react-pdf).

## Lifecycle

- Created only by admin
- Edited under lock (any user holding the lock)
- Stock changed via movements
- Deleted only by admin
