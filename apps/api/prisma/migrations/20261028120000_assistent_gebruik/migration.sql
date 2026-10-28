-- Tokengebruik van de AI-assistent (2026-10-28): één rij per antwoord.
-- CreateTable
CREATE TABLE "assistent_gebruik" (
    "id" TEXT NOT NULL,
    "op" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soort" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rondes" INTEGER NOT NULL,
    "invoer" INTEGER NOT NULL,
    "cache_lezen" INTEGER NOT NULL,
    "cache_schrijven" INTEGER NOT NULL,
    "uitvoer" INTEGER NOT NULL,

    CONSTRAINT "assistent_gebruik_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistent_gebruik_op_idx" ON "assistent_gebruik"("op");

