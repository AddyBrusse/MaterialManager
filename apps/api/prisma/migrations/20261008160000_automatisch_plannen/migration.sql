-- Automatisch plannen (2026-10-08): een rang per stap, en elke herberekening
-- met de oude waarden erbij zodat hij in zijn geheel terug kan.
ALTER TABLE "productie_stappen" ADD COLUMN "prioriteit" DOUBLE PRECISION;

CREATE TABLE "planning_herberekeningen" (
    "id" TEXT NOT NULL,
    "aanleiding" TEXT NOT NULL,
    "door" TEXT NOT NULL,
    "op" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wijzigingen" JSONB NOT NULL,
    "samenvatting" JSONB,
    "ongedaan_op" TIMESTAMP(3),
    "ongedaan_door" TEXT,

    CONSTRAINT "planning_herberekeningen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "planning_herberekeningen_op_idx" ON "planning_herberekeningen"("op" DESC);
