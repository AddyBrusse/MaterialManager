-- Projectdocumenten uit de JSONB-kolommen van "projects" naar eigen tabellen.
-- Zie de beslissing van 2026-09-09 in decisions/90-decisions-log.md.
--
-- Deze migratie doet drie dingen, in volgorde:
--   1. de tabellen aanmaken
--   2. de bestaande JSONB-inhoud overzetten
--   3. de oude kolommen laten vallen
-- Stap 2 leest de camelCase-sleutels zoals de Zod-schema's ze wegschreven.
-- Tijdstempels stonden als ISO-string met een Z erachter; die worden als
-- timestamptz gelezen en als UTC weggeschreven, want zo zet Prisma ze ook neer.

-- ── 1. Tabellen ───────────────────────────────────────────────────────────────

CREATE TABLE "offertes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "versie" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "notities" TEXT NOT NULL DEFAULT '',
    "geldig_tot" TEXT,
    "verzonden_op" TEXT,
    "geaccepteerd_op" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offertes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "offertes_project_id_idx" ON "offertes"("project_id");
CREATE INDEX "offertes_status_idx" ON "offertes"("status");

CREATE TABLE "offerte_regels" (
    "id" TEXT NOT NULL,
    "offerte_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "artikel_id" TEXT,
    "naam" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION NOT NULL,
    "eenheid" TEXT NOT NULL,
    "verkoopprijs" DOUBLE PRECISION NOT NULL,
    "totaal" DOUBLE PRECISION NOT NULL,
    "bewerkingen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "offerte_regels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "offerte_regels_offerte_id_idx" ON "offerte_regels"("offerte_id");

CREATE TABLE "opdrachtbevestigingen" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "offerte_id" TEXT NOT NULL,
    "levertijd_datum" TEXT,
    "notities" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'concept',
    "verzonden_op" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "opdrachtbevestigingen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "opdrachtbevestigingen_project_id_key" ON "opdrachtbevestigingen"("project_id");

CREATE TABLE "ob_regels" (
    "id" TEXT NOT NULL,
    "ob_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "artikel_id" TEXT,
    "naam" TEXT NOT NULL,
    "omschrijving" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION NOT NULL,
    "eenheid" TEXT NOT NULL,
    "verkoopprijs" DOUBLE PRECISION NOT NULL,
    "totaal" DOUBLE PRECISION NOT NULL,
    "bewerkingen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "ob_regels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ob_regels_ob_id_idx" ON "ob_regels"("ob_id");

CREATE TABLE "productie_orders" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "offerte_regel_id" TEXT NOT NULL,
    "artikel_id" TEXT,
    "artikel_naam" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "eenheid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'gepland',
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "productie_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "productie_orders_project_id_idx" ON "productie_orders"("project_id");
CREATE INDEX "productie_orders_status_idx" ON "productie_orders"("status");

CREATE TABLE "productie_stappen" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "volgorde" INTEGER NOT NULL,
    "naam" TEXT NOT NULL,
    "machine" TEXT,
    "gereed_op" TEXT,
    "gereed_door" TEXT,
    "gepland_datum" TEXT,
    "gepland_machine" TEXT,
    "queue_position" DOUBLE PRECISION,
    "not_before" TEXT,
    CONSTRAINT "productie_stappen_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "productie_stappen_order_id_idx" ON "productie_stappen"("order_id");
CREATE INDEX "productie_stappen_gepland_machine_queue_position_idx" ON "productie_stappen"("gepland_machine", "queue_position");

CREATE TABLE "paklijsten" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "notities" TEXT NOT NULL DEFAULT '',
    "verzonden_op" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paklijsten_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "paklijsten_project_id_idx" ON "paklijsten"("project_id");

CREATE TABLE "paklijst_regels" (
    "id" TEXT NOT NULL,
    "paklijst_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "productie_order_id" TEXT NOT NULL,
    "artikel_naam" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "eenheid" TEXT NOT NULL,
    CONSTRAINT "paklijst_regels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "paklijst_regels_paklijst_id_idx" ON "paklijst_regels"("paklijst_id");

CREATE TABLE "facturen" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "offerte_id" TEXT NOT NULL,
    "btw_pct" DOUBLE PRECISION NOT NULL,
    "subtotaal" DOUBLE PRECISION NOT NULL,
    "btw_bedrag" DOUBLE PRECISION NOT NULL,
    "totaal_incl_btw" DOUBLE PRECISION NOT NULL,
    "notities" TEXT NOT NULL DEFAULT '',
    "vervaldatum" TEXT,
    "verzonden_op" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "facturen_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "facturen_project_id_idx" ON "facturen"("project_id");
CREATE INDEX "facturen_verzonden_op_idx" ON "facturen"("verzonden_op");

CREATE TABLE "factuur_regels" (
    "id" TEXT NOT NULL,
    "factuur_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "offerte_regel_id" TEXT NOT NULL,
    "naam" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "eenheid" TEXT NOT NULL,
    "verkoopprijs" DOUBLE PRECISION NOT NULL,
    "totaal" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "factuur_regels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "factuur_regels_factuur_id_idx" ON "factuur_regels"("factuur_id");

ALTER TABLE "offertes" ADD CONSTRAINT "offertes_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offerte_regels" ADD CONSTRAINT "offerte_regels_offerte_id_fkey"
    FOREIGN KEY ("offerte_id") REFERENCES "offertes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opdrachtbevestigingen" ADD CONSTRAINT "opdrachtbevestigingen_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ob_regels" ADD CONSTRAINT "ob_regels_ob_id_fkey"
    FOREIGN KEY ("ob_id") REFERENCES "opdrachtbevestigingen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "productie_orders" ADD CONSTRAINT "productie_orders_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "productie_stappen" ADD CONSTRAINT "productie_stappen_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "productie_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paklijsten" ADD CONSTRAINT "paklijsten_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paklijst_regels" ADD CONSTRAINT "paklijst_regels_paklijst_id_fkey"
    FOREIGN KEY ("paklijst_id") REFERENCES "paklijsten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facturen" ADD CONSTRAINT "facturen_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factuur_regels" ADD CONSTRAINT "factuur_regels_factuur_id_fkey"
    FOREIGN KEY ("factuur_id") REFERENCES "facturen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Bestaande inhoud overzetten ────────────────────────────────────────────

INSERT INTO "offertes" (
    "id", "project_id", "versie", "status", "notities",
    "geldig_tot", "verzonden_op", "geaccepteerd_op", "created_at", "updated_at")
SELECT
    o->>'id',
    p."id",
    COALESCE((o->>'versie')::int, 1),
    COALESCE(o->>'status', 'concept'),
    COALESCE(o->>'notities', ''),
    o->>'geldigTot',
    o->>'verzondenOp',
    o->>'geaccepteerdOp',
    COALESCE((o->>'createdAt')::timestamptz AT TIME ZONE 'UTC', p."created_at"),
    COALESCE((o->>'updatedAt')::timestamptz AT TIME ZONE 'UTC', p."updated_at")
FROM "projects" p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p."offertes", '[]'::jsonb)) AS o
WHERE o->>'id' IS NOT NULL;

INSERT INTO "offerte_regels" (
    "id", "offerte_id", "sort_order", "artikel_id", "naam", "omschrijving",
    "qty", "eenheid", "verkoopprijs", "totaal", "bewerkingen")
SELECT
    r->>'id',
    o->>'id',
    COALESCE((r->>'sortOrder')::int, ord::int),
    r->>'artikelId',
    COALESCE(r->>'naam', ''),
    COALESCE(r->>'omschrijving', ''),
    COALESCE((r->>'qty')::double precision, 0),
    COALESCE(r->>'eenheid', 'stuks'),
    COALESCE((r->>'verkoopprijs')::double precision, 0),
    COALESCE((r->>'totaal')::double precision, 0),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'bewerkingen', '[]'::jsonb)))
