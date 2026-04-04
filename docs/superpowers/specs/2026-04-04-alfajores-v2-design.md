# Alfajores Tracker v2 — Spec de Diseño

## Contexto

Alfajores Tracker es una PWA para el negocio familiar de alfajores de Emi. Actualmente trackea entregas con un solo campo de cantidad/precio. Emi en realidad maneja 4 tipos de alfajor con precios y costos independientes, trabaja en ciclos de 4 semanas, y necesita análisis de ventas con exportación a Excel. Además, su padre y hermana van a usar la app con cuentas separadas.

Este spec cubre la reestructuración completa en un solo paquete, implementado en fases.

---

## Fase 1: Modelo de datos

### Tabla nueva: `tipos_alfajor`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid (PK, default gen_random_uuid()) | |
| `nombre` | text NOT NULL | "Glaseado Premium", "Glaseado Común", "Maicena", "Miel" |
| `es_reventa` | boolean DEFAULT false | true para maicena/miel (no los fabrican) |
| `activo` | boolean DEFAULT true | desactivar oculta del form, mantiene datos históricos |
| `orden` | int DEFAULT 0 | orden de aparición en el formulario |
| `created_at` | timestamptz DEFAULT now() | |

Seed inicial con los 4 tipos: Glaseado Premium (orden 1), Glaseado Común (orden 2), Maicena (orden 3, reventa), Miel (orden 4, reventa).

### Tabla nueva: `entrega_lineas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid (PK, default gen_random_uuid()) | |
| `entrega_id` | uuid NOT NULL (FK → entregas ON DELETE CASCADE) | |
| `tipo_alfajor_id` | uuid NOT NULL (FK → tipos_alfajor) | |
| `cantidad` | int NOT NULL CHECK (cantidad > 0) | unidades de este tipo |
| `precio_unitario` | numeric NOT NULL CHECK (precio_unitario >= 0) | precio de venta |
| `costo_unitario` | numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0) | costo por unidad |

Constraint UNIQUE(entrega_id, tipo_alfajor_id) — un solo registro por tipo por entrega.

### Tabla nueva: `pagos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid (PK, default gen_random_uuid()) | |
| `entrega_id` | uuid NOT NULL (FK → entregas ON DELETE CASCADE) | |
| `monto` | numeric NOT NULL CHECK (monto > 0) | |
| `forma_pago` | text NOT NULL CHECK (forma_pago IN ('efectivo', 'transferencia')) | |
| `fecha` | timestamptz NOT NULL DEFAULT now() | cuándo pagó |
| `registrado_por` | uuid (FK → usuarios) | quién registró |
| `created_at` | timestamptz DEFAULT now() | |

### Tabla existente: `entregas` (cambios)

- Campos `cantidad`, `precio_unitario`, `monto_total` se **mantienen** como valores calculados (suma de líneas) para no romper queries existentes en dashboard/historial/resúmenes.
- Al guardar una entrega, `cantidad` = suma de cantidades de líneas, `monto_total` = suma de (cant × precio) de líneas, `precio_unitario` = monto_total / cantidad (promedio ponderado).
- `monto_pagado` se actualiza al insertar en tabla `pagos` (o al valor inicial si se paga al momento de la entrega).

### Migración de datos existentes

Las entregas existentes (sin líneas) se migran creando una línea con tipo "Glaseado Premium" usando la cantidad y precio_unitario originales, y costo_unitario = 0 (dato no disponible históricamente). La migración se incluye en `sql/migration-v2.sql` y se ejecuta una sola vez en Supabase SQL Editor.

### RLS para tablas nuevas

- `tipos_alfajor`: SELECT para todos los autenticados. INSERT/UPDATE/DELETE solo admin.
- `entrega_lineas`: mismas policies que `entregas` (basado en la entrega padre vía join).
- `pagos`: INSERT para cualquier autenticado. SELECT según la entrega padre. DELETE solo admin.

---

## Fase 2: Formulario de entrega

### Estructura del formulario

**Zona superior (sin cambios):**
- Punto de entrega (selector + opción crear nuevo)
- Quién recibió
- Fecha y hora

**Zona de líneas de alfajores (NUEVA):**
- Se renderizan automáticamente todos los tipos activos de `tipos_alfajor`, ordenados por `orden`.
- Cada tipo se muestra como una fila:
  - Nombre del tipo (label)
  - Campo cantidad (number, default vacío)
  - Campo precio unitario (number, recuerda último valor usado por tipo)
  - Campo costo unitario (number, recuerda último valor usado por tipo)
