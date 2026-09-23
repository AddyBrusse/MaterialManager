-- Deelleveringen, creditfacturen en deels gereed gemelde orders.
--
-- De tabellen paklijsten en facturen konden er per project al meer dan één
-- hebben; wat ontbrak was het kunnen uitrekenen wat er per orderregel geleverd
-- en gefactureerd is, en het kunnen vasthouden dat 34 van de 40 stuks klaar
-- zijn. Drie kolommen, alle drie met een terugval die bestaande rijen laat
-- kloppen.

-- ── 1. Waar hoort een geleverd stuk bij ──────────────────────────────────────
-- Af te leiden via de productieorder, maar dan verdwijnt het geleverde aantal
-- zodra die order weg is. Een verstuurde pakbon is een document en hoort niet
-- van gedachten te veranderen, dus leggen we het vast.
ALTER TABLE "paklijst_regels" ADD COLUMN "offerte_regel_id" TEXT;

UPDATE "paklijst_regels" pr
SET "offerte_regel_id" = po."offerte_regel_id"
FROM "productie_orders" po
WHERE po."id" = pr."productie_order_id";

CREATE INDEX "paklijst_regels_offerte_regel_id_idx"
  ON "paklijst_regels"("offerte_regel_id");

-- ── 2. Creditfactuur ─────────────────────────────────────────────────────────
-- Geen negatieve factuur: de gecrediteerde factuur is verstuurd en blijft
-- staan, de credit telt er als eigen document naast.
ALTER TABLE "facturen" ADD COLUMN "soort" TEXT NOT NULL DEFAULT 'factuur';
ALTER TABLE "facturen" ADD COLUMN "crediteert_factuur_id" TEXT;

ALTER TABLE "facturen"
  ADD CONSTRAINT "facturen_crediteert_factuur_id_fkey"
  FOREIGN KEY ("crediteert_factuur_id") REFERENCES "facturen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "facturen_soort_idx" ON "facturen"("soort");

-- ── 3. Deels gereed ──────────────────────────────────────────────────────────
-- Backfill: een order die gereed stond, was helemaal gereed. Alle andere op 0.
-- De rekenkern valt voor een order met 0 én status 'gereed' terug op qty, dus
-- ook zonder deze backfill zou niets leeglopen — maar dan zou een order die
-- later heropend wordt ineens op nul springen.
ALTER TABLE "productie_orders"
  ADD COLUMN "aantal_gereed" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "productie_orders" SET "aantal_gereed" = "qty" WHERE "status" = 'gereed';
