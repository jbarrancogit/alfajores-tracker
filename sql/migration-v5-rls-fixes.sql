-- =============================================
-- MIGRACION V5: RLS security fixes
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- Fix 1: pagos_insert — was too permissive (any authenticated user)
-- Fix 2: puntos_update — was too permissive (any authenticated user)
-- Fix 3: entrega_lineas missing UPDATE policy

-- ===========================================
-- Fix 1: pagos_insert too permissive
-- OLD: WITH CHECK (auth.uid() IS NOT NULL)
-- NEW: user must own the parent entrega OR be admin
-- ===========================================
DROP POLICY IF EXISTS "pagos_insert" ON pagos;

CREATE POLICY "pagos_insert" ON pagos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = pagos.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

-- ===========================================
-- Fix 2: puntos_update too permissive
-- OLD: USING (auth.uid() IS NOT NULL)
-- NEW: only creator of the punto OR admin
-- ===========================================
DROP POLICY IF EXISTS "puntos_update" ON puntos_entrega;

CREATE POLICY "puntos_update" ON puntos_entrega
  FOR UPDATE USING (creado_por = auth.uid() OR is_admin());

-- ===========================================
-- Fix 3: entrega_lineas missing UPDATE policy
-- Mirrors SELECT/INSERT/DELETE — parent entrega
-- must be owned by user OR user is admin
-- ===========================================
DROP POLICY IF EXISTS "lineas_update" ON entrega_lineas;

CREATE POLICY "lineas_update" ON entrega_lineas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );
