-- Label en FinishedGood weg (2026-10-23): de labelprinter is geparkeerd (03-parked.md)
-- en artikelen leven in `articles`, zonder voorraadteller. Beide tabellen gaan weg,
-- mét wat erin staat. De Postgres-enum `ItemType` houdt de waarde `finished` voor
-- oude regels in `stock_movements`.

-- DropForeignKey
ALTER TABLE "finished_goods" DROP CONSTRAINT "finished_goods_location_slot_id_fkey";

-- DropForeignKey
ALTER TABLE "labels" DROP CONSTRAINT "labels_consumed_raw_material_id_fkey";

-- DropForeignKey
ALTER TABLE "labels" DROP CONSTRAINT "labels_printed_by_fkey";

-- DropTable
DROP TABLE "finished_goods";

-- DropTable
DROP TABLE "labels";

-- DropEnum
DROP TYPE "LabelStatus";
