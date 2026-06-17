# 00 — Overview

## Goal

Internal inventory app for a small CNC shop. Tracks raw materials and finished goods, supports stock adjustments, lookups, and basic admin settings. Used by ~4 users concurrently on phones, tablets, and desktops.

## Scope

**In scope**
- Raw material tracking (unique per piece, length in mm, computed weight)
- Receiving raw material ("binnen boeken") against a delivery note
- Finished goods tracking (article number, photo, drawing)
- Articles as **make-to-stock manufactured products**: recipe (raw blank +
  grade + dimensions), routing/operations, setup sheet, and a cost
  **calculator/estimate** (materials, machine time, outsourcing) — see
  `decisions/90-decisions-log.md` (2026-06-04) and `features/38-article-calculator.md`
- Relaties: customers and suppliers (with contacts), linked to articles
- Stock movements with audit history
- Per-item edit locking (one user at a time)
- Label printing (Altec ATP300, integration parked)
- Admin settings: users, locations, grades (incl. price/kg), profiles, machines,
  overhead/bedrijfskosten, min stock
- Saw-cutting production pipeline: zaag calculator → reserveringen → zaagflow

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
| Finished good / Article | A make-to-stock product, identified by `ART-NNNN` |
| Recipe | The raw blank (profile + grade + dimensions + length/piece) an article is made from |
| Operation | A routing step for an article (zagen, draaien, frezen, boren, extern, …) |
| Setup sheet | Article notes (opspanning/algemeen) + attachments (NC/drawing/image/document) |
| Estimate / EstimateNode | The article's cost calculation: a list of material/machine/external nodes (see `features/38-article-calculator.md`) |
| Grade | Material specification (e.g. S355, AISI 304), incl. density and price/kg |
| Profile | Shape of raw material (round bar, flat, tube, …) |
| Machine | A work center (mill/lathe/saw) with a rate, used in routing and the calculator |
| Overhead / Bedrijfskosten | Company-wide cost settings feeding the article cost calculator |
| Relatie | A customer or supplier (klant/leverancier/beide), with one or more contacts |
| Location | Where an item physically lives (Rack/Row or Cabinet/Shelf/Box) |
| Lock | Soft edit-lock held by one user on one item |
| Heartbeat | Frontend ping that keeps a lock alive |
| Label | Printed sticker with a reserved `#NNNNN` number |
| Binnen boeken | Receiving workflow: book in raw material against a delivery note |
| Zaag calculator / Reservering / Zaagflow | Saw-cutting pipeline: plan cuts, reserve stock, then execute with in-flow quality checks |
