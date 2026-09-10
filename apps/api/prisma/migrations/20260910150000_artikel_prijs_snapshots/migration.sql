-- Prijshistorie per artikel. Tot nu toe overschreef elke opslag van een
-- calculatie de vorige kostprijs (`articles.estimate` is één JSON-kolom), en
-- stond de verkoopprijs alleen op de offerteregel van dat ene project. Je kon
-- dus niet zien wat je een klant eerder rekende, en niet waarom een kostprijs
-- veranderd was.
--
-- Twee bronnen in één tabel ('order' en 'calculatie') zodat het scherm er één
-- doorlopende lijn van kan maken: de calculatiepunten geven het verloop, de
-- orderpunten de momenten waarop er echt iets verkocht is.
--
-- ON DELETE CASCADE: de historie hoort bij het artikel en heeft er zonder geen
-- betekenis. project_id/offerte_id zijn bewust GEEN foreign keys — een project
-- mag opgeruimd worden zonder dat de prijshistorie gaten krijgt; klantnaam en
-- aantal staan er los bij zodat de rij op zichzelf leesbaar blijft.
CREATE TABLE "artikel_prijs_snapshots" (
    "id"                    TEXT NOT NULL,
    "artikel_id"            TEXT NOT NULL,
    "bron"                  TEXT NOT NULL,
    "gemeten_op"            TIMESTAMP(3) NOT NULL,

    "qty"                   DOUBLE PRECISION NOT NULL,
    "kostprijs_per_stuk"    DOUBLE PRECISION NOT NULL,
    -- Herrekend bij 1 stuk: de enige maat die over de tijd vergelijkbaar is.
    -- kostprijs_per_stuk hangt aan het aantal van dat moment (insteltijd gaat
    -- over de batch), dus een order van 10 stuks zou de lijn laten kelderen
    -- zonder dat er iets goedkoper geworden is.
    "kostprijs_basis"       DOUBLE PRECISION NOT NULL,
    "verkoopprijs_basis"    DOUBLE PRECISION NOT NULL,
    "verkoopprijs_per_stuk" DOUBLE PRECISION,
    "marge_pct"             DOUBLE PRECISION,
    "kostprijs_totaal"      DOUBLE PRECISION NOT NULL,
    "verkoopprijs_totaal"   DOUBLE PRECISION,

    "materiaal_per_stuk"    DOUBLE PRECISION NOT NULL,
    "instellen_per_stuk"    DOUBLE PRECISION NOT NULL,
    "bewerking_per_stuk"    DOUBLE PRECISION NOT NULL,
    "extern_per_stuk"       DOUBLE PRECISION NOT NULL,

    "project_id"            TEXT,
    "offerte_id"            TEXT,
    "offerte_regel_id"      TEXT,
    "relatie_id"            TEXT,
    "klant"                 TEXT,
    "door"                  TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artikel_prijs_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "artikel_prijs_snapshots_artikel_id_gemeten_op_idx"
    ON "artikel_prijs_snapshots"("artikel_id", "gemeten_op");

ALTER TABLE "artikel_prijs_snapshots" ADD CONSTRAINT "artikel_prijs_snapshots_artikel_id_fkey"
    FOREIGN KEY ("artikel_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
