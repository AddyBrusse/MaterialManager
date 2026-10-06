-- Exoten en leveranciersprijzen (2026-10-06). Zie decisions/90-decisions-log.md.

-- AlterTable
ALTER TABLE "raw_materials" ADD COLUMN     "artikel_id" TEXT,
ADD COLUMN     "exoot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "klant_id" TEXT;

-- CreateTable
CREATE TABLE "leverancier_prijzen" (
    "id" TEXT NOT NULL,
    "leverancier_id" TEXT NOT NULL,
    "raw_material_id" TEXT,
    "grade_id" TEXT,
    "prijs_soort" TEXT NOT NULL,
    "prijs" DECIMAL(65,30) NOT NULL,
    "zaagkosten_per_snede" DECIMAL(65,30),
    "minimum_bedrag" DECIMAL(65,30),
    "levertijd_dagen" INTEGER,
    "notitie" TEXT,
    "bijgewerkt_door" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leverancier_prijzen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leverancier_prijzen_raw_material_id_idx" ON "leverancier_prijzen"("raw_material_id");

-- CreateIndex
CREATE INDEX "leverancier_prijzen_grade_id_idx" ON "leverancier_prijzen"("grade_id");

-- CreateIndex
CREATE INDEX "leverancier_prijzen_leverancier_id_idx" ON "leverancier_prijzen"("leverancier_id");

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_klant_id_fkey" FOREIGN KEY ("klant_id") REFERENCES "relaties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_artikel_id_fkey" FOREIGN KEY ("artikel_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leverancier_prijzen" ADD CONSTRAINT "leverancier_prijzen_leverancier_id_fkey" FOREIGN KEY ("leverancier_id") REFERENCES "relaties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leverancier_prijzen" ADD CONSTRAINT "leverancier_prijzen_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leverancier_prijzen" ADD CONSTRAINT "leverancier_prijzen_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Een prijs hoort bij één materiaal óf bij een hele kwaliteit, nooit bij beide of geen.
ALTER TABLE "leverancier_prijzen" ADD CONSTRAINT "leverancier_prijzen_doel_check"
  CHECK (("raw_material_id" IS NULL) <> ("grade_id" IS NULL));
-- Per stuk zegt alleen iets bij een materiaal met een maat.
ALTER TABLE "leverancier_prijzen" ADD CONSTRAINT "leverancier_prijzen_soort_check"
  CHECK ("prijs_soort" = 'per_kg' OR ("prijs_soort" = 'per_stuk' AND "raw_material_id" IS NOT NULL));
