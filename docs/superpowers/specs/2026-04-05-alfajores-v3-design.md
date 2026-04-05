# Alfajores Tracker v3 — Spec de Diseño

## Contexto

Alfajores Tracker es una PWA vanilla JS + Supabase para el negocio familiar de alfajores de Emi. La v2 agregó tipos de alfajor, pagos parciales/fiados, analytics con exportación Excel, y multi-usuario con roles admin/repartidor.

La v3 agrega tres features independientes: liquidación de comisiones por repartidor, mapa de ruta del día, y portal de cuenta corriente para clientes.

---

## Feature 1: Comisiones / Liquidación

### Modelo de datos

**Campo nuevo en `usuarios`:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `comision_pct` | numeric DEFAULT 0 | Porcentaje de comisión sobre ventas. Ej: 10 = 10% |

No se crea tabla de liquidaciones. El cálculo es en tiempo real: suma de `monto_total` de entregas del repartidor en el período, multiplicado por su `comision_pct / 100`.

### UI: Config > Usuarios

El listado de usuarios en el panel de configuración muestra el porcentaje de comisión actual. Al editar un usuario (o al invitar uno nuevo), se puede setear el campo "Comisión %".

### UI: Análisis > Liquidación

Nueva sección al final del módulo de análisis (solo admin), debajo de "Deudores".

**Selector de ciclo**: Usa el mismo selector de período del módulo (Hoy/Semana/Mes/Ciclo 4s/Rango). La liquidación se calcula sobre el período seleccionado.

**Tabla de liquidación por repartidor**:

| Repartidor | Entregas | Vendido | Cobrado | Comisión % | A pagar |
|------------|----------|---------|---------|------------|---------|
| Emi        | 45       | $120.000 | $95.000 | 10%       | $12.000 |
| Papá       | 30       | $80.000  | $70.000 | 8%        | $6.400  |

"A pagar" = Vendido × (Comisión % / 100).

### Exportación Excel

La liquidación se incluye como una hoja adicional "Liquidación" en el export estilo Emi, con las mismas columnas de la tabla.

---

## Feature 2: Ruta del día

### Modelo de datos

**Campos nuevos en `puntos_entrega`:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `lat` | numeric NULL | Latitud GPS |
| `lng` | numeric NULL | Longitud GPS |

### Captura de coordenadas

Al guardar una entrega, si el `punto_entrega_id` seleccionado no tiene coordenadas (`lat` IS NULL):
1. Llamar `navigator.geolocation.getCurrentPosition()`.
2. Si el usuario concede permiso, guardar lat/lng en `puntos_entrega` via UPDATE.
3. Si rechaza o hay error, continuar sin coordenadas. No bloquear la entrega.

La captura solo ocurre una vez por punto (la primera entrega). Después se reusan las coordenadas guardadas.

### Librería de mapas

**Leaflet** via CDN: `https://unpkg.com/leaflet@1.9/dist/leaflet.js` + CSS.
Tiles: **OpenStreetMap** (gratuito, sin API key).

Se agrega al `index.html` como script + link tag. Se excluye del service worker cache (como los otros CDN).

### UI: Ruta `#/ruta`

**Nuevo tab en bottom nav** con ícono de mapa (entre Historial y Análisis). Visible para todos los usuarios (admin y repartidor).

**Vista**:
- Mapa fullscreen (ocupa todo el espacio disponible menos el header y bottom nav).
- Centrado en la ubicación actual del repartidor (pide GPS al abrir).
- Fallback: si no hay GPS, centra en el primer punto con coordenadas.

**Marcadores**:
- Un marcador por cada entrega del día del repartidor (admin ve todas).
- Color del marcador según estado de pago:
  - Verde: pagado (`monto_pagado >= monto_total`)
  - Amarillo: parcial (`0 < monto_pagado < monto_total`)
  - Rojo: debe (`monto_pagado = 0` y no es fiado reciente)
- Marcador azul: ubicación actual del repartidor.

**Popup al tocar marcador**:
- Nombre del punto de entrega.
- Resumen de lo entregado (tipos y cantidades).
- Estado de pago con badge.
- Hora de la entrega.

**Botón "Mi ubicación"**: FAB (floating action button) en esquina inferior derecha para recentrar el mapa.

**Sin coordenadas**: Los puntos sin lat/lng no aparecen en el mapa. Se muestra un contador "X puntos sin ubicación" si hay entregas del día sin coordenadas.

**Archivo nuevo**: `js/ruta.js` — módulo `Ruta` con métodos `render()` y `loadMap()`.

### Offline

El mapa requiere conexión para cargar tiles. Si no hay conexión, se muestra un mensaje "Sin conexión — el mapa necesita internet" en vez del mapa.

---

## Feature 3: Portal del cliente

### Modelo de datos

**Campo nuevo en `puntos_entrega`:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `client_token` | uuid DEFAULT gen_random_uuid() | Token único para acceso al portal. UNIQUE. |

### Seguridad: acceso sin login via token

El portal es una vista readonly dentro de la misma SPA. La URL tiene formato:
```
https://jbarrancogit.github.io/alfajores-tracker/#/cliente/{token}
```

**Mecanismo de acceso**: Supabase permite pasar headers custom al crear el client. Para la vista del portal, se usa una sesión anon con un header `x-client-token` que las RLS policies verifican.

**RLS policies nuevas** (se agregan a las existentes, no las reemplazan):

