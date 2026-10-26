-- Offerte-pdf en andere documenten van de leverancier bij de inkoop (2026-10-09).
-- CreateTable
CREATE TABLE "inkoop_bijlagen" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "pad" TEXT NOT NULL,
    "grootte" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "prijsaanvraag_id" TEXT,
    "leverancier_id" TEXT,
    "bestel_regel_id" TEXT,
    "inkooporder_id" TEXT,
    "geupload_door" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inkoop_bijlagen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inkoop_bijlagen_prijsaanvraag_id_leverancier_id_idx" ON "inkoop_bijlagen"("prijsaanvraag_id", "leverancier_id");

-- CreateIndex
CREATE INDEX "inkoop_bijlagen_bestel_regel_id_idx" ON "inkoop_bijlagen"("bestel_regel_id");

-- CreateIndex
CREATE INDEX "inkoop_bijlagen_inkooporder_id_idx" ON "inkoop_bijlagen"("inkooporder_id");

-- AddForeignKey
ALTER TABLE "inkoop_bijlagen" ADD CONSTRAINT "inkoop_bijlagen_prijsaanvraag_id_fkey" FOREIGN KEY ("prijsaanvraag_id") REFERENCES "prijsaanvragen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inkoop_bijlagen" ADD CONSTRAINT "inkoop_bijlagen_leverancier_id_fkey" FOREIGN KEY ("leverancier_id") REFERENCES "relaties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inkoop_bijlagen" ADD CONSTRAINT "inkoop_bijlagen_bestel_regel_id_fkey" FOREIGN KEY ("bestel_regel_id") REFERENCES "bestel_regels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inkoop_bijlagen" ADD CONSTRAINT "inkoop_bijlagen_inkooporder_id_fkey" FOREIGN KEY ("inkooporder_id") REFERENCES "inkooporders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

