-- Opdracht aanpassen, directe opdracht en netjes terugdraaien (2026-09-28).
ALTER TABLE "offertes" ADD COLUMN "direct" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offertes" ADD COLUMN "vervallen_door" TEXT;
ALTER TABLE "opdrachtbevestigingen" ADD COLUMN "wijzigingen" JSONB NOT NULL DEFAULT '[]';

-- Wie nu vervallen is naast een geaccepteerde versie, verviel door dat
-- accepteren (intrekken bestaat pas sinds 2026-09-25 en zette niets vast).
-- Op projecten zonder geaccepteerde versie is het onbekend; die blijven leeg.
UPDATE "offertes" o
SET "vervallen_door" = 'acceptatie'
WHERE o."status" = 'vervallen'
  AND EXISTS (SELECT 1 FROM "offertes" a WHERE a."project_id" = o."project_id" AND a."status" = 'geaccepteerd');
