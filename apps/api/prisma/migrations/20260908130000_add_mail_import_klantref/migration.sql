-- Ordernummer van de klant en de gevraagde leverdatum uit het handelsdocument.
ALTER TABLE "mail_imports" ADD COLUMN "klant_ref" TEXT;
ALTER TABLE "mail_imports" ADD COLUMN "leverdatum" TIMESTAMP(3);
