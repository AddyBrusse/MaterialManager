-- Metingen van het inlezen van een mail, om de wachttijd te kunnen voorspellen.
CREATE TABLE "ingest_runs" (
    "id" TEXT NOT NULL,
    "mail_import_id" TEXT,
    "soort" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "bijlagen" INTEGER NOT NULL,
    "tekens" INTEGER NOT NULL,
    "scans" INTEGER NOT NULL,
    "ai_gebruikt" BOOLEAN NOT NULL,
    "controle" BOOLEAN NOT NULL,
    "duur_ms" INTEGER NOT NULL,
    "gelukt" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingest_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ingest_runs_created_at_idx" ON "ingest_runs"("created_at");
