-- On hold zetten en annuleren van een project (punt 4 uit
-- features/61-orderproces-backlog.md). Beide statussen bestonden al in de enum
-- en in de UI, maar er was geen manier om ze te zetten.
--
-- status_reden  : waarom het project stilligt of afgeblazen is.
-- status_vorige : waar het vandaan kwam, zodat hervatten terugkan naar precies
--                 die stap in plaats van naar een gok.
ALTER TABLE "projects" ADD COLUMN "status_reden" TEXT;
ALTER TABLE "projects" ADD COLUMN "status_vorige" TEXT;
