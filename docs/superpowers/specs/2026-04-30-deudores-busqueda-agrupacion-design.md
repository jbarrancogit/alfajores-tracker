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
- **`Pagos.showDeudorModal`** (`pagos.js:139`) ya muestra todas las entregas impagas de **un solo punto** con "Pagar todo" y pago individual. Resuelve el caso "Benedetti es un único punto" pero **no resuelve "Benedetti tiene varios puntos"** (ej. Benedetti Norte + Benedetti Sur).

### Por qué no alcanza con lo que ya hay

Emi es **admin**. Tiene acceso a la sección Deudores de Análisis. **No le sirve** porque:

1. La sección está enterrada al fondo de la pantalla de análisis junto con métricas y rankings — no está pensada como herramienta operativa de cobro, sino como overview analítico.
2. **No tiene buscador por texto.** Hay que scrollear toda la lista.
3. **No agrupa múltiples puntos del mismo cliente.** Si "Benedetti" tiene N puntos en la base, ve N filas separadas. Para procesar todos los pagos de Benedetti necesita abrir N modales.
4. La lista respeta el rango temporal del filtro de Análisis — si elige "Mes" no ve las deudas más viejas, justo las que se "entierran" según su queja.

### Lo que Emi realmente quiere (interpretación profunda del audio 2)

> "marcar varios clientes juntos como en un Excel — escribir Benedetti y que aparezcan TODOS los Benedetti, todas las deudas de las ventas de Benedetti, ahí voy cargando los pagos de cada factura"

El modelo mental es **filtro Excel**: un input que matchea por texto y devuelve todas las filas (facturas) que cumplen, sin importar si pertenecen a uno o varios "puntos" en la DB. Después procesa pagos factura por factura.

Esto requiere **match por substring sobre el nombre del punto**, no `eq` por id.

## Alcance

**Incluye:**

- Vista nueva `/deudores` accesible para **admin y repartidor**, con todos los deudores del usuario (sin cap temporal), buscador por texto **con match por substring** (típo Excel), ordenamiento (saldo / antigüedad / alfabético) y agregados.
- **Cuando hay búsqueda activa en `/deudores`**, además de la lista por cliente: un **resumen agregado** arriba ("3 puntos · 12 facturas pendientes · $87.000") y un botón **"Ver todas las facturas pendientes"** que abre un modal con TODAS las entregas impagas de TODOS los puntos que matchearon — cada factura con su botón de pago individual. Esto resuelve directamente el caso Benedetti-multi-punto.
- Buscador combobox por nombre de cliente en `/historial` reemplazando el `<select>` actual. **Soporta dos modos:** (a) seleccionar un punto específico de la lista (`.eq` exacto, comportamiento actual) o (b) escribir texto libre y aplicar como **filtro substring sobre múltiples puntos** (`.in` con los ids que matchean en `Puntos.cache`).
- Mini-card con totales agregados (vendido / cobrado / saldo) cuando hay uno o más clientes filtrados en historial.
- Tab nueva en bottom-nav para la vista de deudores.
- Tests Vitest cargando `js/deudores.js` con `loadScript` (mismo patrón que `tipos.js`/`pagos.js`), cubriendo función pura de agregación, filtros, orden, modo flat-invoices y render HTML.
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
- `loadData()` → async. Trae todas las entregas del usuario (sin cap temporal; RLS filtra por `repartidor_id` para no-admin), trae los `pagos` con `batchIn`. Llama a `Deudores._aggregate(entregas, pagos)` y también guarda las entregas impagas crudas en `_unpaidEntregas` (para el modo flat-invoices). Llama a `renderList()`. Wrap en `try/catch` con `showToast('Error: ' + friendlyError(err))` y `console.error`. Race-guard con `_fetchId`.
- `_aggregate(entregas, pagos)` → **función pura testeable**. Recibe arrays simples, devuelve `{ porPunto: [...], unpaidEntregas: [...] }`. `porPunto`: `{ puntoId, nombre, saldo, entregasPendientes, ultimaFechaPendiente, primeraFechaPendiente }` con saldo > 0. `unpaidEntregas`: lista plana de entregas crudas con saldo > 0 (cada una con `{ id, puntoId, nombre, fecha_hora, monto_total, pagado, saldo, entrega_lineas }` para mostrar en el modal flat). Misma lógica de agregación que `Dashboard.loadData` líneas 70–95 / `Analisis.loadData` líneas 416–430.
- `_filter(data, search)` → función pura. Aplica substring case-insensitive sobre `nombre`. Sirve para `porPunto` y para filtrar `unpaidEntregas` (ambos tienen `nombre`).
- `_sort(data, orden)` → función pura. `saldo` desc / `antiguedad` asc por `primeraFechaPendiente` / `alfabetico` asc por `nombre.localeCompare(b.nombre, 'es')`.
- `renderList()` → llama a `_filter` y `_sort` sobre `_data.porPunto`, genera la lista de tarjetas. También actualiza el header de métricas y, **si `filters.search` no está vacío**, muestra un botón "Ver todas las facturas pendientes" (ver `showFlatInvoicesModal`).
- `showFlatInvoicesModal()` → abre modal con todas las entregas en `_unpaidEntregas` filtradas por `filters.search` (substring sobre `nombre`), ordenadas por antigüedad asc (más vieja arriba). Cada fila muestra: nombre del punto, fecha, monto total, saldo, y botón "Registrar pago" inline (reutilizando `Pagos.renderFormInline`). Permite el flujo "Benedetti me pagó cada factura" sin cerrar el modal.
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
Puntos.renderFilterCombobox({ inputId, hiddenId, dropdownId, includeAll = true, onSelect, onTextChange })
```

Diferencias con el existente `renderSelector`:
- Sin opción "+ Nuevo".
- Opción "Todos los puntos" cuando `includeAll`.
- Llama a `onSelect(puntoId)` cuando el usuario clickea un punto del dropdown.
- **Nuevo: `onTextChange(text)` se dispara mientras se tipea** — permite a `Historial` aplicar filtro substring multi-punto sin necesidad de seleccionar.

`renderSelector` queda intacto para no romper alta de entrega.

### Filtro substring multi-punto en `/historial`

`Historial.filters` cambia de:

```js
{ periodo, puntoId, repartidorId }    // antes
```

a:

```js
{ periodo, puntoId, puntoSearchText, repartidorId }    // ahora
```

`puntoId` y `puntoSearchText` son mutuamente excluyentes:
- Si el usuario **selecciona** un punto del dropdown → `puntoId` se setea, `puntoSearchText = ''`. Query usa `.eq('punto_entrega_id', puntoId)`.
- Si el usuario **tipea texto sin seleccionar** → `puntoSearchText` se setea, `puntoId = ''`. La función `_resolvePuntoIds(text)` busca en `Puntos.cache` los ids cuyo `nombre` matchea substring case-insensitive, y la query usa `.in('punto_entrega_id', matchingIds)`. Si `matchingIds` está vacío, se muestra empty state sin hacer query (evita query con `.in([])` que devuelve todo).
- Si el input está vacío, ambos quedan vacíos y no se filtra.

Esto es lo que hace que escribir "Benedetti" muestre las entregas de "Benedetti Norte" + "Benedetti Sur" + cualquier otra variante.

### Mini-card de agregados en `/historial`

Cuando `Historial.filters.puntoId` o `Historial.filters.puntoSearchText` están seteados, renderizar arriba de `#hist-list`:

```
┌──────────────────────────────────────┐
│ Benedetti  (3 puntos)                │  ← "(N puntos)" solo si search matchea más de 1
│ Vendido: $124k · Cobrado: $82k       │
│ Saldo: $42k 🔴                       │
│ [Ver cuenta corriente] ──────────────┤  ← solo si saldo > 0 y modo single-punto
└──────────────────────────────────────┘
```

- Cálculo a partir de `Historial._data` ya cargado (sin query extra). Suma `monto_total` y `monto_pagado` de las entregas listadas.
- Botón "Ver cuenta corriente" solo aparece si la selección es de **un único punto** (modo `puntoId`). En modo multi-punto (`puntoSearchText`), se ofrece en su lugar un botón "Ver todas las facturas pendientes" que abre el mismo modal flat-invoices que `/deudores`. Reutiliza `Deudores.showFlatInvoicesModal` (debe ser invocable externamente con un search text como argumento).
- Si `saldo === 0` el monto del saldo se muestra verde y desaparecen los botones.

## Data flow

```
Usuario abre /deudores
  └─► Deudores.render() devuelve shell + spinner
       └─► Deudores.loadData()
            ├─► db.from('entregas')
            │     .select('id, punto_entrega_id, fecha_hora, monto_total,
            │              puntos_entrega(nombre), entrega_lineas(cantidad, tipos_alfajor(nombre))')
            │     [if !admin] .eq('repartidor_id', user.id)
            ├─► batchIn('pagos', 'entrega_id, monto', 'entrega_id', entregaIds)
            ├─► Deudores._aggregate(entregas, pagos) →
            │     { porPunto: [...], unpaidEntregas: [...] }
            ├─► descarta puntos con saldo total = 0
            └─► Deudores._data = porPunto; _unpaidEntregas = unpaidEntregas
                 └─► renderList()

Usuario tipea en buscador
  ├─► onSearch() → renderList() (cliente-side, no fetch)
  └─► si filters.search no vacío y hay matches → muestra botón "Ver todas las facturas pendientes"

Usuario clickea cliente (modo por-punto)
  └─► Pagos.showDeudorModal(puntoId, nombre)  [EXISTENTE]

Usuario clickea "Ver todas las facturas pendientes" (modo flat)
  └─► Deudores.showFlatInvoicesModal(filters.search)
       └─► filtra _unpaidEntregas por substring sobre nombre
            └─► render lista plana, cada fila con Pagos.renderFormInline inline

Tras confirmar pago (cualquier flujo)
  └─► Pagos.confirmar/pagarTodo/deletePago detecta App.currentRoute === '/deudores'
       └─► Deudores.loadData() refresh
```