FROM "projects" p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p."offertes", '[]'::jsonb)) AS o
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o->'regels', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)
WHERE o->>'id' IS NOT NULL AND r->>'id' IS NOT NULL;

INSERT INTO "opdrachtbevestigingen" (
    "id", "project_id", "offerte_id", "levertijd_datum", "notities",
    "status", "verzonden_op", "created_at", "updated_at")
SELECT
    b->>'id',
    p."id",
    COALESCE(b->>'offerteId', ''),
    b->>'levertijdDatum',
    COALESCE(b->>'notities', ''),
    COALESCE(b->>'status', 'concept'),
    b->>'verzondenOp',
    COALESCE((b->>'createdAt')::timestamptz AT TIME ZONE 'UTC', p."created_at"),
    COALESCE((b->>'updatedAt')::timestamptz AT TIME ZONE 'UTC', p."updated_at")
FROM "projects" p
CROSS JOIN LATERAL (SELECT p."opdrachtbevestiging" AS b) AS x
WHERE b IS NOT NULL AND jsonb_typeof(b) = 'object' AND b->>'id' IS NOT NULL;

INSERT INTO "ob_regels" (
    "id", "ob_id", "sort_order", "artikel_id", "naam", "omschrijving",
    "qty", "eenheid", "verkoopprijs", "totaal", "bewerkingen")