- Las filas con cantidad vacía o 0 no generan línea en `entrega_lineas`.
- El precio y costo se persisten en `localStorage` por tipo (`lastPrecio_{tipoId}`, `lastCosto_{tipoId}`) para precargar en la próxima entrega.

**Zona inferior (ajustes menores):**
- Total: readonly, suma automática de (cant × precio) de todas las líneas.
- Monto pagado: se mantiene.
- Forma de pago: efectivo / transferencia / fiado. Si "fiado", monto_pagado = 0.
- Notas: se mantiene.

### Lógica de guardado

1. Validar que al menos una línea tenga cantidad > 0.
2. Calcular campos agregados en `entregas`: cantidad total, monto_total, precio_unitario promedio.
3. INSERT en `entregas` (o UPDATE si es edición).
4. INSERT en `entrega_lineas` para cada tipo con cantidad > 0.
5. Si monto_pagado > 0 y no es edición, INSERT en `pagos` con el monto inicial.

### Edición de entregas

Al editar, se cargan las líneas existentes y se pre-rellenan los campos. Se pueden agregar/quitar tipos (poniendo cantidad en 0). Al guardar, se borran las líneas viejas y se insertan las nuevas (DELETE + INSERT, más simple que UPDATE parcial).

---

## Fase 3: Gestión de pagos fiados

### Desde el historial (modal de detalle)

El modal de detalle de entrega se amplía:

- Muestra desglose por tipo de alfajor (en vez del cantidad/precio genérico actual).
- Si tiene deuda (monto_pagado < monto_total), muestra:
  - Historial de pagos (fecha, monto, forma de pago, quién registró).
  - Botón "Registrar pago" que abre un mini-form inline:
    - Monto (precargado con la deuda restante, editable para pagos parciales).
    - Forma de pago (efectivo / transferencia).
    - Botón confirmar.
  - Al registrar: INSERT en `pagos`, UPDATE `monto_pagado` en `entregas`.

### Desde la sección de deudores

En dashboard y módulo de análisis, la lista de deudores se vuelve interactiva:

- Al tocar un deudor, se abre un modal con:
  - Lista de entregas impagas de ese punto de entrega.
  - Cada entrada muestra: fecha, desglose de tipos, total, pagado, debe.
  - Botón "Registrar pago" por entrega individual.
  - Botón "Pagar todo" arriba: crea un pago por el saldo de cada entrega impaga de ese punto.

### Indicadores visuales

- Badge "Pagado" (verde): monto_pagado >= monto_total.
- Badge "Parcial" (amarillo/naranja): 0 < monto_pagado < monto_total.
- Badge "Debe" (rojo): monto_pagado = 0 y forma_pago = fiado.

---

## Fase 4: Módulo de análisis de ventas

### Reemplaza el módulo "Resúmenes"

El tab "Resúmenes" en el bottom nav se renombra a "Análisis" y se reemplaza `resumenes.js` por `analisis.js`. Se mantiene la misma posición en la navegación.

### Selector de período

Opciones: Hoy / Semana / Mes / Ciclo 4 sem / Personalizado (date range picker).

El "Ciclo 4 semanas" calcula automáticamente el ciclo actual basado en una fecha de inicio configurable (por defecto, se alinea con las semanas del año agrupadas de a 4).

### Métricas principales (6 tarjetas)

- **Vendido**: suma de monto_total en el período.
- **Cobrado**: suma de monto_pagado.
- **Ganancia**: suma de ((precio_unitario - costo_unitario) × cantidad) por línea.
- **Unidades**: suma de cantidades.
- **Pendiente**: vendido - cobrado.
- **Entregas**: count de entregas.

### Desglose por tipo de alfajor

Tabla/lista que muestra por cada tipo activo:
- Nombre del tipo.
- Unidades vendidas en el período.
- Monto total de venta.
- Ganancia (venta - costo).

### Ranking de clientes

Top puntos de entrega ordenados por monto total, mostrando:
- Nombre del punto.
- Unidades compradas.
- Monto total.
- Deuda pendiente (si tiene).

### Comparación entre períodos

Muestra variación porcentual vs período anterior:
- Ventas: +12% / -5%.
- Ganancia: +8%.
- Unidades: -3%.

Calculado automáticamente comparando el período seleccionado vs el anterior de igual duración.

### Por repartidor (solo admin)

Desglose de entregas, ventas, ganancia y cobrado por vendedor. Funcionalidad similar a la sección "Por repartidor" del Resúmenes actual pero con el agregado de ganancia.

### Deudores

Lista interactiva de deudores (misma que en Fase 3), integrada como sección del módulo.

---

