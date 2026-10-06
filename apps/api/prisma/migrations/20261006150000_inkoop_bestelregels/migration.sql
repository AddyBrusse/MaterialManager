-- Inkoop: bestelregels, prijsaanvragen en antwoorden (2026-10-06). Zie decisions/90-decisions-log.md.

-- CreateTable
CREATE TABLE "bestel_regels" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'te_bestellen',
    "bron" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "lengte_mm" DECIMAL(65,30) NOT NULL,
    "stuks" INTEGER NOT NULL,
    "raw_material_id" TEXT,
    "project_id" TEXT,
    "artikel_id" TEXT,
    "offerte_regel_id" TEXT,
    "notitie" TEXT,
    "keuze_leverancier_id" TEXT,
    "keuze_bron" TEXT,
    "keuze_antwoord_id" TEXT,
    "keuze_totaal" DECIMAL(65,30),
    "keuze_uitleg" TEXT,
    "keuze_levertijd_dagen" INTEGER,
    "keuze_op" TIMESTAMP(3),
    "keuze_door" TEXT,
    "toegevoegd_door" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bestel_regels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prijsaanvragen" (
    "id" TEXT NOT NULL,
    "notitie" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prijsaanvragen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prijsaanvraag_regels" (
    "prijsaanvraag_id" TEXT NOT NULL,
    "bestel_regel_id" TEXT NOT NULL,

    CONSTRAINT "prijsaanvraag_regels_pkey" PRIMARY KEY ("prijsaanvraag_id","bestel_regel_id")
);

-- CreateTable
CREATE TABLE "prijsaanvraag_leveranciers" (
    "prijsaanvraag_id" TEXT NOT NULL,
    "leverancier_id" TEXT NOT NULL,
    "verzonden_op" TIMESTAMP(3),
    "verzonden_door" TEXT,

    CONSTRAINT "prijsaanvraag_leveranciers_pkey" PRIMARY KEY ("prijsaanvraag_id","leverancier_id")
);

-- CreateTable
CREATE TABLE "prijsaanvraag_antwoorden" (
    "id" TEXT NOT NULL,
    "prijsaanvraag_id" TEXT NOT NULL,
    "bestel_regel_id" TEXT NOT NULL,
    "leverancier_id" TEXT NOT NULL,
    "prijs_soort" TEXT NOT NULL,
    "prijs" DECIMAL(65,30) NOT NULL,
    "zaagkosten_per_snede" DECIMAL(65,30),
    "levertijd_dagen" INTEGER,
    "notitie" TEXT,
    "bijgewerkt_door" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prijsaanvraag_antwoorden_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bestel_regels_status_idx" ON "bestel_regels"("status");

-- CreateIndex
CREATE INDEX "bestel_regels_project_id_idx" ON "bestel_regels"("project_id");

-- CreateIndex
CREATE INDEX "prijsaanvraag_antwoorden_bestel_regel_id_idx" ON "prijsaanvraag_antwoorden"("bestel_regel_id");

-- CreateIndex
CREATE UNIQUE INDEX "prijsaanvraag_antwoorden_prijsaanvraag_id_bestel_regel_id_l_key" ON "prijsaanvraag_antwoorden"("prijsaanvraag_id", "bestel_regel_id", "leverancier_id");

-- AddForeignKey
ALTER TABLE "bestel_regels" ADD CONSTRAINT "bestel_regels_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestel_regels" ADD CONSTRAINT "bestel_regels_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestel_regels" ADD CONSTRAINT "bestel_regels_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bestel_regels" ADD CONSTRAINT "bestel_regels_keuze_leverancier_id_fkey" FOREIGN KEY ("keuze_leverancier_id") REFERENCES "relaties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_regels" ADD CONSTRAINT "prijsaanvraag_regels_prijsaanvraag_id_fkey" FOREIGN KEY ("prijsaanvraag_id") REFERENCES "prijsaanvragen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_regels" ADD CONSTRAINT "prijsaanvraag_regels_bestel_regel_id_fkey" FOREIGN KEY ("bestel_regel_id") REFERENCES "bestel_regels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_leveranciers" ADD CONSTRAINT "prijsaanvraag_leveranciers_prijsaanvraag_id_fkey" FOREIGN KEY ("prijsaanvraag_id") REFERENCES "prijsaanvragen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_leveranciers" ADD CONSTRAINT "prijsaanvraag_leveranciers_leverancier_id_fkey" FOREIGN KEY ("leverancier_id") REFERENCES "relaties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_antwoorden" ADD CONSTRAINT "prijsaanvraag_antwoorden_prijsaanvraag_id_fkey" FOREIGN KEY ("prijsaanvraag_id") REFERENCES "prijsaanvragen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_antwoorden" ADD CONSTRAINT "prijsaanvraag_antwoorden_bestel_regel_id_fkey" FOREIGN KEY ("bestel_regel_id") REFERENCES "bestel_regels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prijsaanvraag_antwoorden" ADD CONSTRAINT "prijsaanvraag_antwoorden_leverancier_id_fkey" FOREIGN KEY ("leverancier_id") REFERENCES "relaties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

