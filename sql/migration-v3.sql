-- =============================================
-- MIGRACIÓN V3: Comisiones, GPS, Portal cliente
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================

-- 1. Comisiones: campo en usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_pct numeric DEFAULT 0;

-- 2. Ruta: coordenadas en puntos_entrega
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS lng numeric;

-- 3. Portal: token en puntos_entrega
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS client_token uuid DEFAULT gen_random_uuid();
UPDATE puntos_entrega SET client_token = gen_random_uuid() WHERE client_token IS NULL;
ALTER TABLE puntos_entrega ADD CONSTRAINT puntos_client_token_unique UNIQUE (client_token);

-- 4. RLS portal: entregas
CREATE POLICY "portal_entregas_select" ON entregas
  FOR SELECT USING (
    punto_entrega_id IN (
      SELECT id FROM puntos_entrega
      WHERE client_token::text = coalesce(
        current_setting('request.headers', true)::json->>'x-client-token', ''
      )
    )
  );

-- 5. RLS portal: entrega_lineas
CREATE POLICY "portal_lineas_select" ON entrega_lineas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND entregas.punto_entrega_id IN (
          SELECT id FROM puntos_entrega
          WHERE client_token::text = coalesce(
            current_setting('request.headers', true)::json->>'x-client-token', ''
          )
        )
    )
  );

-- 6. RLS portal: pagos
CREATE POLICY "portal_pagos_select" ON pagos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = pagos.entrega_id
        AND entregas.punto_entrega_id IN (
          SELECT id FROM puntos_entrega
          WHERE client_token::text = coalesce(
            current_setting('request.headers', true)::json->>'x-client-token', ''
          )
        )
    )
  );

-- 7. RLS portal: tipos_alfajor (datos de referencia, lectura pública)
CREATE POLICY "portal_tipos_select" ON tipos_alfajor
  FOR SELECT USING (true);

-- 8. RLS portal: puntos_entrega (leer su propio punto)
CREATE POLICY "portal_puntos_select" ON puntos_entrega
  FOR SELECT USING (
    client_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-client-token', ''
    )
  );
