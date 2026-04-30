# Spec — Vista de deudores, búsqueda por texto y agregados por cliente

**Fecha:** 2026-04-30
**Origen:** dos audios de Emiliano Ríos (vendedor principal) tras un mes de uso real.
**Audios:** `audioos-errores/audiosPostEntrega/WhatsApp Unknown 2026-04-30 at 10.07.25 AM/`

## Problema

Después de un mes en producción, Emi identifica tres puntos de fricción concretos:

1. **Deudas viejas se entierran.** Cuando una deuda es de hace 2–3 semanas "va quedando al fondo" y se vuelve difícil cargar el pago. El dashboard capeó deudores a últimos 90 días en commit `a85eec0` y solo muestra top-5.
2. **No se puede buscar cliente por texto en el historial.** Hoy el filtro de punto es un `<select>` dropdown que obliga a scrollear toda la lista. Emi quiere escribir el nombre como en el alta de entrega.
3. **No se ven todas las deudas de un mismo cliente juntas.** A clientes como Benedetti les cobra cada 15 días — necesita ver todas las facturas pendientes agrupadas para ir aplicando pagos parciales factura por factura.

Todo lo demás funciona bien según Emi: *"el resto loco ha funcionado de maravillas"*.

### Estado previo relevante

- **Dashboard** muestra top-5 deudores agrupados por punto, capeado a últimos 90 días (`dashboard.js:64–95`). Click → `Pagos.showDeudorModal`.
- **Análisis** tiene una sección "Deudores" exhaustiva (no top-5, todos los del rango seleccionado) en `analisis.js:416–449`. **Solo accesible para admin** (`analisis.js:10` redirige a no-admin). Agrega por punto, click → mismo `Pagos.showDeudorModal`. El rango se controla con los chips de período (Hoy / Semana / Mes / Ciclo 4s / Rango).
- **`Pagos.showDeudorModal`** (`pagos.js:139`) ya muestra todas las entregas impagas de un punto con "Pagar todo" y pago individual. Es el componente que resuelve el pedido #3 — solo falta mejor descubribilidad.

**Pregunta abierta para Juan:** ¿Cuál es el rol de Emi en la app, `admin` o `repartidor`? Si es admin, ¿usa la sección Deudores de Análisis o no la encuentra/no le sirve? La respuesta no cambia el alcance (la nueva vista sigue siendo útil porque es accesible para repartidores y no tiene cap temporal), pero confirma la prioridad.

## Alcance

**Incluye:**

- Vista nueva `/deudores` accesible para **admin y repartidor**, con todos los deudores del usuario (sin cap temporal), buscador por texto, ordenamiento (saldo / antigüedad / alfabético) y agregados.
- Buscador combobox por nombre de cliente en `/historial` reemplazando el `<select>` actual.
- Mini-card con totales agregados (vendido / cobrado / saldo) cuando hay un cliente seleccionado en historial.
- Tab nueva en bottom-nav para la vista de deudores.
- Tests Vitest cargando `js/deudores.js` con `loadScript` (mismo patrón que `tipos.js`/`pagos.js`), cubriendo función pura de agregación, filtros, orden y render HTML.
- Bump del Service Worker.

**No incluye (YAGNI):**

- Notificaciones o recordatorios de deuda.
- Exportación de deudores a Excel.
- Agrupación visual por repartidor en la vista de deudores.
- Cambios al portal del cliente.
- Cambios a migraciones SQL — toda la información sale de las tablas existentes.
- **No se elimina** la sección Deudores de Análisis (sigue siendo útil para análisis con rangos custom). Si después se confirma duplicación innecesaria, se dedupea en otra iteración.
- No se eleva el cap de 90 días del Dashboard. La vista nueva existe justamente para sortear ese cap; cambiar el dashboard rompería la racionalidad del cap (rendimiento del home).

## Arquitectura

### Archivos nuevos

- `js/deudores.js` — namespace `Deudores` con la nueva vista.
- `tests/deudores.test.js` — tests unitarios de agregación, búsqueda y orden.

### Archivos modificados

