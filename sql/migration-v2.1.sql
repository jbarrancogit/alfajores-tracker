-- =============================================
-- MIGRACIÓN V2.1: Pago mixto + fix RLS puntos_entrega
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- IMPORTANTE: Para que la invitación de usuarios funcione
-- sin problemas, ir a Supabase Dashboard:
--   Authentication > Providers > Email > Desactivar "Confirm email"
-- (Es una app familiar, no necesita verificación por email)
--
-- También configurar:
--   Authentication > URL Configuration > Site URL:
--     https://jbarrancogit.github.io/alfajores-tracker/
-- =============================================

-- 1. Permitir 'mixto' como forma_pago en entregas
-- Si hay CHECK constraint, lo actualizamos
DO $$
BEGIN
  -- Drop existing check constraint on forma_pago if it exists
  ALTER TABLE entregas DROP CONSTRAINT IF EXISTS entregas_forma_pago_check;

  -- Add updated constraint allowing mixto
  ALTER TABLE entregas ADD CONSTRAINT entregas_forma_pago_check
    CHECK (forma_pago IN ('efectivo', 'transferencia', 'fiado', 'mixto'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No check constraint to update on entregas.forma_pago';
END $$;

-- 2. Fix: Ensure puntos_entrega RLS only allows authenticated users to read
-- Currently returns data to anon (minor security gap)
DROP POLICY IF EXISTS "puntos_select" ON puntos_entrega;
CREATE POLICY "puntos_select" ON puntos_entrega
  FOR SELECT USING (auth.uid() IS NOT NULL);
