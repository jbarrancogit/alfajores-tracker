-- =============================================
-- MIGRACION V9: Security fixes + data integrity checks
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- C4:  Prevent privilege escalation on self-insert (usuarios)
-- H8:  Restrict puntos_entrega SELECT to authenticated users
-- H10: Add missing DELETE/UPDATE policies
-- LOW: Add CHECK constraints on rol and comision_pct
-- DIAG: Detect duplicate payments (double-tap) and orphaned entregas
-- =============================================
-- Safe to re-run: uses DROP IF EXISTS / DO $$ guards throughout.
-- =============================================


-- ===========================================
-- C4: Prevent privilege escalation
-- A user could craft a direct API call to insert their own
-- profile with rol='admin'. Force rol='repartidor' on self-insert.
-- ===========================================

DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;

CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT WITH CHECK (
    (id = auth.uid() AND rol = 'repartidor') OR is_admin()
  );


-- ===========================================
-- H8: Restrict puntos_entrega SELECT to authenticated users
-- Was USING (true) which exposes PII (names, addresses, phones, GPS)
-- to unauthenticated requests. Portal access preserved via
-- portal_puntos_select policy (uses client_token header).
-- ===========================================

DROP POLICY IF EXISTS "puntos_select" ON puntos_entrega;

CREATE POLICY "puntos_select" ON puntos_entrega
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ===========================================
-- H10: Missing DELETE policy on entregas (admin-only)
-- ===========================================

DROP POLICY IF EXISTS "entregas_delete" ON entregas;

CREATE POLICY "entregas_delete" ON entregas
  FOR DELETE USING (is_admin());


-- ===========================================
-- H10: Missing DELETE policy on usuarios (admin-only)
-- ===========================================

DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;

CREATE POLICY "usuarios_delete" ON usuarios
  FOR DELETE USING (is_admin());


-- ===========================================
-- H10: Missing UPDATE policy on pagos (admin-only)
-- Needed for payment corrections and future edit functionality.
-- ===========================================

DROP POLICY IF EXISTS "pagos_update" ON pagos;

CREATE POLICY "pagos_update" ON pagos
  FOR UPDATE USING (is_admin());


-- ===========================================
-- LOW: CHECK constraints on usuarios columns
-- ===========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'repartidor'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_comision_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_comision_check
        CHECK (comision_pct >= 0 AND comision_pct <= 100);
  END IF;
END $$;


-- ===========================================
-- DIAGNOSTIC: Detect potential duplicate payments (double-tap)
-- These are payments registered within 5 seconds of each other
-- for the same entrega with the same monto and forma_pago.
-- Review output and DELETE duplicates if confirmed.
-- ===========================================

-- Run this SELECT to review (does NOT modify data):
/*
SELECT
  p1.id AS pago_id,
  p1.entrega_id,
  p1.monto,
  p1.forma_pago,
  p1.fecha,
  pe.nombre AS cliente,
  u.nombre AS registrado_por,
  'POSIBLE DUPLICADO' AS nota
FROM pagos p1
JOIN pagos p2
  ON p1.entrega_id = p2.entrega_id
  AND p1.monto = p2.monto
  AND p1.forma_pago = p2.forma_pago
  AND p1.id > p2.id
  AND ABS(EXTRACT(EPOCH FROM (p1.fecha - p2.fecha))) < 5
LEFT JOIN entregas e ON e.id = p1.entrega_id
LEFT JOIN puntos_entrega pe ON pe.id = e.punto_entrega_id
LEFT JOIN usuarios u ON u.id = p1.registrado_por
ORDER BY p1.fecha DESC;
*/

-- To delete confirmed duplicates (keep the first, remove the second):
/*
DELETE FROM pagos
WHERE id IN (
  SELECT p1.id
  FROM pagos p1
  JOIN pagos p2
    ON p1.entrega_id = p2.entrega_id
    AND p1.monto = p2.monto
    AND p1.forma_pago = p2.forma_pago
    AND p1.id > p2.id
    AND ABS(EXTRACT(EPOCH FROM (p1.fecha - p2.fecha))) < 5
);
-- The trg_sync_pago_delete trigger will auto-resync monto_pagado
*/


-- ===========================================
-- DIAGNOSTIC: Detect orphaned entregas (no lines)
-- These can happen if line insert failed after entrega insert.
-- ===========================================

-- Run this SELECT to review:
/*
SELECT e.id, e.fecha_hora, e.monto_total, e.cantidad,
       u.nombre AS repartidor, pe.nombre AS cliente
FROM entregas e
LEFT JOIN entrega_lineas el ON el.entrega_id = e.id
LEFT JOIN usuarios u ON u.id = e.repartidor_id
LEFT JOIN puntos_entrega pe ON pe.id = e.punto_entrega_id
WHERE el.id IS NULL
ORDER BY e.fecha_hora DESC;
*/


-- ===========================================
-- DIAGNOSTIC: Verify no unauthorized admin accounts
-- ===========================================

-- Run this SELECT to review:
/*
SELECT id, nombre, rol, comision_pct
FROM usuarios
WHERE rol = 'admin'
ORDER BY nombre;
*/