```sql
-- Permitir al portal leer entregas de su punto
CREATE POLICY "portal_entregas_select" ON entregas
  FOR SELECT USING (
    punto_entrega_id IN (
      SELECT id FROM puntos_entrega
      WHERE client_token = current_setting('request.headers')::json->>'x-client-token'
    )
  );

-- Permitir al portal leer líneas de esas entregas
CREATE POLICY "portal_lineas_select" ON entrega_lineas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND entregas.punto_entrega_id IN (
          SELECT id FROM puntos_entrega
          WHERE client_token = current_setting('request.headers')::json->>'x-client-token'
        )
    )
  );

-- Permitir al portal leer pagos de esas entregas
CREATE POLICY "portal_pagos_select" ON pagos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = pagos.entrega_id
        AND entregas.punto_entrega_id IN (
          SELECT id FROM puntos_entrega
          WHERE client_token = current_setting('request.headers')::json->>'x-client-token'
        )
    )
  );

-- Permitir leer el punto propio
CREATE POLICY "portal_puntos_select" ON puntos_entrega
  FOR SELECT USING (
    client_token = current_setting('request.headers')::json->>'x-client-token'
  );
```

Estas policies son OR con las existentes (PostgreSQL evalúa todas las policies con OR). Un usuario autenticado sigue usando las policies normales. El portal solo usa las del token.

**Importante**: Estas policies solo permiten SELECT. El portal no puede insertar, actualizar ni borrar nada.

### Header custom en Supabase client

Para las vistas del portal, se crea una segunda instancia del cliente Supabase con el header custom:

```javascript
const portalDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    headers: { 'x-client-token': token }
  }
});
```

### UI: Ruta `#/cliente/{token}`

**Archivo nuevo**: `js/portal.js` — módulo `Portal`.

**Vista** (sin bottom nav, sin login):
- Header: nombre del punto de entrega + logo.
- Card resumen: total comprado (all-time), total pagado, deuda pendiente.
- Lista de entregas (más recientes primero):
  - Fecha.
  - Desglose por tipo de alfajor (cantidad y subtotal).
  - Total de la entrega.
  - Badge de estado (Pagado/Parcial/Debe).
  - Expandible: historial de pagos de esa entrega.
- Estilo: misma estética dark de la app.
- Footer: "Alfajores Tracker" con link a la app.

**Acceso inválido**: Si el token no existe o no matchea ningún punto, se muestra "Link inválido o expirado".

### Compartir link

**Desde el modal de deudor** (Pagos.showDeudorModal): botón "Compartir cuenta" al lado de "Pagar todo". Al tocar:
1. Construye la URL: `{origin}{pathname}#/cliente/{token}`.
2. Intenta `navigator.share()` (Web Share API — funciona en móviles).
3. Fallback: copia al clipboard con `navigator.clipboard.writeText()` y muestra toast "Link copiado".

**Desde Config > Puntos** (futuro): se podría agregar gestión de tokens (ver, regenerar). No se incluye en v3 para mantener scope acotado. El token se genera automáticamente con la migración y no necesita intervención manual.

### Router

En `app.js`, la ruta `/cliente/:token` es especial:
- No requiere autenticación.
- No muestra bottom nav.
- Extrae el token del hash y lo pasa a `Portal.render(token)`.

---

## Migración SQL

**Archivo**: `sql/migration-v3.sql`

```sql
-- 1. Comisiones: campo en usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_pct numeric DEFAULT 0;

-- 2. Ruta: coordenadas en puntos_entrega
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS lng numeric;

-- 3. Portal: token en puntos_entrega
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS client_token uuid DEFAULT gen_random_uuid();
UPDATE puntos_entrega SET client_token = gen_random_uuid() WHERE client_token IS NULL;
ALTER TABLE puntos_entrega ADD CONSTRAINT puntos_client_token_unique UNIQUE (client_token);

-- 4. RLS para portal (policies SELECT adicionales)
CREATE POLICY "portal_entregas_select" ON entregas
  FOR SELECT USING (
    punto_entrega_id IN (
      SELECT id FROM puntos_entrega
      WHERE client_token::text = coalesce(
        current_setting('request.headers', true)::json->>'x-client-token', ''
      )
    )
  );

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

CREATE POLICY "portal_puntos_select" ON puntos_entrega
  FOR SELECT USING (
    client_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-client-token', ''
    )
  );
```

Se usa `current_setting('request.headers', true)` con `true` para que devuelva NULL en vez de error si el header no existe (evita romper las queries de usuarios autenticados).

---

## Archivos impactados

| Archivo | Cambio |
|---------|--------|
| `index.html` | Agregar Leaflet CSS + JS vía CDN, script tags para ruta.js y portal.js, nuevo tab "Ruta" en bottom nav |
| `js/ruta.js` | NUEVO — módulo de mapa con entregas del día |
| `js/portal.js` | NUEVO — portal readonly para clientes |
| `js/app.js` | Agregar rutas `/ruta` y `/cliente/:token`, manejar auth bypass para portal |
| `js/config.js` | Campo comisión % en edición/invitación de usuarios |
| `js/analisis.js` | Sección "Liquidación" con tabla por repartidor |
| `js/excel.js` | Hoja adicional "Liquidación" en export |
| `js/entregas.js` | Captura GPS al guardar si el punto no tiene coordenadas |
| `js/pagos.js` | Botón "Compartir cuenta" en modal de deudor |
| `css/styles.css` | Estilos para mapa, marcadores, portal, liquidación, tab ruta |
| `sw.js` | Bump cache version, excluir CDN de Leaflet, agregar nuevos JS |
| `sql/migration-v3.sql` | NUEVO — DDL campos nuevos + RLS portal |

## Stack técnico adicional

- **Mapas**: Leaflet 1.9 via CDN + OpenStreetMap tiles (gratis).
- **GPS**: Web Geolocation API nativa (`navigator.geolocation`).
- **Compartir**: Web Share API con fallback a Clipboard API.
- Todo lo demás se mantiene: Vanilla JS, Supabase, SheetJS, PWA.