- `index.html` — `<script src="js/deudores.js">` (entre `historial.js` y `analisis.js` por orden alfabético/uso) y nueva `<button class="nav-btn" data-route="/deudores">` en `#bottom-nav`. La tab pasa a 6 botones (5 actuales + uno nuevo). Ver Riesgos sobre layout en mobile.
- `js/app.js` — registrar ruta `/deudores`.
- `js/historial.js` — reemplazar `<select>` por combobox; agregar mini-card de agregados.
- `js/puntos.js` — extraer helper `renderFilterCombobox` reutilizable por historial.
- `js/pagos.js` — agregar refresh hook a `/deudores` en `confirmar`, `pagarTodo` y `deletePago` (los tres ya tienen el patrón `if (App.currentRoute === '/x') X.loadData()`).
- `sw.js` — sumar `'./js/deudores.js'` al array `STATIC_ASSETS` y bump `CACHE_NAME` (`alfajores-v22` → `alfajores-v23`).
- `css/styles.css` — solo si hace falta una clase nueva para el header de agregados de cliente (`.cliente-header` o similar). Para el resto reutiliza clases existentes verificadas en CSS: `metrics-grid`, `metric-card`, `list-item` + variantes, `filter-bar`, `filter-chip`, `empty-state`, `app-header`, `form-input`, `form-select`, `badge`/`badge-red`. Antes de agregar CSS nuevo, intentar componer con las clases existentes.

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
- `loadData()` → async. Trae todas las entregas del usuario (sin cap temporal; RLS filtra por `repartidor_id` para no-admin), trae los `pagos` con `batchIn`. Llama a `Deudores._aggregate(entregas, pagos)` (función pura, ver abajo). Guarda en `_data` y llama a `renderList()`. Wrap en `try/catch` con `showToast('Error: ' + friendlyError(err))` y `console.error`. Race-guard con `_fetchId`.
- `_aggregate(entregas, pagos)` → **función pura testeable**. Recibe arrays simples, devuelve array de `{ puntoId, nombre, saldo, entregasPendientes, ultimaFechaPendiente, primeraFechaPendiente }` con saldo > 0. Misma lógica de agregación que `Dashboard.loadData` líneas 70–95 / `Analisis.loadData` líneas 416–430, encapsulada para test.
- `_filter(data, search)` → función pura. Aplica substring case-insensitive sobre `nombre`.
- `_sort(data, orden)` → función pura. `saldo` desc / `antiguedad` asc por `primeraFechaPendiente` / `alfabetico` asc por `nombre.localeCompare(b.nombre, 'es')`.
- `renderList()` → llama a `_filter` y `_sort`, genera HTML. También actualiza el header de métricas (total deudores filtrados / suma de saldo).
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

Sigue exactamente el patrón existente en `tests/integration.test.js`: cargar archivos JS reales con `loadScript(path)` (que usa `vm.runInThisContext`), testear funciones puras y outputs HTML, sin mockear DB con datos por test (el mock de `tests/setup.js` es genérico).

### Archivo nuevo: `tests/deudores.test.js`

Cargar `js/deudores.js` con `loadScript`. Tests:

1. **`Deudores._aggregate`** — función pura
   - Caso base: 1 entrega 1000, 1 pago 400 → 1 deudor con saldo 600, `entregasPendientes=1`.
   - Múltiples entregas mismo punto, pagos parciales → suma correcta.
   - Entregas sin `punto_entrega_id` (legacy con `punto_nombre_temp`) se descartan.
   - Saldo exactamente 0 → no aparece en la salida.
   - Sobrepago (pagos > monto_total) → saldo 0, descartado.
   - `primeraFechaPendiente` = la más vieja de las entregas con saldo > 0; `ultimaFechaPendiente` = la más reciente.
2. **`Deudores._filter`** — función pura
   - `search='bene'` matchea "Benedetti" (case-insensitive substring).
   - `search='BENEDETTI'` también matchea.
   - `search=''` devuelve todo.
   - `search='xyz'` devuelve `[]`.
   - Tildes: `search='lopez'` matchea "López"? **Decisión:** el matching es por substring directo sin normalización de tildes. Documentar este comportamiento en el test (`search='lopez'` NO matchea "López"). Si se quiere normalizar, es mejora futura.
3. **`Deudores._sort`** — función pura
   - `orden='saldo'` → desc por saldo.
   - `orden='antiguedad'` → asc por `primeraFechaPendiente` (la más vieja primero).
   - `orden='alfabetico'` → `localeCompare(b, 'es')` (Á antes de B).
4. **`Deudores.render`** — output HTML
   - Devuelve string que contiene `app-header`, input de búsqueda, chips de orden, contenedor de lista.
