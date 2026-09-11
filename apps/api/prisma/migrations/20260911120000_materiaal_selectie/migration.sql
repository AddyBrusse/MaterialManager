-- Materiaalselectie bij het aanmaken van een opdracht.
--
-- Draaiwerk gaat via een stangenlader: de draaibank trekt een stang van pakweg
-- 500–1100 mm naar binnen. Welke lengte optimaal is hangt af van de machine,
-- dus die grenzen horen bij de machine en niet bij de zaagbon. Per zaagbon mag
-- er alsnog van afgeweken worden.
ALTER TABLE "machines" ADD COLUMN "barloader_min_mm"  INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "machines" ADD COLUMN "barloader_max_mm"  INTEGER NOT NULL DEFAULT 1100;
ALTER TABLE "machines" ADD COLUMN "opspanlengte_mm"   INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "machines" ADD COLUMN "afsteek_mm"        INTEGER NOT NULL DEFAULT 3;

-- De schrootdrempel gaat over de voorraad en niet over één machine: een restant
-- hieronder is geen bruikbaar stuk staal meer.
ALTER TABLE "company" ADD COLUMN "schroot_drempel_mm" INTEGER NOT NULL DEFAULT 200;

-- Todo's die het programma zelf aanmaakt dragen waar ze over gaan, zodat de
-- lijst er een knop naast kan zetten die de handeling opent in plaats van
-- alleen een zin te tonen. Losse todo's houden deze velden leeg.
ALTER TABLE "todos" ADD COLUMN "soort"            TEXT;
ALTER TABLE "todos" ADD COLUMN "project_id"       TEXT;
ALTER TABLE "todos" ADD COLUMN "artikel_id"       TEXT;
ALTER TABLE "todos" ADD COLUMN "offerte_regel_id" TEXT;

CREATE INDEX "todos_soort_done_idx"  ON "todos"("soort", "done");
CREATE INDEX "todos_project_id_idx"  ON "todos"("project_id");
