-- Logboek van handmatige wijzigingen aan de nummerreeksen (2026-10-05).
CREATE TABLE "doc_reeks_wijzigingen" (
    "id" TEXT NOT NULL,
    "sleutel" TEXT NOT NULL,
    "van" INTEGER NOT NULL,
    "naar" INTEGER NOT NULL,
    "reden" TEXT NOT NULL,
    "door" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_reeks_wijzigingen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "doc_reeks_wijzigingen_created_at_idx" ON "doc_reeks_wijzigingen"("created_at");
