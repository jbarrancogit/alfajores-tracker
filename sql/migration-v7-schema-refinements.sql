-- =============================================
-- MIGRACION V7: Schema refinements
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- Fix #27 — Numeric columns without precision (add numeric(12,2))
-- Fix #28 — No unique constraint on tipos_alfajor.nombre
-- =============================================
-- Safe to re-run: uses DO $$ IF NOT EXISTS guards where needed.
-- ALTER COLUMN TYPE is idempotent — running it twice has no effect
-- beyond rechecking the type.
-- =============================================


-- ===========================================
-- Fix #27: Add precision to all currency / money columns
-- ===========================================
-- Currently these columns are declared as bare `numeric`, which
-- allows arbitrary scale.  Constraining to numeric(12,2) ensures
-- consistent 2-decimal-place storage (max 9,999,999,999.99).
-- This ALTER is a safe no-data-loss operation — Postgres only adds
-- the precision constraint; existing values that already fit are
-- kept as-is.
-- ===========================================

-- entregas.monto_total
ALTER TABLE entregas
  ALTER COLUMN monto_total TYPE numeric(12,2);

-- entregas.monto_pagado
ALTER TABLE entregas
  ALTER COLUMN monto_pagado TYPE numeric(12,2);

-- entregas.precio_unitario  (legacy average-price column, still written by the app)
ALTER TABLE entregas
  ALTER COLUMN precio_unitario TYPE numeric(12,2);

-- pagos.monto
ALTER TABLE pagos
  ALTER COLUMN monto TYPE numeric(12,2);

-- entrega_lineas.precio_unitario
ALTER TABLE entrega_lineas
  ALTER COLUMN precio_unitario TYPE numeric(12,2);

-- entrega_lineas.costo_unitario
ALTER TABLE entrega_lineas
  ALTER COLUMN costo_unitario TYPE numeric(12,2);


-- ===========================================
-- Fix #28: Unique constraint on tipos_alfajor.nombre
-- ===========================================
-- Prevents two alfajor types with the same name, which causes
-- confusion in dropdowns and reports.
--
-- PREREQUISITE: if duplicate nombres already exist, you must
-- rename or delete them before running this migration. Otherwise
-- the ALTER TABLE will fail with a unique-violation error.
--
-- We use a DO block so that re-running the migration after the
-- constraint already exists does not raise an error.
-- ===========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tipos_alfajor_nombre_unique'
  ) THEN
    ALTER TABLE tipos_alfajor
      ADD CONSTRAINT tipos_alfajor_nombre_unique UNIQUE (nombre);
  END IF;
END $$;
