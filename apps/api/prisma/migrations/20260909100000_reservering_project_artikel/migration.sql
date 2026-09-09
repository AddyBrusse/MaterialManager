-- Reserveringen koppelen aan een project en een artikel (punt 6 uit
-- features/61-orderproces-backlog.md). Tot nu toe hing een reservering alleen
-- aan `calculatie_nr`, een handmatig ingetypt vrij tekstveld — reserveringen en
-- projecten waren twee losse werelden.
--
-- Beide kolommen zijn optioneel: er wordt ook gezaagd voor werk dat geen project
-- is (voorraad, intern), en `calculatie_nr` blijft de groepering van een zaagbon.
--
-- ON DELETE SET NULL: wordt een project of artikel verwijderd, dan blijft de
-- reservering bestaan met een losse verwijzing in plaats van stilzwijgend te
-- verdwijnen. Het materiaal ligt immers nog steeds vast; iemand moet die keuze
-- zien en maken.
ALTER TABLE "zaag_reserveringen" ADD COLUMN "project_id" TEXT;
ALTER TABLE "zaag_reserveringen" ADD COLUMN "artikel_id" TEXT;

CREATE INDEX "zaag_reserveringen_project_id_idx" ON "zaag_reserveringen"("project_id");
CREATE INDEX "zaag_reserveringen_artikel_id_idx" ON "zaag_reserveringen"("artikel_id");

ALTER TABLE "zaag_reserveringen" ADD CONSTRAINT "zaag_reserveringen_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "zaag_reserveringen" ADD CONSTRAINT "zaag_reserveringen_artikel_id_fkey"
    FOREIGN KEY ("artikel_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
