-- Opdrachtreferentie en verzendlogboek op de opdrachtbevestiging (2026-09-28).
ALTER TABLE "opdrachtbevestigingen" ADD COLUMN "opdracht_ref" TEXT;
ALTER TABLE "opdrachtbevestigingen" ADD COLUMN "verzendingen" JSONB NOT NULL DEFAULT '[]';

-- Bestaande opdrachten krijgen de referentie van het project, net als een
-- nieuwe bij het accepteren (afgesproken 2026-09-28).
UPDATE "opdrachtbevestigingen" ob
SET "opdracht_ref" = p."klant_ref"
FROM "projects" p
WHERE p."id" = ob."project_id";

-- Wat al verstuurd was, krijgt één logregel met de datum die er stond. Wat de
-- klant toen precies kreeg weten we niet meer; de inhoud is die van nu, zodat
-- er achteraf geen verschil gemeld wordt dat niet bestaat.
UPDATE "opdrachtbevestigingen" ob
SET "verzendingen" = jsonb_build_array(jsonb_build_object(
  'op', ob."verzonden_op",
  'door', 'onbekend (vóór het logboek)',
  'naar', NULL,
  'inhoud', jsonb_build_object(
    'levertijd', p."levertijd_datum",
    'opdrachtRef', ob."opdracht_ref",
    'notities', ob."notities",
    'regels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r."id", 'naam', r."naam", 'qty', r."qty", 'verkoopprijs', r."verkoopprijs") ORDER BY r."sort_order")
      FROM "ob_regels" r WHERE r."ob_id" = ob."id"
    ), '[]'::jsonb)
  )
))
FROM "projects" p
WHERE p."id" = ob."project_id" AND ob."verzonden_op" IS NOT NULL;

-- Reserveringen weten voortaan bij welke orderregel ze horen.
ALTER TABLE "zaag_reserveringen" ADD COLUMN "offerte_regel_id" TEXT;
CREATE INDEX "zaag_reserveringen_offerte_regel_id_idx" ON "zaag_reserveringen"("offerte_regel_id");

-- Bestaande reserveringen: alleen invullen waar het ondubbelzinnig is — één
-- regel met dat artikel in de opdracht van dat project. Bij twee regels met
-- hetzelfde artikel blijft het leeg; dan valt het scherm terug op het artikel.
UPDATE "zaag_reserveringen" z
SET "offerte_regel_id" = r."id"
FROM "opdrachtbevestigingen" ob
JOIN "ob_regels" r ON r."ob_id" = ob."id"
WHERE ob."project_id" = z."project_id"
  AND r."artikel_id" = z."artikel_id"
  AND z."offerte_regel_id" IS NULL
  AND (SELECT count(*) FROM "ob_regels" r2 WHERE r2."ob_id" = ob."id" AND r2."artikel_id" = z."artikel_id") = 1;