## Fase 5: Exportación a Excel

### Ubicación

Botón "Exportar" en la parte superior del módulo de análisis. Al tocar, muestra un modal con dos opciones.

### Formato 1: Reporte estilo Emi

Archivo .xlsx con 2 hojas:

**Hoja 1 — Cantidades:**

| Fecha | Cliente | Zona | Glaseado Premium | Glaseado Común | Maicena | Miel | Vendedor | Semana |
|-------|---------|------|-----------------|----------------|---------|------|----------|--------|

- Una fila por entrega.
- Las columnas de tipo se generan dinámicamente según los tipos activos.
- "Zona" se toma de la dirección del punto de entrega.
- "Semana" se calcula según el ciclo de 4 semanas.
- "Vendedor" se toma de la tabla usuarios vía repartidor_id.

**Hoja 2 — Ingresos y Ganancias:**

| Fecha | Cliente | Cant GP | Precio GP | Cant GC | Precio GC | Cant M | Precio M | Cant Miel | Precio Miel | Costo Total | Total Venta | Ganancia | Vendedor | Semana |
|-------|---------|---------|-----------|---------|-----------|--------|----------|-----------|-------------|-------------|-------------|----------|----------|--------|

- Misma estructura, agrega precio/costo por tipo y columnas de totales.

### Formato 2: Datos crudos

Una sola hoja, una fila por línea de entrega:

| Fecha | Punto | Dirección | Recibió | Tipo Alfajor | Cantidad | Precio Venta | Costo | Subtotal Venta | Ganancia | Pagado | Debe | Forma Pago | Vendedor | Notas |

### Librería

SheetJS (xlsx) vía CDN: `https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js`. Se agrega al `index.html` como script tag. Generación 100% client-side, sin backend.

### Filtros aplicados

La exportación respeta el período y los filtros activos en el módulo de análisis (vendedor, punto de entrega).

---

## Fase 6: Multi-usuario y configuración

### Panel de configuración

Nueva ruta `#/config`, accesible solo para admin desde un ícono de engranaje en el header del dashboard.

**Sección: Tipos de alfajor**
- Lista de tipos con nombre, si es reventa, activo/inactivo, orden.
- Botón agregar nuevo tipo.
- Editar nombre, toggle reventa, toggle activo, drag o flechas para reordenar.
- No se pueden borrar tipos que tienen líneas asociadas (solo desactivar).

**Sección: Usuarios**
- Lista de usuarios (nombre, email, rol, estado).
- Botón "Invitar usuario": form con email, nombre, rol (admin/repartidor). Crea el usuario en Supabase Auth y en la tabla usuarios.
- Toggle activar/desactivar usuario.

**Sección: Costos default (opcional)**
- Precargar costo por defecto para cada tipo de alfajor.
- Se usa como sugerencia en el formulario de entrega (el vendedor puede cambiarlo).
- Se guarda en `tipos_alfajor` como campo `costo_default`.

### Selector de vendedor en formulario (admin)

Si el usuario logueado es admin, el formulario de entrega muestra un selector adicional de "Vendedor" (lista de usuarios activos). Default: el admin mismo. Permite cargar entregas en nombre de otro.

---

## Stack técnico

- **Frontend**: Vanilla JS (misma arquitectura actual), sin framework.
- **Backend**: Supabase (PostgreSQL + Auth + RLS).
- **Excel**: SheetJS vía CDN.
- **PWA**: Se mantiene service worker, se actualiza cache version al desplegar.

## Archivos impactados

| Archivo | Cambio |
|---------|--------|
| `index.html` | Agregar script SheetJS, agregar script analisis.js y config.js, cambiar nav "Resúmenes" → "Análisis" |
| `js/entregas.js` | Reescribir formulario con líneas por tipo |
| `js/historial.js` | Modal de detalle ampliado con desglose por tipo y pagos |
| `js/resumenes.js` | Se elimina, reemplazado por analisis.js |
| `js/analisis.js` | NUEVO — módulo de análisis completo |
| `js/config.js` | NUEVO — panel de configuración admin |
| `js/dashboard.js` | Deudores interactivos, ajustar métricas |
| `js/supabase.js` | Sin cambios |
| `js/auth.js` | Sin cambios |
| `js/puntos.js` | Sin cambios |
| `js/app.js` | Agregar rutas /config y /analisis, actualizar router |
| `css/styles.css` | Estilos para líneas de alfajor, modal de pagos, panel config, badges parcial |
| `sql/migration-v2.sql` | NUEVO — DDL tablas nuevas, migración datos, RLS |
| `sw.js` | Bump cache version |