```
Usuario abre /historial

Caso A — selecciona un punto del dropdown:
  └─► Puntos.renderFilterCombobox onSelect(puntoId)
       └─► Historial.filters.puntoId = puntoId; puntoSearchText = ''
            └─► Historial.fetchEntregas() con .eq('punto_entrega_id', puntoId)
                 └─► render header de cliente "single-punto" con botón "Ver cuenta corriente"

Caso B — tipea texto sin seleccionar (ej. "benedetti"):
  └─► Puntos.renderFilterCombobox onTextChange(text)
       └─► Historial.filters.puntoSearchText = text; puntoId = ''
            └─► Historial._resolvePuntoIds(text, Puntos.cache) → matchingIds
                 ├─► matchingIds vacío → empty state, sin query
                 └─► matchingIds con N items → fetchEntregas() con .in('punto_entrega_id', matchingIds)
                      └─► render header de cliente "multi-punto (N puntos)"
                           con botón "Ver todas las facturas pendientes"
                           → Deudores.showFlatInvoicesModal(text)
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
   - Caso base: 1 entrega 1000, 1 pago 400 → `porPunto` 1 deudor con saldo 600, `entregasPendientes=1`; `unpaidEntregas` con 1 elemento de saldo 600.
   - Múltiples entregas mismo punto, pagos parciales → suma correcta en `porPunto`; lista plana en `unpaidEntregas` con cada entrega individual.
   - **Múltiples puntos con nombres similares ("Benedetti Norte", "Benedetti Sur")** → `porPunto` con 2 entradas separadas; `unpaidEntregas` con todas las facturas mezcladas.
   - Entregas sin `punto_entrega_id` (legacy con `punto_nombre_temp`) se descartan en `porPunto` y en `unpaidEntregas`.
   - Saldo exactamente 0 → no aparece en `porPunto` ni en `unpaidEntregas`.
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
   - **Con `filters.search` no vacío y resultados**: aparece el botón "Ver todas las facturas pendientes" con el contador correcto ("3 puntos · 12 facturas pendientes · $87.000"). Sin search activo, el botón NO aparece.
6. **`Deudores.showFlatInvoicesModal('benedetti')`** — output HTML del modal
   - Lista entregas de TODOS los puntos cuyo nombre matchea "benedetti".
   - Orden por fecha asc (más vieja arriba).
   - Cada fila tiene botón "Registrar pago" que llama a `Pagos.renderFormInline(<entregaId>, <saldo>)`.
   - Sin matches → mensaje "Sin facturas pendientes para esta búsqueda".

### Tests para `Historial` (regresión + multi-punto)

- `Historial._resolvePuntoIds(text, puntosCache)` (función pura nueva extraída):
  - `text='benedetti'`, cache con `[Benedetti Norte, Benedetti Sur, Don Pedro]` → devuelve los 2 ids de Benedetti.
  - `text='xyz'` → devuelve `[]`.
  - `text=''` → devuelve `null` (señal de "no filtrar").
  - Case insensitive: `'BENEDETTI'` matchea igual.
- `Historial._aggregateClientHeader(entregas)`:
  - Calcula vendido / cobrado / saldo correctamente.
  - Cuando las entregas son de múltiples puntos, agrega un campo `puntosCount` con el número de puntos distintos.

### Cambios a `tests/integration.test.js` (regresión)

1. **Cargar `puntos.js`** (no se carga hoy) y testear que `Puntos.renderSelector` (la versión existente) sigue produciendo el HTML esperado después de extraer `renderFilterCombobox` — protege el flujo de alta de entregas.
2. Test de `Puntos.renderFilterCombobox`:
   - Con `includeAll=true` el HTML contiene la opción "Todos los puntos".
   - Sin `includeAll` no aparece.
   - El callback `onSelect` se invoca con el `puntoId` correcto al disparar el click.
   - El callback `onTextChange(text)` se dispara mientras se tipea en el input.
3. **Smoke test del flujo de alta de entregas**: cargar `entregas.js`, llamar a `Entregas.renderForm()` con DOM mockeado, verificar que el HTML resultante contiene un `#ent-punto-search` (input del combobox de Puntos) — confirma que el refactor no rompió el flujo crítico.

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

Esperado: los 71 tests existentes siguen pasando + ~22–28 nuevos tests para deudores (incluido modo flat-invoices y multi-punto), combobox con onTextChange, `Historial._resolvePuntoIds` y `_aggregateClientHeader`, y smoke test de alta de entregas.

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
3. Avisar a Emi que pruebe los flujos:
   - Tab nueva "Deudores", ordenar por antigüedad (las más viejas arriba — ataca su queja principal).
   - Tipear "Benedetti" en `/deudores` → ver el botón "Ver todas las facturas pendientes" → cargar pagos uno por uno desde el modal flat sin cerrarlo.
   - En `/historial`, tipear "Benedetti" en el combobox sin seleccionar nada → la lista se filtra por TODOS los puntos Benedetti.
   - Verificar que el header de cliente muestra "(N puntos)" cuando aplica.

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
