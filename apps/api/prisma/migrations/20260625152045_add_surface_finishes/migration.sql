-- AlterTable
ALTER TABLE "raw_materials" ADD COLUMN     "surface_finish_id" TEXT;

-- CreateTable
CREATE TABLE "surface_finishes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surface_finishes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "surface_finishes_name_key" ON "surface_finishes"("name");

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_surface_finish_id_fkey" FOREIGN KEY ("surface_finish_id") REFERENCES "surface_finishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
