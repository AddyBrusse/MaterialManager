# 41 — Receive Material Flow

> **Status: this single-label flow is not what `/binnenboeken` currently
> implements.** `BinnenBoekenPage.tsx` is a different, mock-data-only flow —
> a multi-line goods receipt against a supplier/pakbon (Ontvangstnummer,
> Pakbonnummer, Leverancier, line items), with no label-number (`#NNNNN`)
> lookup step. The label-consumption flow described below is still the
> intended design for *creating a raw material from a printed label* — it
> just isn't built yet, on `/binnenboeken` or elsewhere.

## Preconditions

- A label batch has been printed and physical labels exist on a pile near the receiving area
- User has selected their name

## Steps

1. User opens app (mobile or desktop) → tap **Materiaal ontvangen**
2. Form: enter label number `#NNNNN`
3. Backend looks up label
   - Not found → error "Onbekend labelnummer"
   - Found and `status = consumed` → error "Label al gebruikt"
   - Found and `status = voided` → error "Label ongeldig"
   - Found and `printed_unused` → proceed
4. Form expands: grade (select), profile (select), dimensions (dynamic per profile), length_mm, location (rack/row picker), photo (camera), initial quantity (default 1)
5. User reviews computed weight (live calc as fields fill)
6. User taps **Opslaan**
7. Backend transaction:
   - Insert raw material with this code
   - Mark label consumed
   - Insert initial stock movement (`reason = received`, `amount = initialQuantity`)
8. UI confirms and navigates to the new item detail

## Errors

- Network failure mid-save → show error, label stays unused, no raw material created
- Validation failure → field-level errors, label stays unused

## Mobile vs desktop

- Mobile: same flow, simpler layout, big buttons
- Desktop: same flow, optionally accessible from the raw materials list with "Materiaal ontvangen" button
