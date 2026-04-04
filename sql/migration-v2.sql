-- =============================================
-- MIGRACIÓN V2: Tipos de alfajor, líneas y pagos
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================

-- 1. Tabla tipos_alfajor
CREATE TABLE IF NOT EXISTS tipos_alfajor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  es_reventa boolean DEFAULT false,
  activo boolean DEFAULT true,
  orden int DEFAULT 0,
  costo_default numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tipos_alfajor ENABLE ROW LEVEL SECURITY;

-- 2. Seed: 4 tipos iniciales
INSERT INTO tipos_alfajor (nombre, es_reventa, orden) VALUES
  ('Glaseado Premium', false, 1),
  ('Glaseado Común', false, 2),
  ('Maicena', true, 3),
  ('Miel', true, 4);

-- 3. Tabla entrega_lineas
CREATE TABLE IF NOT EXISTS entrega_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  tipo_alfajor_id uuid NOT NULL REFERENCES tipos_alfajor(id),
  cantidad int NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  UNIQUE(entrega_id, tipo_alfajor_id)
);

ALTER TABLE entrega_lineas ENABLE ROW LEVEL SECURITY;

-- 4. Tabla pagos
CREATE TABLE IF NOT EXISTS pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto > 0),
  forma_pago text NOT NULL CHECK (forma_pago IN ('efectivo', 'transferencia')),
  fecha timestamptz NOT NULL DEFAULT now(),
  registrado_por uuid REFERENCES usuarios(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

-- 5. Migrar entregas existentes → entrega_lineas
-- Asigna todas las entregas existentes al primer tipo (Glaseado Premium)
INSERT INTO entrega_lineas (entrega_id, tipo_alfajor_id, cantidad, precio_unitario, costo_unitario)
SELECT
  e.id,
  (SELECT id FROM tipos_alfajor WHERE nombre = 'Glaseado Premium' LIMIT 1),
  e.cantidad,
  e.precio_unitario,
  0
FROM entregas e
WHERE e.cantidad > 0
  AND NOT EXISTS (SELECT 1 FROM entrega_lineas el WHERE el.entrega_id = e.id);

-- 6. RLS: tipos_alfajor
CREATE POLICY "tipos_select" ON tipos_alfajor
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "tipos_insert" ON tipos_alfajor
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "tipos_update" ON tipos_alfajor
  FOR UPDATE USING (is_admin());

CREATE POLICY "tipos_delete" ON tipos_alfajor
  FOR DELETE USING (is_admin());

-- 7. RLS: entrega_lineas (same access as parent entrega)
CREATE POLICY "lineas_select" ON entrega_lineas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "lineas_insert" ON entrega_lineas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "lineas_delete" ON entrega_lineas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

-- 8. RLS: pagos
CREATE POLICY "pagos_select" ON pagos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = pagos.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "pagos_insert" ON pagos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "pagos_delete" ON pagos
  FOR DELETE USING (is_admin());
