-- Inkoopplanning (2026-10-07): franco-grens per leverancier, marge in werkdagen,
-- en een leverdatum die de leverancier doorgaf per inkooporderregel.
-- AlterTable
ALTER TABLE "company" ADD COLUMN     "inkoop_marge_dagen" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "inkooporder_regels" ADD COLUMN     "verwacht_aangepast_door" TEXT,
ADD COLUMN     "verwacht_aangepast_op" TIMESTAMP(3),
ADD COLUMN     "verwacht_datum" TEXT;

-- AlterTable
ALTER TABLE "relaties" ADD COLUMN     "franco_bedrag" DECIMAL(65,30);

