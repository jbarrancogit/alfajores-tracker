-- =============================================
-- MIGRACION V6: Performance indexes & pago-delete trigger
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- Fix #15 — Missing performance indexes on frequently queried columns
-- Fix #17 — forma_pago desync when a pago is deleted
-- =============================================
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS throughout.
-- =============================================


-- ===========================================
-- Fix #15: Performance indexes
-- ===========================================

-- entregas is queried sorted by date on almost every screen
CREATE INDEX IF NOT EXISTS idx_entregas_fecha_hora
  ON entregas(fecha_hora DESC);

-- entregas filtered by punto_entrega (delivery point detail, reports)
CREATE INDEX IF NOT EXISTS idx_entregas_punto_entrega_id
  ON entregas(punto_entrega_id);

-- entregas filtered by repartidor (driver's own deliveries)
CREATE INDEX IF NOT EXISTS idx_entregas_repartidor_id
  ON entregas(repartidor_id);

-- pagos joined/filtered by parent entrega
CREATE INDEX IF NOT EXISTS idx_pagos_entrega_id
  ON pagos(entrega_id);

-- entrega_lineas joined/filtered by parent entrega
CREATE INDEX IF NOT EXISTS idx_entrega_lineas_entrega_id
  ON entrega_lineas(entrega_id);

-- partial index: only active delivery points (used for dropdowns / lists)
CREATE INDEX IF NOT EXISTS idx_puntos_entrega_activo
  ON puntos_entrega(activo) WHERE activo = true;


-- ===========================================
-- Fix #17: Sync entregas after pago deletion
-- ===========================================
-- When a pago row is deleted, the parent entrega's monto_pagado
-- and forma_pago must be recalculated so they stay in sync.
-- Logic mirrors the app:
--   0 remaining methods  → 'fiado'
--   1 remaining method   → that method ('efectivo' or 'transferencia')
--   >1 remaining methods → 'mixto'
-- ===========================================

CREATE OR REPLACE FUNCTION sync_entrega_after_pago_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_total numeric;
  v_methods text[];
  v_forma text;
BEGIN
  -- Sum the remaining payments for this entrega
  SELECT COALESCE(SUM(monto), 0) INTO v_total
    FROM pagos WHERE entrega_id = OLD.entrega_id;

  -- Collect the distinct payment methods still present
  SELECT ARRAY_AGG(DISTINCT forma_pago) INTO v_methods
    FROM pagos WHERE entrega_id = OLD.entrega_id;

  -- Derive the new forma_pago
  IF v_methods IS NULL OR array_length(v_methods, 1) IS NULL THEN
    v_forma := 'fiado';
  ELSIF array_length(v_methods, 1) = 1 THEN
    v_forma := v_methods[1];
  ELSE
    v_forma := 'mixto';
  END IF;

  -- Apply to the parent entrega
  UPDATE entregas
    SET monto_pagado = v_total, forma_pago = v_forma
    WHERE id = OLD.entrega_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger (idempotent: drop first if it exists)
DROP TRIGGER IF EXISTS trg_sync_pago_delete ON pagos;
CREATE TRIGGER trg_sync_pago_delete
  AFTER DELETE ON pagos
  FOR EACH ROW
  EXECUTE FUNCTION sync_entrega_after_pago_delete();