SELECT
    r->>'id',
    b->>'id',
    COALESCE((r->>'sortOrder')::int, ord::int),
    r->>'artikelId',
    COALESCE(r->>'naam', ''),
    COALESCE(r->>'omschrijving', ''),
    COALESCE((r->>'qty')::double precision, 0),
    COALESCE(r->>'eenheid', 'stuks'),
    COALESCE((r->>'verkoopprijs')::double precision, 0),
    COALESCE((r->>'totaal')::double precision, 0),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'bewerkingen', '[]'::jsonb)))
FROM "projects" p
CROSS JOIN LATERAL (SELECT p."opdrachtbevestiging" AS b) AS x
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b->'regels', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)
WHERE b IS NOT NULL AND jsonb_typeof(b) = 'object' AND b->>'id' IS NOT NULL AND r->>'id' IS NOT NULL;

INSERT INTO "productie_orders" (
    "id", "project_id", "offerte_regel_id", "artikel_id", "artikel_naam",
    "qty", "eenheid", "status", "created_at", "updated_at")
SELECT
    o->>'id',
    p."id",
    COALESCE(o->>'offerteRegelId', ''),
    o->>'artikelId',
    COALESCE(o->>'artikelNaam', ''),
    COALESCE((o->>'qty')::double precision, 0),
    COALESCE(o->>'eenheid', 'stuks'),
    COALESCE(o->>'status', 'gepland'),
    COALESCE((o->>'createdAt')::timestamptz AT TIME ZONE 'UTC', p."created_at"),
    COALESCE((o->>'updatedAt')::timestamptz AT TIME ZONE 'UTC', p."updated_at")
FROM "projects" p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p."productie_orders", '[]'::jsonb)) AS o
WHERE o->>'id' IS NOT NULL;

INSERT INTO "productie_stappen" (
    "id", "order_id", "volgorde", "naam", "machine", "gereed_op", "gereed_door",
    "gepland_datum", "gepland_machine", "queue_position", "not_before")
SELECT
    s->>'id',
    o->>'id',
    COALESCE((s->>'volgorde')::int, ord::int),
    COALESCE(s->>'naam', ''),
    s->>'machine',
    s->>'gereedOp',
    s->>'gereedDoor',
    s->>'geplandDatum',
    s->>'geplandMachine',
    (s->>'queuePosition')::double precision,
    s->>'notBefore'
FROM "projects" p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p."productie_orders", '[]'::jsonb)) AS o
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o->'stappen', '[]'::jsonb)) WITH ORDINALITY AS t(s, ord)
WHERE o->>'id' IS NOT NULL AND s->>'id' IS NOT NULL;

