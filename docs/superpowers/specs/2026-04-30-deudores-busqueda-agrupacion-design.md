# Spec — Vista de deudores, búsqueda por texto y agregados por cliente

**Fecha:** 2026-04-30
**Origen:** dos audios de Emiliano Ríos (vendedor principal) tras un mes de uso real.
**Audios:** `audioos-errores/audiosPostEntrega/WhatsApp Unknown 2026-04-30 at 10.07.25 AM/`

## Problema

Después de un mes en producción, Emi identifica tres puntos de fricción concretos:

1. **Deudas viejas se entierran.** Cuando una deuda es de hace 2–3 semanas "va quedando al fondo" y se vuelve difícil cargar el pago. El dashboard solo muestra los top-5 deudores y queda corto.
2. **No se puede buscar cliente por texto en el historial.** Hoy el filtro de punto es un `<select>` dropdown que obliga a scrollear toda la lista. Emi quiere escribir el nombre como en el alta de entrega.
3. **No se ven todas las deudas de un mismo cliente juntas.** A clientes como Benedetti les cobra cada 15 días — necesita ver todas las facturas pendientes agrupadas para ir aplicando pagos parciales factura por factura.

Todo lo demás funciona bien según Emi: *"el resto loco ha funcionado de maravillas"*.

## Alcance

**Incluye:**

- Vista nueva `/deudores` con todos los deudores del usuario (sin cap temporal), buscador por texto, ordenamiento y agregados.
- Buscador combobox por nombre de cliente en `/historial` reemplazando el `<select>` actual.
- Mini-card con totales agregados (vendido / cobrado / saldo) cuando hay un cliente seleccionado en historial.
- Tab nueva en bottom-nav para la vista de deudores.
- Tests Vitest para la lógica de agregación, búsqueda y orden.
- Bump del Service Worker.

**No incluye (YAGNI):**

- Notificaciones o recordatorios de deuda.
- Exportación de deudores a Excel.
- Agrupación visual por repartidor en la vista de deudores.
- Cambios al portal del cliente.
- Cambios a migraciones SQL — toda la información sale de las tablas existentes.

## Arquitectura

### Archivos nuevos

- `js/deudores.js` — namespace `Deudores` con la nueva vista.
- `tests/deudores.test.js` — tests unitarios de agregación, búsqueda y orden.

### Archivos modificados

- `index.html` — `<script src="js/deudores.js">` y nueva tab en `#bottom-nav`.
- `js/app.js` — registrar ruta `/deudores`.
- `js/historial.js` — reemplazar `<select>` por combobox; agregar mini-card de agregados.
- `js/puntos.js` — extraer helper `renderFilterCombobox` reutilizable por historial.
- `js/pagos.js` — agregar refresh hook a `/deudores` en `confirmar` y `pagarTodo`.
- `sw.js` — sumar `'./js/deudores.js'` al array `STATIC_ASSETS` y bump `CACHE_NAME` (`alfajores-v22` → `alfajores-v23`).
- `css/styles.css` — clases para el header de agregados de cliente (mini-card de totales). Reutiliza `list-item`, `filter-chip`, etc. para el resto.

### Convenciones del proyecto que se respetan

- Vanilla JS con namespaces tipo `const Foo = { ... }` y `render()` + `loadData()` async.
- Acceso a Supabase vía `db.from(...)`.
- Helpers globales: `esc`, `escJs`, `fmtMoney`, `fmtDateTime`, `showToast`, `friendlyError`, `batchIn`, `Pagos.badge`.
- Visibilidad por rol: `Auth.isAdmin()` ve todo; repartidor filtra por `repartidor_id = currentUser.id`.
- Refresh por ruta: `if (App.currentRoute === '/x') X.loadData()` después de mutaciones.
- Race-guard con `_fetchId` para queries concurrentes.

## Componentes

### `Deudores` (`js/deudores.js`)

Responsabilidad única: listar deudores activos del usuario, permitir búsqueda y orden, delegar la acción de cobro al modal existente.

