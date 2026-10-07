-- Materiaalnummer alleen cijfers (2026-10-07): M26-0042 werd 260042, omdat de
-- letter en het streepje veel werk waren om van een label over te typen. Wat al
-- is uitgegeven, krijgt de nieuwe vorm; ook de voorraadstukken met dat nummer
-- (M26-0042 → 260042, M26-0042-1 → 260042-1). De teller (M-2026) blijft gelijk.

UPDATE "inkooporder_regels"
SET "materiaal_nummer" = substring("materiaal_nummer" from 2 for 2) || substring("materiaal_nummer" from 5)
WHERE "materiaal_nummer" ~ '^M[0-9]{2}-[0-9]+$';

UPDATE "raw_materials"
SET "code" = substring("code" from 2 for 2) || substring("code" from 5)
WHERE "code" ~ '^M[0-9]{2}-[0-9]+(-[0-9]+)?$';
