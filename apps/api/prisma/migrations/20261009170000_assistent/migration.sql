-- AI-assistent (2026-10-09): tijden in de bedrijfsinstellingen en één bericht per tijdstip.
ALTER TABLE "company" ADD COLUMN "assistent_tijden" TEXT[] DEFAULT ARRAY['08:00', '15:00']::TEXT[];
ALTER TABLE "company" ADD COLUMN "assistent_aan" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "assistent_berichten" (
    "id" TEXT NOT NULL,
    "moment" TIMESTAMP(3) NOT NULL,
    "tekst" TEXT NOT NULL,
    "acties" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistent_berichten_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistent_berichten_moment_key" ON "assistent_berichten"("moment");
