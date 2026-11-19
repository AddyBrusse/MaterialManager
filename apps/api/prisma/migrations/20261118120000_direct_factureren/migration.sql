-- Direct factureren (2026-11-18): losse factuur en credit bij de klant zonder
-- project, prijsafspraken per artikel, en een logboek van de artikelvoorraad.
-- Bestaande facturen houden hun project, offerte en nummer; er gaat niets weg.
-- AlterTable
ALTER TABLE "facturen" ADD COLUMN     "contact_id" TEXT,
ADD COLUMN     "klant_ref" TEXT,
ADD COLUMN     "leverdatum" TEXT,
ADD COLUMN     "reden" TEXT,
ADD COLUMN     "relatie_id" TEXT,
ADD COLUMN     "retour" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "project_id" DROP NOT NULL,
ALTER COLUMN "offerte_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "factuur_regels" ADD COLUMN     "artikel_id" TEXT,
ALTER COLUMN "offerte_regel_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "prijsafspraken" (
    "id" TEXT NOT NULL,
    "artikel_id" TEXT NOT NULL,
    "prijs" DOUBLE PRECISION NOT NULL,
    "vanaf_aantal" INTEGER NOT NULL DEFAULT 1,
    "geldig_van" TEXT,
    "geldig_tot" TEXT,
    "kenmerk" TEXT,
    "door" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prijsafspraken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artikel_mutaties" (
    "id" TEXT NOT NULL,
    "artikel_id" TEXT NOT NULL,
    "aantal" DOUBLE PRECISION NOT NULL,
    "soort" TEXT NOT NULL,
    "factuur_id" TEXT,
    "reden" TEXT,
    "stand" DOUBLE PRECISION NOT NULL,
    "door" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artikel_mutaties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prijsafspraken_artikel_id_idx" ON "prijsafspraken"("artikel_id");

-- CreateIndex
CREATE INDEX "artikel_mutaties_artikel_id_created_at_idx" ON "artikel_mutaties"("artikel_id", "created_at");

-- CreateIndex
CREATE INDEX "facturen_relatie_id_idx" ON "facturen"("relatie_id");

-- AddForeignKey
ALTER TABLE "prijsafspraken" ADD CONSTRAINT "prijsafspraken_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artikel_mutaties" ADD CONSTRAINT "artikel_mutaties_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
