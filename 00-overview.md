# 00 — Overview

## Goal

Internal shop management app for a small CNC shop. Began as inventory
(grondstoffen, eindproducten, mutaties) and grew into the whole order route:
quoting, opdracht, production planning, time registration and nacalculatie.
Used by ~4 users on office pc's, plus a touchscreen pc at each machine.

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
- **Projecten and the document route**: offerte (multiple versions) →
  opdrachtbevestiging → productieorders with steps → paklijst → factuur. The
  project status follows from the documents, it is never typed in
- **Planning**: Wachtrij (queue per machine, `notBefore` holds, planning
  suggestions) and Prognose. Planning is by order, not by clock time
- **Materiaalselectie** per orderregel: a zaagplan proposal a human confirms
- **Tijdregistratie** on a terminal at the machine (role `terminal`), split
  instellen/draaien exactly like the calculation
- **Nacalculatie**, derived — never stored — from hours, afgeboekte zaagbonnen
  and the offerteregel
- **Mail-import**: read an incoming request, propose offerteregels
- Todo's, relaties, prijshistorie

**Out of scope (for now)**
- ECI Bemet integration
- Authentication with passwords
- Remote/internet access (LAN only)
- Email/push notifications

## Users

- ~4 concurrent users
- Three roles: **admin**, **user**, and **terminal** — the last is the account
  of a machine screen, not a person; it only sees the kiosk route
  (`backend/23-users-roles.md`)
- No passwords — user selected from a dropdown on first visit, persisted in browser localStorage

## Devices

- Office pc's — the full app
- A touchscreen pc per machine — the terminal (kiosk) screen
- Tablets/phones — a mobile UI is designed but **not built**; the layout
  switch at 900 px exists and renders placeholders

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
| Project | One customer job: carries the offertes, the opdrachtbevestiging, the productieorders, the paklijst and the factuur |
| Offerte / Opdrachtbevestiging (OB) | Quote (versioned) and its frozen copy once accepted — the OB no longer changes when a new quote version appears |
| Productieorder / Productiestap | One order per accepted offerteregel; its steps come from that regel's frozen bewerkingen |
| Wachtrij / queuePosition | Planning by order per machine, not by clock time |
| Tijdregistratie | Measured work at the machine, split instellen (per batch) / draaien (per piece) |
| Nacalculatie | Estimated versus actual, derived on read — never stored |
| Terminal | The machine-screen account (role `terminal`), kiosk route only |