INSERT INTO "paklijsten" ("id", "project_id", "notities", "verzonden_op", "created_at")
SELECT
    l->>'id',
    p."id",
    COALESCE(l->>'notities', ''),
    l->>'verzondenOp',
    COALESCE((l->>'createdAt')::timestamptz AT TIME ZONE 'UTC', p."created_at")
FROM "projects" p
CROSS JOIN LATERAL (SELECT p."paklijst" AS l) AS x
WHERE l IS NOT NULL AND jsonb_typeof(l) = 'object' AND l->>'id' IS NOT NULL;

-- De paklijstregel had geen eigen id in de JSON. De sleutel wordt afgeleid van
-- de paklijst plus de productieorder waar de regel bij hoort: die combinatie is
-- uniek binnen een paklijst en blijft gelijk bij het opnieuw wegschrijven, zodat
-- een bewaaractie geen rijen omwisselt.
INSERT INTO "paklijst_regels" (
    "id", "paklijst_id", "sort_order", "productie_order_id", "artikel_naam", "qty", "eenheid")
SELECT
    (l->>'id') || ':' || COALESCE(r->>'productieOrderId', ord::text),
    l->>'id',
    ord::int,
    COALESCE(r->>'productieOrderId', ''),
    COALESCE(r->>'artikelNaam', ''),
    COALESCE((r->>'qty')::double precision, 0),
    COALESCE(r->>'eenheid', 'stuks')
FROM "projects" p
CROSS JOIN LATERAL (SELECT p."paklijst" AS l) AS x
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(l->'regels', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)
WHERE l IS NOT NULL AND jsonb_typeof(l) = 'object' AND l->>'id' IS NOT NULL;

INSERT INTO "facturen" (
    "id", "project_id", "offerte_id", "btw_pct", "subtotaal", "btw_bedrag",
    "totaal_incl_btw", "notities", "vervaldatum", "verzonden_op", "created_at")
SELECT
    f->>'id',
    p."id",
    COALESCE(f->>'offerteId', ''),
    COALESCE((f->>'btwPct')::double precision, 21),
    COALESCE((f->>'subtotaal')::double precision, 0),
    COALESCE((f->>'btwBedrag')::double precision, 0),
    COALESCE((f->>'totaalInclBtw')::double precision, 0),
    COALESCE(f->>'notities', ''),
    f->>'vervaldatum',
    f->>'verzondenOp',
    COALESCE((f->>'createdAt')::timestamptz AT TIME ZONE 'UTC', p."created_at")
FROM "projects" p
CROSS JOIN LATERAL (SELECT p."factuur" AS f) AS x
WHERE f IS NOT NULL AND jsonb_typeof(f) = 'object' AND f->>'id' IS NOT NULL;

-- Zelfde afleiding als bij de paklijstregel, hier op de offerteregel.
INSERT INTO "factuur_regels" (
    "id", "factuur_id", "sort_order", "offerte_regel_id", "naam", "qty",
    "eenheid", "verkoopprijs", "totaal")
SELECT
    (f->>'id') || ':' || COALESCE(r->>'offerteRegelId', ord::text),
    f->>'id',
    ord::int,
    COALESCE(r->>'offerteRegelId', ''),
    COALESCE(r->>'naam', ''),
    COALESCE((r->>'qty')::double precision, 0),
    COALESCE(r->>'eenheid', 'stuks'),
    COALESCE((r->>'verkoopprijs')::double precision, 0),
    COALESCE((r->>'totaal')::double precision, 0)
FROM "projects" p
CROSS JOIN LATERAL (SELECT p."factuur" AS f) AS x
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f->'regels', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)
WHERE f IS NOT NULL AND jsonb_typeof(f) = 'object' AND f->>'id' IS NOT NULL;

-- ── 3. Oude kolommen weg ──────────────────────────────────────────────────────

ALTER TABLE "projects" DROP COLUMN "offertes";
ALTER TABLE "projects" DROP COLUMN "opdrachtbevestiging";
ALTER TABLE "projects" DROP COLUMN "productie_orders";
ALTER TABLE "projects" DROP COLUMN "paklijst";
ALTER TABLE "projects" DROP COLUMN "factuur";