**Estado:**

```js
const Deudores = {
  filters: { orden: 'saldo', search: '', repartidorId: '' },
  _data: [],          // lista completa cargada del server (cliente-agregada)
  _fetchId: 0,        // race-guard
};
```

**Métodos:**

- `render()` → string HTML inicial. Dispara `loadData()`.
- `loadData()` → async. Trae todas las entregas del usuario (sin cap temporal), trae los `pagos` con `batchIn`, calcula `saldo_entrega = monto_total - sum(pagos)` por entrega y agrupa solo las que tienen saldo > 0 por `punto_entrega_id`. Mismo patrón que `Dashboard.loadData` líneas 70–95 (pagos como fuente de verdad, no `entregas.monto_pagado`). Guarda en `_data` y llama a `renderList()`.
- `renderList()` → aplica `filters.search` (substring case-insensitive sobre `nombre`) y `filters.orden`, renderiza la lista. También actualiza el header de métricas (total deudores filtrados / suma de saldo).
- `setOrden(chip, orden)` → cambia chip activo y rerenderiza.
- `onSearch()` → lee input y llama a `renderList`.
- `onRepartidorChange()` → solo admin.

**Datos por deudor (`_data` shape):**

```js
{
  puntoId, nombre,
  saldo,                    // monto_total - monto_pagado, sumado
  entregasPendientes,       // count de entregas con saldo > 0
  ultimaFechaPendiente,     // la fecha de la entrega impaga más reciente
  primeraFechaPendiente,    // la entrega impaga más vieja (para orden por antigüedad)
}
```

**Orden:**

- `saldo` (default) → desc por saldo.
- `antiguedad` → asc por `primeraFechaPendiente` (más vieja arriba; útil para Benedetti).
- `alfabetico` → asc por `nombre` (locale-aware con `localeCompare`).

**Click en cliente:** `Pagos.showDeudorModal(puntoId, nombre)` (componente existente, sin cambios).

### Combobox de filtro reutilizable (`js/puntos.js`)

Extraer:

```js
Puntos.renderFilterCombobox({ inputId, hiddenId, dropdownId, includeAll = true, onSelect })
```

Diferencia con el existente `renderSelector`:
- Sin opción "+ Nuevo".
- Opción "Todos los puntos" cuando `includeAll`.
- Llama a `onSelect(puntoId)` en vez de tocar IDs hardcodeados.

`renderSelector` queda intacto para no romper alta de entrega.

### Mini-card de agregados en `/historial`

Cuando `Historial.filters.puntoId` está seteado, renderizar arriba de `#hist-list`:

```
┌──────────────────────────────────────┐
│ Benedetti                            │
│ Vendido: $124k · Cobrado: $82k       │
│ Saldo: $42k 🔴                       │
│ [Ver cuenta corriente] ──────────────┤
└──────────────────────────────────────┘
```

- Cálculo a partir de `Historial._data` ya cargado (sin query extra). Suma `monto_total` y `monto_pagado` de las entregas del punto en el período visible.
- Botón "Ver cuenta corriente" → `Pagos.showDeudorModal(puntoId, nombre)`.
- Si `saldo === 0` el badge se muestra verde y desaparece el botón.

## Data flow

```
Usuario abre /deudores
  └─► Deudores.render() devuelve shell + spinner
       └─► Deudores.loadData()
            ├─► db.from('entregas').select('id, punto_entrega_id, fecha_hora, monto_total, puntos_entrega(nombre)')
            │     [if !admin] .eq('repartidor_id', user.id)
            ├─► batchIn('pagos', 'entrega_id, monto', 'entrega_id', entregaIds)
            ├─► por entrega: pagado = sum(pagos[entrega_id]); saldo_entrega = monto_total - pagado
            ├─► agrupa por punto_entrega_id sumando solo entregas con saldo_entrega > 0
            ├─► descarta puntos con saldo total = 0
            └─► Deudores._data = [...]; Deudores.renderList()

Usuario tipea en buscador
  └─► onSearch() → renderList() (cliente-side, no fetch)

Usuario clickea cliente
  └─► Pagos.showDeudorModal(puntoId, nombre)  [EXISTENTE]
       └─► al confirmar pago: Pagos.confirmar()
            └─► detecta App.currentRoute === '/deudores' → Deudores.loadData()
```

