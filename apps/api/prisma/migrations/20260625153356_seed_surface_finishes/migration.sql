-- Seed starting surface finishes (admin can rename/add/remove afterward).
INSERT INTO "surface_finishes" ("id", "name") VALUES
  (gen_random_uuid(), 'Blank'),
  (gen_random_uuid(), 'Ruw'),
  (gen_random_uuid(), 'WGW'),
  (gen_random_uuid(), 'KGW');
