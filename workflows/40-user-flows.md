# 40 — User Flows (overview)

End-to-end scenarios. See per-flow docs for detail.

## 1. First-time user select
- Open app → no user in localStorage → `<UserSelect />` overlay
- Pick name → store in localStorage → proceed

## 2. Receive material (`41-receive-material.md`)
- Admin prints 10 labels (batch reserved)
- User receives stock, sticks label, opens app, enters label number, fills form, saves

## 3. Adjust stock (`42-adjust-stock.md`)
- User finds item (scan / search)
- Tap "Voorraad aanpassen"
- Pick delta or overwrite, enter amount, pick reason, save

## 4. Edit metadata under lock (`43-edit-locking-flow.md`)
- Desktop: open item detail, click "Bewerken"
- Lock acquired, heartbeat starts
- Edit, save, lock released

## 5. Mobile scan lookup (`44-mobile-scan-flow.md`)
- Mobile home → Scan
- Camera or manual entry
- Item detail → optional adjust

## 6. Admin: create a finished good
- Desktop → Artikelen → Nieuw
- Fill art_no, name, customer, photo, drawing, location
- Save → article visible in lists

## 7. Admin: low-stock review
- Sidebar shows "Lage voorraad (3)"
- Click → list of items under minimum
- Decide reorder action (outside app)
