-- Materiaalselectie (2026-10-09): stangen per staaf en "rest afboeken".
ALTER TABLE "zaag_reserveringen" ADD COLUMN "stangen" JSONB;
ALTER TABLE "zaag_reserveringen" ADD COLUMN "rest_afboeken" BOOLEAN NOT NULL DEFAULT false;
