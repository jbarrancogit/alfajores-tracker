-- =============================================
-- POLÍTICAS RLS DE PRODUCCIÓN
-- Ejecutar en Supabase SQL Editor cuando
-- la app esté testeada y lista para usar
-- =============================================

-- Eliminar políticas permisivas de desarrollo
DROP POLICY IF EXISTS "dev_usuarios_all" ON usuarios;
DROP POLICY IF EXISTS "dev_puntos_all" ON puntos_entrega;
DROP POLICY IF EXISTS "dev_entregas_all" ON entregas;

-- USUARIOS: cada uno lee su perfil; admin lee todos
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin')
  );

-- PUNTOS_ENTREGA: todos leen; cualquier autenticado inserta; solo admin edita/borra
CREATE POLICY "puntos_select" ON puntos_entrega
  FOR SELECT USING (true);

CREATE POLICY "puntos_insert" ON puntos_entrega
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "puntos_update" ON puntos_entrega
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY "puntos_delete" ON puntos_entrega
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin')
  );

-- ENTREGAS: repartidores ven/crean las propias; admin ve/edita todo
CREATE POLICY "entregas_select" ON entregas
  FOR SELECT USING (
    repartidor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin')
  );

CREATE POLICY "entregas_insert" ON entregas
  FOR INSERT WITH CHECK (
    repartidor_id = auth.uid()
  );

CREATE POLICY "entregas_update" ON entregas
  FOR UPDATE USING (
    repartidor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin')
  );
