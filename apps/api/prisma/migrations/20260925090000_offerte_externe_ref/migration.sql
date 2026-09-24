-- Waar een offerteversie antwoord op geeft: een RFQ-nummer van de klant, of
-- "mail J. Prins 12-09". Per versie, want een herziening beantwoordt vaak een
-- nieuwe vraag; staffels op dezelfde RFQ delen hem.
--
-- Bewust nullable en zonder default. Draait iemand terug naar code van vóór
-- deze kolom, dan negeert die hem gewoon: er is geen NOT NULL die een insert
-- van oude code laat mislukken (zoals bij document_nr wél het geval is).
ALTER TABLE "offertes" ADD COLUMN "externe_ref" TEXT;
