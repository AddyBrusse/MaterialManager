# 00 — Overview

## Goal

Internal inventory app for a small CNC shop. Tracks raw materials and finished goods, supports stock adjustments, lookups, and basic admin settings. Used by ~4 users concurrently on phones, tablets, and desktops.

## Scope

**In scope**
- Raw material tracking (unique per piece, length in mm, computed weight)
- Finished goods tracking (article number, photo, drawing)
- Stock movements with audit history
- Per-item edit locking (one user at a time)
- Label printing (Altec ATP300, integration parked)
- Admin settings: users, locations, grades, profiles, min stock

**Out of scope (for now)**
- ECI Bemet integration
- Authentication with passwords
- Remote/internet access (LAN only)
- Email/push notifications

## Users

- ~4 concurrent users on the shop floor
- Two roles: **admin** and **user**
- No passwords — user selected from a dropdown on first visit, persisted in browser localStorage

## Devices

- Desktops (full app)
- Tablets (mobile UI)
- Phones (mobile UI)
- Auto-detect by screen size, route to mobile or desktop UI accordingly

## Glossary

| Term | Meaning |
|---|---|
| Raw material | A unique piece of stock material (bar, plate, etc.), identified by `#NNNNN` |
| Finished good | An article, identified by `ART-NNNN` |
| Grade | Material specification (e.g. S355, AISI 304) |
| Profile | Shape of raw material (round bar, flat, tube, …) |
| Location | Where an item physically lives (Rack/Row or Cabinet/Shelf/Box) |
| Lock | Soft edit-lock held by one user on one item |
| Heartbeat | Frontend ping that keeps a lock alive |
| Label | Printed sticker with a reserved `#NNNNN` number |
