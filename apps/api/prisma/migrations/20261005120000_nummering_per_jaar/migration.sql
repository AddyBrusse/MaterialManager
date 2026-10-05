-- Nummering per jaar (2026-10-05). De teller van een documentsoort heet voortaan
-- '<PREFIX>-<JAAR>' in plaats van '<PREFIX>', zodat elke reeks op 1 januari
-- vanzelf bij 001 begint. De reeks van dit jaar loopt door waar hij was: de oude
-- jaarloze teller wordt de teller van 2026. Bewust 2026 en niet het jaar van
-- uitvoeren — draait deze migratie pas in 2027, dan hoort 2027 bij 001 te
-- beginnen en niet door te tellen op 2026.
--
-- De oude rijen blijven staan (niemand leest ze nog); 'ART' (artikelcodes)
-- heeft geen jaar en blijft zoals hij is.
INSERT INTO "doc_sequences" ("prefix", "last_n")
SELECT "prefix" || '-2026', "last_n"
FROM "doc_sequences"
WHERE "prefix" IN ('PRJ', 'OFF', 'OB', 'PROD', 'PL', 'FACT', 'CRED')
ON CONFLICT ("prefix") DO UPDATE SET "last_n" = GREATEST("doc_sequences"."last_n", EXCLUDED."last_n");