5. **`Deudores.renderList` con `_data` precargado** — output HTML
   - HTML contiene un `list-item` por deudor.
   - Vacío → `empty-state` con texto "Sin deudas pendientes".
   - Vacío con search activo → mensaje "No hay deudores que coincidan".
   - Click handler tiene `Pagos.showDeudorModal('<id>', '<nombre>')` con `escJs` aplicado.

### Cambios a `tests/integration.test.js` (regresión)

1. **Cargar `puntos.js`** (no se carga hoy) y testear que `Puntos.renderSelector` (la versión existente) sigue produciendo el HTML esperado después de extraer `renderFilterCombobox` — protege el flujo de alta de entregas.
2. Test de `Puntos.renderFilterCombobox`:
   - Con `includeAll=true` el HTML contiene la opción "Todos los puntos".
   - Sin `includeAll` no aparece.
   - El callback `onSelect` se invoca con el `puntoId` correcto al disparar el click.
3. Test de helper `Historial._aggregateClientHeader(entregas, puntoId)` (función pura nueva extraída para testabilidad):
   - Calcula vendido / cobrado / saldo correctamente sobre las entregas filtradas por `punto_entrega_id`.
   - Sin entregas del punto → totales en cero.

### Mocks adicionales en `tests/setup.js` si hace falta

- `Pagos.showDeudorModal` ya está en el módulo cargado; no requiere mock adicional.
- Para casos de repartidor (no admin), sobrescribir en el test puntual:
  ```js
  globalThis.Auth.isAdmin = vi.fn(() => false);
  ```
  Y restablecer `vi.fn(() => true)` en `afterEach` o con `beforeEach`.

### Comando

```bash
npm test
```

Esperado: los 71 tests existentes siguen pasando + ~15–20 nuevos tests para deudores y combobox.

## PWA / Service Worker

- Sumar `'./js/deudores.js'` al array `STATIC_ASSETS` en `sw.js`.
- Bump `CACHE_NAME` de `alfajores-v22` a `alfajores-v23` (convención del repo, ver commits `dcd596f` y similares).
- Verificar que la nueva tab funcione offline tras instalar la versión nueva.

## Migraciones SQL

**Ninguna.** Toda la información se obtiene de tablas existentes:

- `entregas` (con join a `puntos_entrega`).
- `pagos` (fuente de verdad para `monto_pagado`).

## Rollout

1. Merge a master.
2. SW v23 fuerza refresh de los clientes instalados al próximo abrir.
3. Avisar a Emi que pruebe los tres flujos: nueva tab, buscador en historial, agrupación de Benedetti.

## Riesgos y consideraciones

- **Performance sin cap temporal:** si en el futuro hay miles de entregas con deuda, la query inicial puede pesar. Mitigación: agregar `.limit(500)` con un fallback "Ver más antiguas" si llega ese caso. Por ahora (volumen actual: ~30 KB en DB, ver memoria 2026-04-08) no hace falta. Indexes ya creados en `migration-v6` cubren `repartidor_id`, `fecha_hora`, `punto_entrega_id`.
- **Race-guard del search:** sin debounce, `onSearch` rerenderiza en cada tecla. Es client-side y la lista chica, así que no hace falta debounce. Si la lista crece, agregar `setTimeout` de 100ms.
- **6 tabs en bottom-nav:** el nav usa `display: flex; justify-content: space-around; padding: 0 8px` (`styles.css:447–463`). El botón central (`nav-btn--primary`) es 56×56px circular con `margin-top: -20px`. Sumar una 6ta tab queda apretado en celulares ≤360px. Mitigaciones posibles si se ve mal:
  - Reducir `padding` de `.nav-btn` de `8px 12px` a `8px 6px`.
  - Acortar el label "Deudores" → "Deudas" o reemplazar por solo el icono en pantallas chicas con media query.
  - Evaluar después con el celular real de Emi antes de mergear.
- **Refactor de `Puntos.renderSelector`:** al extraer `renderFilterCombobox` hay que verificar que el alta de entregas (`entregas.js`) y la edición no se rompen. Tests de regresión cubren esto, pero **es indispensable un smoke test manual de "alta de entrega" antes de cerrar el PR**.
- **`Historial._aggregateClientHeader`:** se extrae como función pura nueva. Cuidado de no romper el flujo actual de `fetchEntregas` (lista de entregas) — el header es aditivo, no reemplaza nada.
- **Duplicación con la sección Deudores de Análisis:** queda intencionalmente. Si después se confirma que la nueva vista la hace redundante, se elimina en otro PR. No se hace ahora para no mezclar concerns.
