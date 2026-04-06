-- =============================================
-- MIGRACION V4: Puntos por repartidor
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================

-- 1. Columna creado_por en puntos_entrega (quien creo el punto)
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES auth.users(id);

-- 2. Backfill: asignar cada punto al repartidor que mas entregas le hizo
UPDATE puntos_entrega pe
SET creado_por = sub.repartidor_id
FROM (
  SELECT DISTINCT ON (punto_entrega_id)
    punto_entrega_id,
    repartidor_id
  FROM entregas
  WHERE punto_entrega_id IS NOT NULL
  GROUP BY punto_entrega_id, repartidor_id
  ORDER BY punto_entrega_id, COUNT(*) DESC
) sub
WHERE pe.id = sub.punto_entrega_id
  AND pe.creado_por IS NULL;

-- 3. Puntos sin entregas: asignar al primer admin
UPDATE puntos_entrega
SET creado_por = (SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1)
WHERE creado_por IS NULL;
