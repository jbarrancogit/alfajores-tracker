-- =============================================
-- MIGRACIÓN V10: Allow 'transferencia_mauri' in CHECK constraints
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- BUG: entregas.forma_pago and pagos.forma_pago CHECK constraints
-- were never updated when Transfer Mauri was added, causing
-- "violates check constraint" on save.
-- =============================================

-- 1. Update entregas.forma_pago to include 'transferencia_mauri'
ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_forma_pago_check;
ALTER TABLE entregas ADD CONSTRAINT entregas_forma_pago_check
  CHECK (forma_pago IN ('efectivo', 'transferencia', 'transferencia_mauri', 'fiado', 'mixto'));

-- 2. Update pagos.forma_pago to include 'transferencia_mauri'
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_forma_pago_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_forma_pago_check
  CHECK (forma_pago IN ('efectivo', 'transferencia', 'transferencia_mauri'));
