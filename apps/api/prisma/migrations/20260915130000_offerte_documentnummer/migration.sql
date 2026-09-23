-- Eén documentnummer over alle versies van een offerte.
--
-- Een nieuwe versie VERVANGT de vorige — die vervalt. Dan hoort ze hetzelfde
-- nummer te dragen: de klant kreeg een offerte OFF-2026-014 en krijgt er een
-- herziene versie van, geen tweede offerte. Tot nu toe trok elke versie een
-- nieuw nummer (nextLocalDocId('OFF')) terwijl `versie` wél 1, 2, 3 telde, dus
-- stonden er twee tellingen naast elkaar die iets anders zeiden.
--
-- Het id kan dit nummer niet zijn: dat is de primary key en moet per versie
-- verschillen. Vandaar een eigen kolom.
ALTER TABLE "offertes" ADD COLUMN "document_nr" TEXT;

-- BEWUST NIET hernoemen naar het nummer van v1. Bestaande versies zijn onder
-- hun eigen nummer de deur uit gegaan; er ligt mogelijk een PDF bij een klant
-- met OFF-2026-015 erop. Die achteraf OFF-2026-014 noemen maakt het scherm
-- netjes en de administratie onwaar. Bestaande rijen houden dus hun eigen
-- nummer, en alleen versies die na deze migratie bijkomen erven dat van v1.
UPDATE "offertes" SET "document_nr" = "id" WHERE "document_nr" IS NULL;

ALTER TABLE "offertes" ALTER COLUMN "document_nr" SET NOT NULL;

CREATE INDEX "offertes_document_nr_idx" ON "offertes"("document_nr");
