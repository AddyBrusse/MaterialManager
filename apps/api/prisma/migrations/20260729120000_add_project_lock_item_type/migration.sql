-- Widen the shared ItemType enum so a project can hold an edit lock.
-- Locks reuse the ItemType enum (see model Lock); stock movements keep their
-- own Zod restriction to raw|finished at the API layer, so this DB-level
-- widening is harmless for movements.
ALTER TYPE "ItemType" ADD VALUE IF NOT EXISTS 'project';