```
Usuario abre /historial, tipea cliente en combobox
  └─► Puntos.renderFilterCombobox onSelect(puntoId)
       └─► Historial.filters.puntoId = puntoId
            └─► Historial.fetchEntregas() [EXISTENTE]
                 └─► al renderizar: si filters.puntoId → renderClienteHeader(_data, puntoId)
```

## Manejo de errores

Mismo patrón que el resto del proyecto:

- `try/catch` envolviendo el cuerpo de `loadData`. En catch: `console.error(...)` + `showToast('Error: ' + friendlyError(err))`.
- Spinners (`<div class="spinner">`) durante carga.
- `_fetchId` race-guard en `Deudores.loadData()` (idéntico a `Historial.fetchEntregas` línea 76–77).
- Empty state: `<div class="empty-state"><p>Sin deudas pendientes</p></div>` cuando `_data` filtrado está vacío.
- Sin búsqueda con resultados: mensaje "No hay deudores que coincidan con esa búsqueda".

## Seguridad / RLS

Sin cambios. Las queries respetan las políticas RLS existentes:

- Repartidor solo ve sus propias entregas (`repartidor_id = auth.uid()`).
- Admin ve todas.

El filtro client-side por search/orden no expone datos adicionales — opera sobre lo que el server ya devolvió.

## Testing

Archivo nuevo `tests/deudores.test.js` (Vitest + jsdom). Tests:

1. `Deudores.loadData` agrega correctamente saldos por punto cuando hay múltiples entregas y pagos parciales.
2. Filtra clientes con `saldo === 0`.
3. `renderList` con `filters.search='bene'` filtra case-insensitive y matchea substring.
4. Orden por `saldo` desc, `antiguedad` asc por `primeraFechaPendiente`, `alfabetico` con tildes (`localeCompare`).
5. Repartidor solo ve sus puntos; admin ve todos.
6. `Historial` con `puntoId` seteado calcula correctamente el header de agregados (vendido / cobrado / saldo).

Mock de `db.from(...)` siguiendo el patrón ya existente en `tests/integration.test.js` y `tests/setup.js`.

## PWA / Service Worker

- Sumar `js/deudores.js` al array `CACHE_FILES` en `sw.js`.
- Bump `CACHE_NAME` de `alfajores-v22` a `alfajores-v23` (convención del repo, ver commits `dcd596f` y similares).
- Verificar que la nueva tab funcione offline tras instalar la versión nueva.

## Migraciones SQL

**Ninguna.** Toda la información se obtiene de tablas existentes:

- `entregas` (con join a `puntos_entrega`).
- `pagos` (fuente de verdad para `monto_pagado`).

## Rollout

1. Merge a master.
2. SW v21 fuerza refresh de los clientes instalados al próximo abrir.
3. Avisar a Emi que pruebe los tres flujos: nueva tab, buscador en historial, agrupación de Benedetti.

## Riesgos y consideraciones

- **Performance sin cap temporal:** si en el futuro hay miles de entregas con deuda, la query inicial puede pesar. Mitigación: agregar `.limit(500)` con un fallback "Ver más antiguas" si llega ese caso. Por ahora (volumen actual) no hace falta.
- **Race-guard del search:** sin debounce, `onSearch` rerenderiza en cada tecla. Es client-side y la lista chica, así que no hace falta debounce. Si la lista crece, agregar `setTimeout` de 100ms.
- **Tab adicional en bottom-nav:** suma 1 a las 5–6 tabs existentes. Aceptable en mobile (el patrón es ≤7 tabs antes de saturar).
