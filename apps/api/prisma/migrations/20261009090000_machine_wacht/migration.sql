-- "Machine laten wachten" (2026-10-09): de planning vult de tijd vóór deze stap
-- op zijn machine niet met ander werk, tot de stap gestart is.
ALTER TABLE "productie_stappen" ADD COLUMN "machine_wacht" BOOLEAN NOT NULL DEFAULT false;
