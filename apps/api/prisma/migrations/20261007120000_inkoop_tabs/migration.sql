-- Inkoop in vier tabbladen (2026-10-07): leveranciers per bestelregel, een
-- materiaalnummer per inkooporderregel (M26-0042) en een echte koppeling van
-- bestelregel naar project, voor "wacht op materiaal" op de productieorder.
-- Het veld "niet beginnen vóór" op een productiestap vervalt.

-- AlterTable
ALTER TABLE "bestel_regels" ADD COLUMN     "leverancier_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "inkooporder_regels" ADD COLUMN     "materiaal_nummer" TEXT;

-- AlterTable
ALTER TABLE "productie_stappen" DROP COLUMN "not_before";

-- CreateIndex
CREATE UNIQUE INDEX "inkooporder_regels_materiaal_nummer_key" ON "inkooporder_regels"("materiaal_nummer");

-- Een bestelregel die naar een verwijderd project wijst, verliest die verwijzing
-- (zoals de koppeling dat voortaan zelf doet), anders slaagt de sleutel niet.
UPDATE "bestel_regels" SET "project_id" = NULL
WHERE "project_id" IS NOT NULL AND "project_id" NOT IN (SELECT "id" FROM "projects");

-- AddForeignKey
ALTER TABLE "bestel_regels" ADD CONSTRAINT "bestel_regels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
