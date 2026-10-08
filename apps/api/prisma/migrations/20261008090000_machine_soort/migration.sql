-- Wat voor werk een machine doet (2026-10-08). Leeg tot iemand het invult bij
-- Instellingen → Machines; de planning gebruikt het om alleen naar dezelfde
-- soort te laten slepen.
ALTER TABLE "machines" ADD COLUMN "soort" TEXT;
