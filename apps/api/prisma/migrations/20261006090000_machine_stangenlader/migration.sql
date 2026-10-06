-- Draaibank met stangenlader (2026-10-06). Alleen dan rekent de calculatie
-- afsteek en opspanstukje mee in de bruto lengte. Standaard uit, ook voor de
-- bestaande machines: in de lijst staan ook zagen en freesmachines, en een
-- lader daar maakt de calculatie te duur. Vink de draaibanken met lader aan in
-- Instellingen → Machines.
ALTER TABLE "machines" ADD COLUMN "heeft_stangenlader" BOOLEAN NOT NULL DEFAULT false;
