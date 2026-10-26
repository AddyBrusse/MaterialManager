-- Een artikel kan een bewerkingsslot krijgen (2026-10-23), net als een project:
-- werken twee mensen tegelijk aan dezelfde calculatie, dan overschreef de
-- laatste de hele `estimate` van de ander. Voorraadmutaties blijven via Zod
-- beperkt tot raw|finished.
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'article';
