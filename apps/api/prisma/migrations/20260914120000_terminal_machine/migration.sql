-- Een terminalscherm aan een machine koppelen.
--
-- De wachtrij van de terminal liep hiervoor op accountnaam: die moest exact
-- gelijk zijn aan wat er op de productiestap staat. Noemde de stap "Draaibank"
-- en het account "DMG 450TC EcoLine", dan bleef het scherm leeg terwijl er werk
-- lag — waargenomen 2026-09-14. Een verwijzing kan niet uit de pas lopen met
-- een hernoeming.
ALTER TABLE "users" ADD COLUMN "machine_id" TEXT;

CREATE INDEX "users_machine_id_idx" ON "users"("machine_id");

ALTER TABLE "users"
  ADD CONSTRAINT "users_machine_id_fkey"
  FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
