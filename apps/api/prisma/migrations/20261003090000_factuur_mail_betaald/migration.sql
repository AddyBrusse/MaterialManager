-- Facturen-tab (2026-10-03): het mailadres waar de factuur heen ging, en
-- wanneer hij betaald is. Bestaande facturen: adres onbekend, nog niet betaald.
ALTER TABLE "facturen" ADD COLUMN "naar_email" TEXT;
ALTER TABLE "facturen" ADD COLUMN "betaald_op" TEXT;
