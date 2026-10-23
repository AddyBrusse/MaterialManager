-- Elke materiaalregel uit voorraad (2026-10-23): een reservering en een
-- tekort-bestelregel weten voor welke materiaalregel van het artikel ze zijn
-- (het id van de knoop in de calculatie). Leeg = van vóór deze migratie; die
-- tellen voor de eerste materiaalregel, want toen was er alleen die.
ALTER TABLE "zaag_reserveringen" ADD COLUMN "materiaal_regel_id" TEXT;
ALTER TABLE "bestel_regels" ADD COLUMN "materiaal_regel_id" TEXT;
