-- Na hoeveel dagen zonder reactie een verstuurde offerte als "nabellen" telt (2026-10-05).
ALTER TABLE "company" ADD COLUMN "offerte_nabel_dagen" INTEGER NOT NULL DEFAULT 21;
