-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('rack', 'cabinet');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('raw', 'finished');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('delta', 'overwrite');

-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('received', 'used', 'scrapped', 'correction', 'other');

-- CreateEnum
CREATE TYPE "LabelStatus" AS ENUM ('printed_unused', 'consumed', 'voided');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'user',
    "avatar_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_slots" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "level1" TEXT NOT NULL,
    "level2" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "density_kg_m3" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension_schema" JSONB NOT NULL,
    "volume_formula" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "length_mm" DECIMAL(65,30) NOT NULL,
    "location_slot_id" TEXT,
    "photo_path" TEXT,
    "min_stock" DECIMAL(65,30),
    "current_stock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_goods" (
    "id" TEXT NOT NULL,
    "art_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer" TEXT,
    "photo_path" TEXT,
    "drawing_path" TEXT,
    "location_slot_id" TEXT,
    "min_stock" DECIMAL(65,30),
    "current_stock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finished_goods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "previous_stock" DECIMAL(65,30) NOT NULL,
    "new_stock" DECIMAL(65,30) NOT NULL,
    "reason" "MovementReason" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "number" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "status" "LabelStatus" NOT NULL,
    "printed_at" TIMESTAMP(3) NOT NULL,
    "printed_by" TEXT NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "consumed_raw_material_id" TEXT,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "locks" (
    "item_type" "ItemType" NOT NULL,
    "item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL,
    "last_heartbeat" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locks_pkey" PRIMARY KEY ("item_type","item_id")
);

-- CreateTable
CREATE TABLE "lock_requests" (
    "id" TEXT NOT NULL,
    "item_type" "ItemType" NOT NULL,
    "item_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "lock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_name_key" ON "users"("name");

-- CreateIndex
CREATE UNIQUE INDEX "grades_name_key" ON "grades"("name");

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_code_key" ON "raw_materials"("code");

-- CreateIndex
CREATE UNIQUE INDEX "finished_goods_art_no_key" ON "finished_goods"("art_no");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_created_at_idx" ON "stock_movements"("item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "labels_consumed_raw_material_id_key" ON "labels"("consumed_raw_material_id");

-- CreateIndex
CREATE INDEX "labels_status_idx" ON "labels"("status");

-- CreateIndex
CREATE INDEX "locks_last_heartbeat_idx" ON "locks"("last_heartbeat");

-- AddForeignKey
ALTER TABLE "location_slots" ADD CONSTRAINT "location_slots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_location_slot_id_fkey" FOREIGN KEY ("location_slot_id") REFERENCES "location_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods" ADD CONSTRAINT "finished_goods_location_slot_id_fkey" FOREIGN KEY ("location_slot_id") REFERENCES "location_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_printed_by_fkey" FOREIGN KEY ("printed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_consumed_raw_material_id_fkey" FOREIGN KEY ("consumed_raw_material_id") REFERENCES "raw_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locks" ADD CONSTRAINT "locks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lock_requests" ADD CONSTRAINT "lock_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
