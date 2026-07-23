# Things To Do

Small, quick notes — not full specs. Grouped by page/route so it's easy to
scan "what's outstanding on the page I'm looking at." Not for tracking
in-progress work (that's the conversation/plan for the session doing it);
this is for stuff spotted in passing that shouldn't get lost.

**Quick add:** type `#todo` in chat. Claude asks which page and what the
note is, then adds it here — no need to open this file yourself.

Format: `- [ ] Note (added YYYY-MM-DD)`. Check items off (`- [x]`) once done;
leave them in place rather than deleting, so there's a record.

---

## Planning — Wachtrij (`/planning-queue`)

- [ ] Timeline nodes are 60px tall now (was 24px) — room to show more than just the production number. Consider adding customer name and part name/description. (added 2026-07-21)

## Planning — Prognose (`/prognose`)

## Planning — ToDo (`/todos`)

## Productie — Projecten (`/projecten`)

## Productie — Zaagcalculator (`/zaagcalculator`)

## Productie — Zaagplanner (`/zaagplanner`)

## Productie — ZaagFlow (`/zaagflow`)

## Materiaalbeheer — Voorraad (`/voorraad`)

## Materiaalbeheer — Reserveringen (`/reserveringen`)

## Materiaalbeheer — Binnen boeken (`/binnenboeken`)

## Stamgegevens — Artikelen (`/artikelen`)

## Stamgegevens — Artikel detail (`/artikelen/:id`)

- [ ] Add customer search in the customer selector. (added 2026-07-21)
- [ ] Layout/UI/UX feels heavy — move to more user-friendly input fields: no large header, no click-to-edit toggle, dynamic/inline update, more condensed with less whitespace. (added 2026-07-21)
- [ ] Unify input styling — all inputs should share the same height, font color, and border. (added 2026-07-21)
- [ ] If a 3D step file or PDF exists for the article, show it in the header, top-right, at 400x400px viewport size. (added 2026-07-21)
- [ ] When selecting a material that doesn't exist in Voorraad yet, need a fast add-material-without-leaving-the-article flow (add to Voorraad without location data, then straight back) — currently means leaving the article, opening Voorraad, adding the material, re-searching and reopening the article. Must not require leaving the article, or at minimum needs a very quick way back once the material's added. (added 2026-07-21)

## Stamgegevens — Relaties (`/relaties`)

## Stamgegevens — Instellingen (`/instellingen`)

## General / cross-cutting

Notes that don't belong to one page (shared components, build/tooling, docs, …).
