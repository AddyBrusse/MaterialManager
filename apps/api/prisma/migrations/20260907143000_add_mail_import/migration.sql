-- CreateTable
CREATE TABLE "mail_imports" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "afzender_naam" TEXT,
    "afzender_email" TEXT,
    "onderwerp" TEXT NOT NULL,
    "ontvangen_op" TIMESTAMP(3),
    "body_text" TEXT NOT NULL DEFAULT '',
    "body_html_path" TEXT,
    "bijlagen" JSONB NOT NULL DEFAULT '[]',
    "resolutie" JSONB,
    "relatie_id" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'onbekend',
    "kandidaten" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'nieuw',
    "project_id" TEXT,
    "foutmelding" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_aliases" (
    "id" TEXT NOT NULL,
    "relatie_id" TEXT NOT NULL,
    "external_ref" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "article_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_imports_dedupe_key_key" ON "mail_imports"("dedupe_key");

-- CreateIndex
CREATE INDEX "mail_imports_status_idx" ON "mail_imports"("status");

-- CreateIndex
CREATE INDEX "mail_imports_relatie_id_idx" ON "mail_imports"("relatie_id");

-- CreateIndex
CREATE INDEX "article_aliases_article_id_idx" ON "article_aliases"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_aliases_relatie_id_external_ref_key" ON "article_aliases"("relatie_id", "external_ref");

