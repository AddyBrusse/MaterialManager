-- "Wat ligt er vast op deze staaf" is vanaf nu een servervraag in plaats van
-- een som die elk scherm zelf maakte. Die vraag filtert altijd op staaf én
-- status (alleen 'open' en 'in_progress' houden materiaal vast), dus die twee
-- kolommen samen in een index.
CREATE INDEX "zaag_reserveringen_bar_id_status_idx"
    ON "zaag_reserveringen"("bar_id", "status");

-- 'geannuleerd' komt erbij naast open/in_progress/done: materiaal vrijgeven
-- zonder af te boeken. De kolom is een gewone TEXT, dus er valt niets aan het
-- type te wijzigen — deze migratie legt alleen vast wanneer de waarde
-- geïntroduceerd is.
