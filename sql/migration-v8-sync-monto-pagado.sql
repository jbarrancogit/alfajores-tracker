-- =============================================
-- MIGRACION V8: Resync monto_pagado & add INSERT/UPDATE trigger
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================
-- Fix: entregas.monto_pagado can become desynced from actual pagos
--   (e.g. when editing an entrega overwrites monto_pagado from form).
--   This migration:
--   1. Resyncs ALL existing entregas.monto_pagado from pagos table
--   2. Adds trigger on pagos INSERT/UPDATE to keep them in sync
-- =============================================
-- Safe to re-run: UPDATE is idempotent, trigger uses DROP IF EXISTS.
-- =============================================


-- ===========================================
-- Step 1: Resync all entregas.monto_pagado from actual pagos
-- ===========================================

UPDATE entregas
SET
  monto_pagado = COALESCE(sub.total_pagado, 0),
  forma_pago = CASE
    WHEN sub.n_methods IS NULL OR sub.n_methods = 0 THEN 'fiado'
    WHEN sub.n_methods = 1 THEN sub.single_method
    ELSE 'mixto'
  END
FROM (
  SELECT
    p.entrega_id,
    SUM(p.monto) AS total_pagado,
    COUNT(DISTINCT p.forma_pago) AS n_methods,
    MIN(p.forma_pago) AS single_method
  FROM pagos p
  GROUP BY p.entrega_id
) sub
WHERE entregas.id = sub.entrega_id
  AND (entregas.monto_pagado IS DISTINCT FROM COALESCE(sub.total_pagado, 0));

-- Also fix entregas with NO pagos that incorrectly have monto_pagado > 0
UPDATE entregas
SET monto_pagado = 0, forma_pago = 'fiado'
WHERE monto_pagado > 0
  AND NOT EXISTS (SELECT 1 FROM pagos WHERE pagos.entrega_id = entregas.id);


-- ===========================================
-- Step 2: Trigger to sync on pagos INSERT or UPDATE
-- (Complements the existing DELETE trigger from v6)
-- ===========================================

CREATE OR REPLACE FUNCTION sync_entrega_after_pago_upsert()
RETURNS TRIGGER AS $$
DECLARE
  v_total numeric;
  v_methods text[];
  v_forma text;
  v_entrega_id uuid;
BEGIN
  v_entrega_id := NEW.entrega_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_total
    FROM pagos WHERE entrega_id = v_entrega_id;

  SELECT ARRAY_AGG(DISTINCT forma_pago) INTO v_methods
    FROM pagos WHERE entrega_id = v_entrega_id;

  IF v_methods IS NULL OR array_length(v_methods, 1) IS NULL THEN
    v_forma := 'fiado';
  ELSIF array_length(v_methods, 1) = 1 THEN
    v_forma := v_methods[1];
  ELSE
    v_forma := 'mixto';
  END IF;

  UPDATE entregas
    SET monto_pagado = v_total, forma_pago = v_forma
    WHERE id = v_entrega_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_pago_upsert ON pagos;
CREATE TRIGGER trg_sync_pago_upsert
  AFTER INSERT OR UPDATE ON pagos
  FOR EACH ROW
  EXECUTE FUNCTION sync_entrega_after_pago_upsert();
