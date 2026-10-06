-- Inkooporders en ontvangsten (2026-10-06). Zie decisions/90-decisions-log.md.

-- CreateTable
CREATE TABLE "inkooporders" (
    "id" TEXT NOT NULL,
    "leverancier_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "notitie" TEXT,
    "verzonden_op" TIMESTAMP(3),
    "verzonden_door" TEXT,
    "vervallen_op" TIMESTAMP(3),
    "vervallen_reden" TEXT,
    "vervallen_door" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inkooporders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inkooporder_regels" (
    "id" TEXT NOT NULL,
    "inkooporder_id" TEXT NOT NULL,
    "bestel_regel_id" TEXT NOT NULL,
    "positie" INTEGER NOT NULL,
    "stuks" INTEGER NOT NULL,
    "lengte_mm" DECIMAL(65,30) NOT NULL,
    "totaal" DECIMAL(65,30) NOT NULL,
    "uitleg" TEXT NOT NULL,
    "levertijd_dagen" INTEGER,
    "ontvangen_stuks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inkooporder_regels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ontvangsten" (
    "id" TEXT NOT NULL,
    "inkooporder_regel_id" TEXT NOT NULL,
    "stuks" INTEGER NOT NULL,
    "raw_material_ids" JSONB NOT NULL DEFAULT '[]',
    "codes" JSONB NOT NULL DEFAULT '[]',
    "gereserveerd_voor" TEXT,
    "notitie" TEXT,
    "door" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ontvangsten_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inkooporders_status_idx" ON "inkooporders"("status");

-- CreateIndex
CREATE INDEX "inkooporder_regels_bestel_regel_id_idx" ON "inkooporder_regels"("bestel_regel_id");

-- CreateIndex
CREATE INDEX "ontvangsten_created_at_idx" ON "ontvangsten"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "inkooporders" ADD CONSTRAINT "inkooporders_leverancier_id_fkey" FOREIGN KEY ("leverancier_id") REFERENCES "relaties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inkooporder_regels" ADD CONSTRAINT "inkooporder_regels_inkooporder_id_fkey" FOREIGN KEY ("inkooporder_id") REFERENCES "inkooporders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inkooporder_regels" ADD CONSTRAINT "inkooporder_regels_bestel_regel_id_fkey" FOREIGN KEY ("bestel_regel_id") REFERENCES "bestel_regels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ontvangsten" ADD CONSTRAINT "ontvangsten_inkooporder_regel_id_fkey" FOREIGN KEY ("inkooporder_regel_id") REFERENCES "inkooporder_regels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

