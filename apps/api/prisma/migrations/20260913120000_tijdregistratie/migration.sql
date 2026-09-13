-- Tijdregistratie: één rij per keer dat er een klok op een productiestap loopt.
--
-- De indeling spiegelt de calculatie: instellen telt één keer per batch, draaien
-- per stuk. Zonder dat onderscheid valt geschat en werkelijk achteraf niet te
-- vergelijken.

-- Een machinescherm op de werkvloer krijgt een eigen rol, geen gewone
-- gebruiker: de app toont kostprijzen en klantgegevens en een werkvloer-pc hoort
-- daar niet bij te kunnen.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'terminal';

CREATE TABLE "tijdregistraties" (
  "id"                   TEXT NOT NULL,
  "stap_id"              TEXT NOT NULL,
  "order_id"             TEXT NOT NULL,
  "project_id"           TEXT NOT NULL,
  "artikel_id"           TEXT,
  "artikel_naam"         TEXT NOT NULL,

  "soort"                TEXT NOT NULL,
  "bemand"               BOOLEAN NOT NULL DEFAULT true,
  "status"               TEXT NOT NULL DEFAULT 'lopend',

  "machine_naam"         TEXT,
  "user_id"              TEXT,
  "user_naam"            TEXT,

  "gestart_op"           TIMESTAMP(3) NOT NULL,
  "lopend_sinds"         TIMESTAMP(3),
  "gestopt_op"           TIMESTAMP(3),

  "gemeten_seconden"     INTEGER NOT NULL DEFAULT 0,

  "bijgestelde_seconden" INTEGER,
  "correctie_reden"      TEXT,
  "correctie_door"       TEXT,
  "correctie_op"         TIMESTAMP(3),

  "aantal_stuks"         INTEGER,
  "notitie"              TEXT,

  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tijdregistraties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tijdregistraties_stap_id_idx"    ON "tijdregistraties"("stap_id");
CREATE INDEX "tijdregistraties_project_id_idx" ON "tijdregistraties"("project_id");
-- De nacalculatie per artikel leest hier op; alleen afgeronde regels tellen.
CREATE INDEX "tijdregistraties_artikel_id_status_idx" ON "tijdregistraties"("artikel_id", "status");
-- "Wat loopt er nu" is de vraag die elke vijf seconden gesteld wordt.
CREATE INDEX "tijdregistraties_status_gestart_op_idx" ON "tijdregistraties"("status", "gestart_op");

ALTER TABLE "tijdregistraties"
  ADD CONSTRAINT "tijdregistraties_stap_id_fkey"
  FOREIGN KEY ("stap_id") REFERENCES "productie_stappen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tijdregistraties"
  ADD CONSTRAINT "tijdregistraties_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
