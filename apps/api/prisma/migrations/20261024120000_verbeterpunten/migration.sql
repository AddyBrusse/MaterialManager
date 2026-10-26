-- Verbeterpunten (2026-10-24): knop "Dit klopt niet" maakt een todo met de
-- pagina, een schermafbeelding (pad onder /uploads) en wat er vanzelf meegaat.
ALTER TABLE "todos" ADD COLUMN "pagina_url" TEXT;
ALTER TABLE "todos" ADD COLUMN "pagina_naam" TEXT;
ALTER TABLE "todos" ADD COLUMN "schermafbeelding" TEXT;
ALTER TABLE "todos" ADD COLUMN "context" JSONB;
