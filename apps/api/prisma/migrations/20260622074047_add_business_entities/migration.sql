-- AlterTable
ALTER TABLE "users" ADD COLUMN     "achternaam" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "telefoon" TEXT,
ADD COLUMN     "titel" TEXT;

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "naam" TEXT NOT NULL DEFAULT '',
    "adres" TEXT,
    "postcode" TEXT,
    "stad" TEXT,
    "land" TEXT NOT NULL DEFAULT 'Nederland',
    "telefoon" TEXT,
    "email" TEXT,
    "website" TEXT,
    "kvk" TEXT,
    "btw" TEXT,
    "iban" TEXT,
    "graph_client_id" TEXT,
    "graph_tenant_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machine_rate_per_hour" DECIMAL(65,30) NOT NULL,
    "operator_rate_per_hour" DECIMAL(65,30) NOT NULL,
    "default_setup_min" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relaties" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actief" BOOLEAN NOT NULL DEFAULT true,
    "telefoon" TEXT,
    "email" TEXT,
    "email_factuur" TEXT,
    "email_offerte" TEXT,
    "website" TEXT,
    "straat" TEXT,
    "postcode" TEXT,
    "stad" TEXT,
    "land" TEXT NOT NULL DEFAULT 'Nederland',
    "factuur_adres_zelfde" BOOLEAN NOT NULL DEFAULT true,
    "factuur_straat" TEXT,
    "factuur_postcode" TEXT,
    "factuur_stad" TEXT,
    "factuur_land" TEXT,
    "aflever_adres_zelfde" BOOLEAN NOT NULL DEFAULT true,
    "aflever_straat" TEXT,
    "aflever_postcode" TEXT,
    "aflever_stad" TEXT,
    "aflever_land" TEXT,
    "kvk" TEXT,
    "btw" TEXT,
    "iban" TEXT,
    "betalingstermijn" INTEGER,
    "notities" TEXT,
    "contacten" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relaties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "klant" TEXT,
    "relatie_id" TEXT,
    "contact_id" TEXT,
    "tekening" TEXT,
    "rev" TEXT,
    "drawing_path" TEXT,
    "photo_path" TEXT,
    "recipe" JSONB,
    "operations" JSONB NOT NULL DEFAULT '[]',
    "notes" JSONB NOT NULL DEFAULT '{"workholding":"","general":""}',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "estimate" JSONB,
    "locatie" TEXT,
    "current_stock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(65,30),
    "max_stock" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_sequences" (
    "prefix" TEXT NOT NULL,
    "last_n" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doc_sequences_pkey" PRIMARY KEY ("prefix")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "relatie_id" TEXT,
    "contact_id" TEXT,
    "klant_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "levertijd_datum" TEXT,
    "notities" TEXT NOT NULL DEFAULT '',
    "offertes" JSONB NOT NULL DEFAULT '[]',
    "productie_orders" JSONB NOT NULL DEFAULT '[]',
    "paklijst" JSONB,
    "factuur" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zaag_reserveringen" (
    "id" TEXT NOT NULL,
    "calculatie_nr" TEXT NOT NULL,
    "bar_id" TEXT NOT NULL,
    "bar_code" TEXT NOT NULL,
    "bar_location" TEXT NOT NULL,
    "bar_vorm" TEXT NOT NULL,
    "pieces" INTEGER NOT NULL,
    "product_len" DECIMAL(65,30) NOT NULL,
    "saw_length" DECIMAL(65,30) NOT NULL,
    "fysieke_lengte" DECIMAL(65,30) NOT NULL,
    "materiaal" TEXT NOT NULL,
    "diameter" DECIMAL(65,30) NOT NULL,
    "werkstuk_lengte" DECIMAL(65,30) NOT NULL,
    "steekbreedte" DECIMAL(65,30) NOT NULL,
    "vlak_toeslag" DECIMAL(65,30) NOT NULL,
    "machine" TEXT NOT NULL,
    "priority" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rest_lengte_mm" DECIMAL(65,30),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zaag_reserveringen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

