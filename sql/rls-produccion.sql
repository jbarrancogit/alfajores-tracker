-- =============================================
-- POLÍTICAS RLS DE PRODUCCIÓN
-- Ejecutar en Supabase SQL Editor cuando
-- la app esté testeada y lista para usar
-- =============================================

-- 1. Función auxiliar SECURITY DEFINER para evitar recursión infinita
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "dev_usuarios_all" ON usuarios;
DROP POLICY IF EXISTS "dev_puntos_all" ON puntos_entrega;
DROP POLICY IF EXISTS "dev_entregas_all" ON entregas;
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
DROP POLICY IF EXISTS "puntos_select" ON puntos_entrega;
DROP POLICY IF EXISTS "puntos_insert" ON puntos_entrega;
DROP POLICY IF EXISTS "puntos_update" ON puntos_entrega;
DROP POLICY IF EXISTS "puntos_delete" ON puntos_entrega;
DROP POLICY IF EXISTS "entregas_select" ON entregas;
DROP POLICY IF EXISTS "entregas_insert" ON entregas;
DROP POLICY IF EXISTS "entregas_update" ON entregas;

-- 3. USUARIOS: cada uno lee su perfil; admin lee todos; cada uno puede insertar el propio
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (id = auth.uid() OR is_admin());

CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE USING (is_admin());

-- 4. PUNTOS_ENTREGA: todos leen; cualquier autenticado inserta; solo admin edita/borra
CREATE POLICY "puntos_select" ON puntos_entrega
  FOR SELECT USING (true);

CREATE POLICY "puntos_insert" ON puntos_entrega
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "puntos_update" ON puntos_entrega
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "puntos_delete" ON puntos_entrega
  FOR DELETE USING (is_admin());

-- 5. ENTREGAS: repartidores ven/crean las propias; admin ve/edita todo
CREATE POLICY "entregas_select" ON entregas
  FOR SELECT USING (repartidor_id = auth.uid() OR is_admin());

CREATE POLICY "entregas_insert" ON entregas
  FOR INSERT WITH CHECK (repartidor_id = auth.uid());

CREATE POLICY "entregas_update" ON entregas
  FOR UPDATE USING (repartidor_id = auth.uid() OR is_admin());
