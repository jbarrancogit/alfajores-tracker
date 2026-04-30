# Vista de Deudores, búsqueda por texto y agregados por cliente — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir los pedidos de Emiliano Ríos (cliente/admin) tras un mes de uso: una vista dedicada `/deudores` sin cap temporal, búsqueda por texto al estilo Excel en `/deudores` y `/historial`, y agrupación de facturas pendientes de un mismo cliente (incluyendo casos donde el cliente tiene múltiples puntos de entrega como "Benedetti Norte" + "Benedetti Sur").

**Architecture:** Vista nueva `js/deudores.js` siguiendo el patrón vanilla-JS namespace + `render()`/`loadData()` del resto del proyecto. Lógica de agregación, filtrado y orden extraída a funciones puras testeables. Combobox reutilizable extraído de `Puntos.renderSelector` para el filtro de Historial, con doble modo (selección exacta o filtro substring multi-punto). Reutiliza `Pagos.showDeudorModal` existente para el caso single-punto y un modal nuevo `Deudores.showFlatInvoicesModal` para el caso multi-punto/flat.

**Tech Stack:** Vanilla JavaScript (sin frameworks), Supabase (`db.from(...)`), Vitest + jsdom para tests, helpers globales del proyecto (`esc`, `escJs`, `fmtMoney`, `fmtDateTime`, `showToast`, `friendlyError`, `batchIn`, `Auth.isAdmin`). Service Worker propio.

**Spec de referencia:** `docs/superpowers/specs/2026-04-30-deudores-busqueda-agrupacion-design.md`

---

## File Structure

### Archivos nuevos

- **`js/deudores.js`** — namespace `Deudores` con: `filters`, `_data`, `_unpaidEntregas`, `_fetchId`, `render()`, `loadData()`, `_aggregate()`, `_filter()`, `_sort()`, `renderList()`, `showFlatInvoicesModal()`, `setOrden()`, `onSearch()`, `onRepartidorChange()`. Una sola responsabilidad: la vista de deudores.
- **`tests/deudores.test.js`** — tests para todas las funciones puras de `Deudores` y para los outputs HTML.

### Archivos modificados

- **`index.html`** — agregar `<script src="js/deudores.js">` y nueva tab en `#bottom-nav`.
- **`js/app.js`** — registrar ruta `/deudores`.
- **`js/puntos.js`** — agregar método `Puntos.renderFilterCombobox(opts)` reutilizable. `Puntos.renderSelector` queda intacto.
- **`js/historial.js`** — añadir `puntoSearchText` a filters, agregar `_resolvePuntoIds()`, `_aggregateClientHeader()`, `_renderClientHeader()`. Reemplazar el `<select>` de punto por el combobox nuevo. Modificar `fetchEntregas` para soportar el modo multi-punto.
- **`js/pagos.js`** — agregar refresh hook a `/deudores` en `confirmar`, `pagarTodo`, `deletePago`.
- **`sw.js`** — sumar `'./js/deudores.js'` al array `STATIC_ASSETS` y bump `CACHE_NAME` (`alfajores-v22` → `alfajores-v23`).
- **`tests/integration.test.js`** — tests de regresión: cargar `puntos.js` y `entregas.js`, verificar que `Puntos.renderSelector` sigue produciendo el HTML esperado y que `Entregas.renderForm` no rompe el alta de entregas. Tests para `Puntos.renderFilterCombobox`, `Historial._resolvePuntoIds`, `Historial._aggregateClientHeader`.

### CSS

Reutilizar clases existentes verificadas: `metrics-grid`, `metric-card`, `list-item` y variantes, `filter-bar`, `filter-chip`, `empty-state`, `app-header`, `form-input`, `form-select`, `badge`/`badge-red`. **No agregar CSS nuevo en esta iteración.** Si en el smoke test manual algo se ve mal, se ajusta en una task aparte.

---

## Convenciones del proyecto a respetar (recordatorio)

- Vanilla JS con namespaces tipo `const Foo = { ... }`.
- Cada vista expone `render()` (devuelve string HTML) y `loadData()` async.
- Acceso DB: `db.from(...)`. Helpers: `esc`, `escJs`, `fmtMoney`, `fmtDateTime`, `showToast`, `friendlyError`, `batchIn`, `Pagos.badge`.
- Refresh por ruta: `if (App.currentRoute === '/x') X.loadData()` después de mutaciones.
- Race-guard con `_fetchId` para queries concurrentes (ver `historial.js:76-77`).
- `try/catch` envolviendo `loadData`. En catch: `console.error` + `showToast('Error: ' + friendlyError(err))`.
- Spinners durante carga: `<div class="spinner mt-8"></div>`.
- Empty states con `<div class="empty-state"><p>...</p></div>`.

---

## Tarea 1: Esqueleto de `Deudores` + ruta + nav button + script tag

Setup inicial sin lógica. Confirma que la nueva ruta navega y la tab se ve antes de invertir en lógica.

**Files:**
- Create: `js/deudores.js`
- Modify: `index.html`
- Modify: `js/app.js:4-11` (routes object)

- [ ] **Step 1.1: Crear `js/deudores.js` con esqueleto vacío**

```javascript
const Deudores = {
  filters: { orden: 'saldo', search: '', repartidorId: '' },
  _data: [],
  _unpaidEntregas: [],
  _fetchId: 0,

  render() {
    return `
      <div class="app-header">
        <h1>Deudores</h1>
      </div>
      <div id="deud-list"><div class="spinner mt-8"></div></div>
    `;
  }
};
```

- [ ] **Step 1.2: Sumar `<script src="js/deudores.js">` en `index.html`**

Insertar entre la línea de `historial.js` y `analisis.js` (alrededor de `index.html:52-53`):

```html
    <script src="js/historial.js"></script>
    <script src="js/deudores.js"></script>
    <script src="js/analisis.js"></script>
```

- [ ] **Step 1.3: Agregar tab "Deudores" en `#bottom-nav` de `index.html`**

Insertar entre el botón de Historial y el de Ruta (alrededor de `index.html:31-32`):

```html
    <button class="nav-btn" data-route="/deudores">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      <span>Deudores</span>
    </button>
```

(Ícono $/billete usando un path simple; encaja con el resto que también son paths Feather-like.)

- [ ] **Step 1.4: Registrar ruta `/deudores` en `js/app.js`**

Modificar `js/app.js:4-11`:

```javascript
  routes: {
    '/': () => Dashboard.render(),
    '/entrega': () => Entregas.renderForm(),
    '/historial': () => Historial.render(),
    '/deudores': () => Deudores.render(),
    '/ruta': () => Ruta.render(),
    '/analisis': () => Analisis.render(),
    '/config': () => Config.render(),
  },
```

- [ ] **Step 1.5: Smoke manual — abrir la app local y navegar a `/#/deudores`**

Servir con `npx serve .` desde la raíz del proyecto. En el browser ir a `http://localhost:3000/#/deudores`.

Esperado: header "Deudores" se ve, spinner aparece, la tab nueva en bottom-nav está activa. Verificar también que el resto de las tabs siguen funcionando.

Si la 6ta tab queda muy apretada en mobile (DevTools mobile view ≤360px), anotar para ajustar en Task 14 (smoke test final), no bloquear acá.

- [ ] **Step 1.6: Commit**

```bash
git add js/deudores.js index.html js/app.js
git commit -m "feat(deudores): scaffold view, route and nav button"
```

---

## Tarea 2: TDD `Deudores._aggregate` (función pura)

Núcleo de la vista: agrupa entregas + pagos en `{ porPunto, unpaidEntregas }`. Sin DB, todo arrays simples.

**Files:**
- Modify: `js/deudores.js`
- Test: `tests/deudores.test.js`

- [ ] **Step 2.1: Crear `tests/deudores.test.js` con loader + test de caso base**

```javascript
/**
 * Deudores tests — pure functions and HTML output.
 * Loads js/deudores.js into the jsdom context, same pattern
 * as tests/integration.test.js.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(__dirname, '..');

function loadScript(relativePath) {
  const code = readFileSync(resolve(ROOT, relativePath), 'utf-8');
  vm.runInThisContext(code, { filename: relativePath });
}

// Load dependencies first
loadScript('js/supabase.js');
loadScript('js/pagos.js');
loadScript('js/deudores.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.clearAllMocks();
});

describe('Deudores._aggregate — pure aggregation', () => {
  it('aggregates 1 entrega + 1 partial pago into 1 deudor with correct saldo', () => {
    const entregas = [
      { id: 'e1', punto_entrega_id: 'p1', monto_total: 1000, fecha_hora: '2026-04-01T10:00:00Z',
        puntos_entrega: { nombre: 'Kiosco Don Pedro' } }
    ];
    const pagos = [
      { entrega_id: 'e1', monto: 400 }
    ];
    const result = Deudores._aggregate(entregas, pagos);
    expect(result.porPunto).toHaveLength(1);
    expect(result.porPunto[0]).toMatchObject({
      puntoId: 'p1', nombre: 'Kiosco Don Pedro', saldo: 600, entregasPendientes: 1
    });
    expect(result.unpaidEntregas).toHaveLength(1);
    expect(result.unpaidEntregas[0].saldo).toBe(600);
  });
});
```

- [ ] **Step 2.2: Correr test — debe fallar porque `_aggregate` no existe**

Run: `npx vitest run tests/deudores.test.js`

Expected: FAIL con `TypeError: Deudores._aggregate is not a function`.

- [ ] **Step 2.3: Implementar `Deudores._aggregate` mínimo**

Agregar a `js/deudores.js` (dentro del namespace `Deudores`):

```javascript
  _aggregate(entregas, pagos) {
    const pagadoPorEntrega = {};
    (pagos || []).forEach(p => {
      pagadoPorEntrega[p.entrega_id] = (pagadoPorEntrega[p.entrega_id] || 0) + Number(p.monto);
    });

    const unpaidEntregas = [];
    const porPuntoMap = {};

    (entregas || []).forEach(e => {
      if (!e.punto_entrega_id) return;
      const pagado = pagadoPorEntrega[e.id] || 0;
      const saldo = Number(e.monto_total) - pagado;
      if (saldo <= 0) return;

      const nombre = e.puntos_entrega?.nombre || '?';
      unpaidEntregas.push({
        id: e.id,
        puntoId: e.punto_entrega_id,
        nombre,
        fecha_hora: e.fecha_hora,
        monto_total: Number(e.monto_total),
        pagado,
        saldo,
        entrega_lineas: e.entrega_lineas || []
      });

      const key = e.punto_entrega_id;
      if (!porPuntoMap[key]) {
        porPuntoMap[key] = {
          puntoId: key, nombre,
          saldo: 0, entregasPendientes: 0,
          primeraFechaPendiente: e.fecha_hora,
          ultimaFechaPendiente: e.fecha_hora
        };
      }
      const p = porPuntoMap[key];
      p.saldo += saldo;
      p.entregasPendientes++;
      if (e.fecha_hora < p.primeraFechaPendiente) p.primeraFechaPendiente = e.fecha_hora;
      if (e.fecha_hora > p.ultimaFechaPendiente) p.ultimaFechaPendiente = e.fecha_hora;
    });

    return {
      porPunto: Object.values(porPuntoMap),
      unpaidEntregas
    };
  },
```

- [ ] **Step 2.4: Correr test — debe pasar**

Run: `npx vitest run tests/deudores.test.js`

Expected: PASS.

- [ ] **Step 2.5: Agregar test de múltiples puntos con nombres similares (Benedetti)**

Agregar al `describe` de `_aggregate`:

```javascript
  it('keeps multi-punto same-name customers separated in porPunto, joined in unpaidEntregas', () => {
    const entregas = [
      { id: 'e1', punto_entrega_id: 'pN', monto_total: 1000, fecha_hora: '2026-04-01T10:00:00Z',
        puntos_entrega: { nombre: 'Benedetti Norte' } },
      { id: 'e2', punto_entrega_id: 'pS', monto_total: 2000, fecha_hora: '2026-04-15T10:00:00Z',
        puntos_entrega: { nombre: 'Benedetti Sur' } }
    ];
    const result = Deudores._aggregate(entregas, []);
    expect(result.porPunto).toHaveLength(2);
    expect(result.porPunto.map(p => p.nombre).sort()).toEqual(['Benedetti Norte', 'Benedetti Sur']);
    expect(result.unpaidEntregas).toHaveLength(2);
  });
```

- [ ] **Step 2.6: Correr test — debe pasar (ya está implementado)**

Run: `npx vitest run tests/deudores.test.js -t "multi-punto"`

Expected: PASS.

- [ ] **Step 2.7: Agregar test de descarte de entregas legacy y saldo cero**

```javascript
  it('discards entregas without punto_entrega_id (legacy punto_nombre_temp)', () => {
    const entregas = [
      { id: 'e1', punto_entrega_id: null, monto_total: 1000, fecha_hora: '2026-04-01T10:00:00Z',
        punto_nombre_temp: 'Cliente legacy' }
    ];
    const result = Deudores._aggregate(entregas, []);
    expect(result.porPunto).toHaveLength(0);
    expect(result.unpaidEntregas).toHaveLength(0);
  });

  it('discards entregas with saldo === 0', () => {
    const entregas = [
      { id: 'e1', punto_entrega_id: 'p1', monto_total: 500, fecha_hora: '2026-04-01T10:00:00Z',
        puntos_entrega: { nombre: 'X' } }
    ];
    const pagos = [{ entrega_id: 'e1', monto: 500 }];
    const result = Deudores._aggregate(entregas, pagos);
    expect(result.porPunto).toHaveLength(0);
    expect(result.unpaidEntregas).toHaveLength(0);
  });

  it('discards overpaid entregas (pagos > monto_total)', () => {
    const entregas = [
      { id: 'e1', punto_entrega_id: 'p1', monto_total: 500, fecha_hora: '2026-04-01T10:00:00Z',
        puntos_entrega: { nombre: 'X' } }
    ];
    const pagos = [{ entrega_id: 'e1', monto: 700 }];
    const result = Deudores._aggregate(entregas, pagos);
    expect(result.porPunto).toHaveLength(0);
  });
```

- [ ] **Step 2.8: Correr todos los tests — deben pasar**

Run: `npx vitest run tests/deudores.test.js`

Expected: PASS, todos los tests del describe `_aggregate`.

- [ ] **Step 2.9: Agregar test de fechas primera/ultima**

```javascript
  it('tracks primeraFechaPendiente (oldest) and ultimaFechaPendiente (newest)', () => {
    const entregas = [
      { id: 'e1', punto_entrega_id: 'p1', monto_total: 100, fecha_hora: '2026-04-15T10:00:00Z',
        puntos_entrega: { nombre: 'X' } },
      { id: 'e2', punto_entrega_id: 'p1', monto_total: 200, fecha_hora: '2026-04-01T10:00:00Z',
        puntos_entrega: { nombre: 'X' } },
      { id: 'e3', punto_entrega_id: 'p1', monto_total: 300, fecha_hora: '2026-04-20T10:00:00Z',
        puntos_entrega: { nombre: 'X' } }
    ];
    const result = Deudores._aggregate(entregas, []);
    expect(result.porPunto[0].primeraFechaPendiente).toBe('2026-04-01T10:00:00Z');
    expect(result.porPunto[0].ultimaFechaPendiente).toBe('2026-04-20T10:00:00Z');
  });
```

- [ ] **Step 2.10: Correr y verificar**

Run: `npx vitest run tests/deudores.test.js`

Expected: PASS.

- [ ] **Step 2.11: Commit**

```bash
git add js/deudores.js tests/deudores.test.js
git commit -m "feat(deudores): pure _aggregate function with tests"
```

---

## Tarea 3: TDD `Deudores._filter` (función pura)

Filtrado por substring case-insensitive. Aplica tanto a `porPunto` como a `unpaidEntregas` (ambos tienen `nombre`).

**Files:**
- Modify: `js/deudores.js`
- Test: `tests/deudores.test.js`

- [ ] **Step 3.1: Agregar tests para `_filter`**

Agregar al final de `tests/deudores.test.js`:

```javascript
describe('Deudores._filter — pure substring filter', () => {
  const data = [
    { nombre: 'Benedetti Norte', saldo: 1000 },
    { nombre: 'Benedetti Sur', saldo: 2000 },
    { nombre: 'Don Pedro', saldo: 500 }
  ];

  it('matches case-insensitive substring "bene"', () => {
    expect(Deudores._filter(data, 'bene')).toHaveLength(2);
  });

  it('matches uppercase BENEDETTI', () => {
    expect(Deudores._filter(data, 'BENEDETTI')).toHaveLength(2);
  });

  it('returns full array on empty search', () => {
    expect(Deudores._filter(data, '')).toHaveLength(3);
  });

  it('returns empty array on no match', () => {
    expect(Deudores._filter(data, 'xyz')).toHaveLength(0);
  });

  it('does NOT normalize accents (Lopez does not match López)', () => {
    const accented = [{ nombre: 'López' }];
    expect(Deudores._filter(accented, 'lopez')).toHaveLength(0);
    expect(Deudores._filter(accented, 'López')).toHaveLength(1);
  });
});
```

- [ ] **Step 3.2: Correr — debe fallar**

Run: `npx vitest run tests/deudores.test.js -t "_filter"`

Expected: FAIL con `TypeError: Deudores._filter is not a function`.

- [ ] **Step 3.3: Implementar `_filter`**

Agregar a `Deudores`:

```javascript
  _filter(data, search) {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(d => (d.nombre || '').toLowerCase().includes(q));
  },
```

- [ ] **Step 3.4: Correr — debe pasar**

Run: `npx vitest run tests/deudores.test.js -t "_filter"`

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add js/deudores.js tests/deudores.test.js
git commit -m "feat(deudores): pure _filter function with tests"
```

---

## Tarea 4: TDD `Deudores._sort` (función pura)

Tres órdenes: saldo desc, antigüedad asc, alfabético locale-aware.

**Files:**
- Modify: `js/deudores.js`
- Test: `tests/deudores.test.js`

- [ ] **Step 4.1: Agregar tests de `_sort`**

```javascript
describe('Deudores._sort — pure sort function', () => {
  const data = [
    { nombre: 'Don Pedro', saldo: 500, primeraFechaPendiente: '2026-04-15T10:00:00Z' },
    { nombre: 'Benedetti', saldo: 2000, primeraFechaPendiente: '2026-04-01T10:00:00Z' },
    { nombre: 'Álvarez', saldo: 800, primeraFechaPendiente: '2026-04-20T10:00:00Z' }
  ];

  it('sorts by saldo desc', () => {
    const sorted = Deudores._sort([...data], 'saldo');
    expect(sorted.map(d => d.nombre)).toEqual(['Benedetti', 'Álvarez', 'Don Pedro']);
  });

  it('sorts by antiguedad asc (oldest first)', () => {
    const sorted = Deudores._sort([...data], 'antiguedad');
    expect(sorted.map(d => d.nombre)).toEqual(['Benedetti', 'Don Pedro', 'Álvarez']);
  });

  it('sorts alphabetically with Spanish locale (Á before B)', () => {
    const sorted = Deudores._sort([...data], 'alfabetico');
    expect(sorted.map(d => d.nombre)).toEqual(['Álvarez', 'Benedetti', 'Don Pedro']);
  });

  it('returns input unchanged on unknown orden', () => {
    const sorted = Deudores._sort([...data], 'unknown');
    expect(sorted).toHaveLength(3);
  });
});
```

- [ ] **Step 4.2: Correr — debe fallar**

Run: `npx vitest run tests/deudores.test.js -t "_sort"`

Expected: FAIL.

- [ ] **Step 4.3: Implementar `_sort`**

```javascript
  _sort(data, orden) {
    const arr = [...data];
    if (orden === 'saldo') {
      arr.sort((a, b) => b.saldo - a.saldo);
    } else if (orden === 'antiguedad') {
      arr.sort((a, b) => (a.primeraFechaPendiente || '').localeCompare(b.primeraFechaPendiente || ''));
    } else if (orden === 'alfabetico') {
      arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    }
    return arr;
  },
```

- [ ] **Step 4.4: Correr — debe pasar**

Run: `npx vitest run tests/deudores.test.js -t "_sort"`

Expected: PASS (4 tests).

- [ ] **Step 4.5: Commit**

```bash
git add js/deudores.js tests/deudores.test.js
git commit -m "feat(deudores): pure _sort function with tests"
```

---

## Tarea 5: `Deudores.render()` con UI completa + `loadData()`

Reemplaza el esqueleto de Task 1 con la UI real (header, buscador, chips de orden, contenedor de lista, contenedor de header de métricas y botón flat). Agrega `loadData()` que llama al DB y a `_aggregate`.

**Files:**
- Modify: `js/deudores.js`
- Test: `tests/deudores.test.js`

- [ ] **Step 5.1: Agregar tests para `Deudores.render()`**

```javascript
describe('Deudores.render — HTML output', () => {
  it('returns HTML containing app-header with Deudores title', () => {
    const html = Deudores.render();
    expect(html).toContain('app-header');
    expect(html).toContain('Deudores');
  });

  it('contains search input', () => {
    const html = Deudores.render();
    expect(html).toContain('id="deud-search"');
    expect(html).toContain('Buscar cliente');
  });

  it('contains the three order chips: saldo / antiguedad / alfabetico', () => {
    const html = Deudores.render();
    expect(html).toContain("setOrden(this, 'saldo')");
    expect(html).toContain("setOrden(this, 'antiguedad')");
    expect(html).toContain("setOrden(this, 'alfabetico')");
  });

  it('contains placeholder containers for header and list', () => {
    const html = Deudores.render();
    expect(html).toContain('id="deud-header"');
    expect(html).toContain('id="deud-list"');
  });
});
```

- [ ] **Step 5.2: Correr — debe fallar (HTML no contiene esos ids)**

Run: `npx vitest run tests/deudores.test.js -t "render"`

Expected: FAIL.

- [ ] **Step 5.3: Reemplazar `Deudores.render()` con la versión completa**

Reemplazar el `render()` actual:

```javascript
  render() {
    Deudores.loadData();
    const isAdmin = (typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin());
    return `
      <div class="app-header">
        <h1>Deudores</h1>
      </div>
      <div class="form-group">
        <input class="form-input" id="deud-search" type="text"
               placeholder="Buscar cliente..." autocomplete="off"
               oninput="Deudores.onSearch()">
      </div>
      <div class="filter-bar" id="deud-orden-bar">
        <button class="filter-chip active" onclick="Deudores.setOrden(this, 'saldo')">Saldo</button>
        <button class="filter-chip" onclick="Deudores.setOrden(this, 'antiguedad')">Antigüedad</button>
        <button class="filter-chip" onclick="Deudores.setOrden(this, 'alfabetico')">A–Z</button>
      </div>
      ${isAdmin ? `
      <select class="form-select mb-8" id="deud-repartidor"
              onchange="Deudores.onRepartidorChange()" style="font-size:0.85rem">
        <option value="">Todos los repartidores</option>
      </select>
      ` : ''}
      <div id="deud-header"></div>
      <div id="deud-list"><div class="spinner mt-8"></div></div>
    `;
  },
```

- [ ] **Step 5.4: Correr tests de render — deben pasar**

Run: `npx vitest run tests/deudores.test.js -t "render"`

Expected: PASS (4 tests).

- [ ] **Step 5.5: Implementar `Deudores.loadData()`**

Agregar al namespace:

```javascript
  async loadData() {
   try {
    Deudores._fetchId++;
    const myFetchId = Deudores._fetchId;
    const isAdmin = Auth.isAdmin();

    let q = db.from('entregas')
      .select('id, punto_entrega_id, fecha_hora, monto_total, repartidor_id, puntos_entrega(nombre), entrega_lineas(cantidad, tipos_alfajor(nombre))');
    if (!isAdmin) {
      q = q.eq('repartidor_id', Auth.currentUser.id);
    } else if (Deudores.filters.repartidorId) {
      q = q.eq('repartidor_id', Deudores.filters.repartidorId);
    }
    const { data: entregas } = await q;
    if (myFetchId !== Deudores._fetchId) return;

    const entregaIds = (entregas || []).map(e => e.id);
    const pagos = await batchIn('pagos', 'entrega_id, monto', 'entrega_id', entregaIds);
    if (myFetchId !== Deudores._fetchId) return;

    const { porPunto, unpaidEntregas } = Deudores._aggregate(entregas || [], pagos || []);
    Deudores._data = porPunto;
    Deudores._unpaidEntregas = unpaidEntregas;

    if (isAdmin) {
      const { data: usuarios } = await db.from('usuarios').select('id, nombre').order('nombre');
      const sel = document.getElementById('deud-repartidor');
      if (sel && usuarios) {
        const opts = usuarios.map(u =>
          `<option value="${u.id}" ${u.id === Deudores.filters.repartidorId ? 'selected' : ''}>${esc(u.nombre)}</option>`
        ).join('');
        sel.innerHTML = `<option value="">Todos los repartidores</option>${opts}`;
      }
    }

    Deudores.renderList();
   } catch (err) {
    console.error('Deudores.loadData error:', err);
    showToast('Error: ' + friendlyError(err));
    const list = document.getElementById('deud-list');
    if (list) list.innerHTML = '<p class="text-sm text-red">Error al cargar deudores</p>';
   }
  },
```

- [ ] **Step 5.6: Implementar handlers `setOrden`, `onSearch`, `onRepartidorChange` (stubs que llaman a renderList — renderList se implementa en Task 6)**

```javascript
  setOrden(chip, orden) {
    document.querySelectorAll('#deud-orden-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Deudores.filters.orden = orden;
    Deudores.renderList();
  },

  onSearch() {
    const input = document.getElementById('deud-search');
    Deudores.filters.search = input ? input.value : '';
    Deudores.renderList();
  },

  onRepartidorChange() {
    const sel = document.getElementById('deud-repartidor');
    Deudores.filters.repartidorId = sel ? sel.value : '';
    Deudores.loadData();
  },

  renderList() {
    // Implemented in Task 6
  },
```

- [ ] **Step 5.7: Correr todos los tests — todos deben seguir pasando**

Run: `npx vitest run tests/deudores.test.js`

Expected: PASS (todos los _aggregate/_filter/_sort + render).

- [ ] **Step 5.8: Smoke manual — abrir `/#/deudores`**

Servir con `npx serve .`. Esperado: header, buscador, chips de orden y dropdown de repartidor (si admin) se renderizan. La lista muestra spinner y la red dispara la query (verificar en DevTools Network). `renderList` está vacío → la lista queda con spinner indefinido. Eso se arregla en la próxima task.

- [ ] **Step 5.9: Commit**

```bash
git add js/deudores.js tests/deudores.test.js
git commit -m "feat(deudores): render() UI shell + loadData() with race-guard"
```

---

## Tarea 6: `Deudores.renderList()` con empty/match/no-match states

Aplica filtro y orden al `_data`, renderiza la lista de deudores y el header de métricas. Cuando hay search activo y matches, agrega botón "Ver todas las facturas pendientes" (handler de la task siguiente).

**Files:**
- Modify: `js/deudores.js`
- Test: `tests/deudores.test.js`

- [ ] **Step 6.1: Agregar tests para `renderList`**

```javascript
describe('Deudores.renderList — list rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="deud-header"></div>
      <div id="deud-list"></div>
    `;
    Deudores._data = [];
    Deudores._unpaidEntregas = [];
    Deudores.filters = { orden: 'saldo', search: '', repartidorId: '' };
  });

  it('shows empty state when _data is empty', () => {
    Deudores.renderList();
    const list = document.getElementById('deud-list');
    expect(list.innerHTML).toContain('empty-state');
    expect(list.innerHTML).toContain('Sin deudas pendientes');
  });

  it('shows no-match message when search has no results', () => {
    Deudores._data = [{ puntoId: 'p1', nombre: 'Don Pedro', saldo: 100, entregasPendientes: 1, primeraFechaPendiente: '2026-04-01' }];
    Deudores.filters.search = 'xyz';
    Deudores.renderList();
    const list = document.getElementById('deud-list');
    expect(list.innerHTML).toContain('No hay deudores que coincidan');
  });

  it('renders a list-item per deudor with name and saldo', () => {
    Deudores._data = [
      { puntoId: 'p1', nombre: 'Benedetti', saldo: 1000, entregasPendientes: 2, primeraFechaPendiente: '2026-04-01T10:00:00Z' }
    ];
    Deudores.renderList();
    const list = document.getElementById('deud-list');
    expect(list.innerHTML).toContain('list-item');
    expect(list.innerHTML).toContain('Benedetti');
    expect(list.innerHTML).toContain('Pagos.showDeudorModal');
  });

  it('shows aggregate header with count and total saldo', () => {
    Deudores._data = [
      { puntoId: 'p1', nombre: 'A', saldo: 100, entregasPendientes: 1, primeraFechaPendiente: '2026-04-01' },
      { puntoId: 'p2', nombre: 'B', saldo: 200, entregasPendientes: 1, primeraFechaPendiente: '2026-04-02' }
    ];
    Deudores.renderList();
    const header = document.getElementById('deud-header');
    expect(header.innerHTML).toContain('2');     // 2 clientes
    expect(header.innerHTML).toMatch(/300/);     // total saldo
  });

  it('shows "Ver todas las facturas pendientes" button when search active and matches exist', () => {
    Deudores._data = [{ puntoId: 'p1', nombre: 'Benedetti', saldo: 100, entregasPendientes: 1, primeraFechaPendiente: '2026-04-01' }];
    Deudores._unpaidEntregas = [
      { id: 'e1', puntoId: 'p1', nombre: 'Benedetti', fecha_hora: '2026-04-01', monto_total: 200, pagado: 100, saldo: 100, entrega_lineas: [] }
    ];
    Deudores.filters.search = 'bene';
    Deudores.renderList();
    const header = document.getElementById('deud-header');
    expect(header.innerHTML).toContain('Ver todas las facturas pendientes');
    expect(header.innerHTML).toContain('showFlatInvoicesModal');
  });

  it('does NOT show flat-invoices button when search is empty', () => {
    Deudores._data = [{ puntoId: 'p1', nombre: 'Benedetti', saldo: 100, entregasPendientes: 1, primeraFechaPendiente: '2026-04-01' }];
    Deudores.filters.search = '';
    Deudores.renderList();
    const header = document.getElementById('deud-header');
    expect(header.innerHTML).not.toContain('Ver todas las facturas pendientes');
  });
});
```

- [ ] **Step 6.2: Correr tests — deben fallar (`renderList` está vacío)**

Run: `npx vitest run tests/deudores.test.js -t "renderList"`

Expected: FAIL en todos.

- [ ] **Step 6.3: Implementar `renderList`**

Reemplazar el stub vacío:

```javascript
  renderList() {
    const list = document.getElementById('deud-list');
    const header = document.getElementById('deud-header');
    if (!list) return;

    const filtered = Deudores._sort(Deudores._filter(Deudores._data, Deudores.filters.search), Deudores.filters.orden);

    if (header) {
      const totalSaldo = filtered.reduce((s, d) => s + d.saldo, 0);
      const filteredEntregas = Deudores._filter(Deudores._unpaidEntregas, Deudores.filters.search);
      const showFlatBtn = Deudores.filters.search && filteredEntregas.length > 0;

      header.innerHTML = filtered.length === 0 ? '' : `
        <div class="metric-card" style="margin-bottom:8px">
          <div class="metric-label">${filtered.length} ${filtered.length === 1 ? 'cliente' : 'clientes'} · ${filteredEntregas.length} factura${filteredEntregas.length === 1 ? '' : 's'} pendiente${filteredEntregas.length === 1 ? '' : 's'}</div>
          <div class="metric-value text-red">${fmtMoney(totalSaldo)}</div>
          ${showFlatBtn ? `
          <button class="btn btn-secondary btn-block mt-8" onclick="Deudores.showFlatInvoicesModal('${escJs(Deudores.filters.search)}')">
            Ver todas las facturas pendientes
          </button>
          ` : ''}
        </div>
      `;
    }

    if (filtered.length === 0) {
      list.innerHTML = Deudores.filters.search
        ? '<div class="empty-state"><p>No hay deudores que coincidan con esa búsqueda</p></div>'
        : '<div class="empty-state"><p>Sin deudas pendientes</p></div>';
      return;
    }

    list.innerHTML = filtered.map(d => {
      const diasAtras = Math.floor((Date.now() - new Date(d.primeraFechaPendiente).getTime()) / 86400000);
      return `
        <div class="list-item" onclick="Pagos.showDeudorModal('${d.puntoId}', '${escJs(d.nombre)}')">
          <div class="list-item-content">
            <div class="list-item-title">${esc(d.nombre)}</div>
            <div class="list-item-subtitle">${d.entregasPendientes} pendiente${d.entregasPendientes === 1 ? '' : 's'} · más vieja hace ${diasAtras}d</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount text-red">${fmtMoney(d.saldo)}</div>
          </div>
        </div>
      `;
    }).join('');
  },
```

- [ ] **Step 6.4: Correr — deben pasar**

Run: `npx vitest run tests/deudores.test.js -t "renderList"`

Expected: PASS (6 tests).

- [ ] **Step 6.5: Smoke manual**

Servir y abrir `/#/deudores`. Si hay datos en DB, ver lista de deudores con header de métricas. Tipear en buscador → debería filtrar. Cambiar chips de orden → reordenar.

- [ ] **Step 6.6: Commit**

```bash
git add js/deudores.js tests/deudores.test.js
git commit -m "feat(deudores): renderList with search, sort, header, flat button"
```

---

## Tarea 7: `Deudores.showFlatInvoicesModal(searchText)`

Modal con TODAS las facturas pendientes que matchean el texto. Cada fila tiene su botón de pago inline (reutiliza `Pagos.renderFormInline`).

**Files:**
- Modify: `js/deudores.js`
- Test: `tests/deudores.test.js`

- [ ] **Step 7.1: Agregar tests**

```javascript
describe('Deudores.showFlatInvoicesModal — flat invoices modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    Deudores._unpaidEntregas = [
      { id: 'e1', puntoId: 'pN', nombre: 'Benedetti Norte', fecha_hora: '2026-04-15T10:00:00Z',
        monto_total: 1000, pagado: 0, saldo: 1000, entrega_lineas: [] },
      { id: 'e2', puntoId: 'pS', nombre: 'Benedetti Sur', fecha_hora: '2026-04-01T10:00:00Z',
        monto_total: 2000, pagado: 500, saldo: 1500, entrega_lineas: [] },
      { id: 'e3', puntoId: 'p3', nombre: 'Don Pedro', fecha_hora: '2026-04-10T10:00:00Z',
        monto_total: 500, pagado: 0, saldo: 500, entrega_lineas: [] }
    ];
  });

  it('opens a modal with only matching invoices', () => {
    Deudores.showFlatInvoicesModal('benedetti');
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.innerHTML).toContain('Benedetti Norte');
    expect(overlay.innerHTML).toContain('Benedetti Sur');
    expect(overlay.innerHTML).not.toContain('Don Pedro');
  });

  it('orders matching invoices by fecha asc (oldest first)', () => {
    Deudores.showFlatInvoicesModal('benedetti');
    const overlay = document.querySelector('.modal-overlay');
    const html = overlay.innerHTML;
    const idxSur = html.indexOf('Benedetti Sur');     // older
    const idxNorte = html.indexOf('Benedetti Norte'); // newer
    expect(idxSur).toBeLessThan(idxNorte);
  });

  it('includes "Registrar pago" button per invoice', () => {
    Deudores.showFlatInvoicesModal('benedetti');
    const overlay = document.querySelector('.modal-overlay');
    const buttons = overlay.querySelectorAll('button');
    const registrarBtns = Array.from(buttons).filter(b => b.textContent.includes('Registrar pago'));
    expect(registrarBtns.length).toBe(2);  // 2 matching invoices
  });

  it('shows empty message when no matches', () => {
    Deudores.showFlatInvoicesModal('xyz-no-match');
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay.innerHTML).toContain('Sin facturas pendientes');
  });
});
```

- [ ] **Step 7.2: Correr — debe fallar**

Run: `npx vitest run tests/deudores.test.js -t "showFlatInvoicesModal"`

Expected: FAIL.

- [ ] **Step 7.3: Implementar `showFlatInvoicesModal`**

Agregar a `Deudores`:

```javascript
  showFlatInvoicesModal(searchText) {
    const matches = Deudores._filter(Deudores._unpaidEntregas, searchText)
      .sort((a, b) => (a.fecha_hora || '').localeCompare(b.fecha_hora || ''));
    const totalSaldo = matches.reduce((s, e) => s + e.saldo, 0);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

    const body = matches.length === 0
      ? '<p class="text-sm text-muted">Sin facturas pendientes para esta búsqueda</p>'
      : matches.map(e => {
          const lineas = (e.entrega_lineas || []).map(l =>
            `${esc(l.tipos_alfajor?.nombre || '?')}: ${l.cantidad}`
          ).join(', ');
          return `
            <div class="deudor-entrega">
              <div class="deudor-entrega-header">
                <span class="text-sm"><strong>${esc(e.nombre)}</strong> · ${fmtDateTime(e.fecha_hora)}</span>
                <span class="text-red" style="font-weight:600">${fmtMoney(e.saldo)}</span>
              </div>
              <div class="deudor-entrega-detail">${lineas || ''}</div>
              <div class="deudor-entrega-detail">Total: ${fmtMoney(e.monto_total)} · Pagado: ${fmtMoney(e.pagado)}</div>
              <div id="flat-pago-slot-${e.id}" style="margin-top:8px">
                <button class="btn btn-secondary btn-block" style="min-height:36px;font-size:0.8rem"
                        onclick="this.parentElement.innerHTML = Pagos.renderFormInline('${e.id}', ${e.saldo})">
                  Registrar pago
                </button>
              </div>
            </div>
          `;
        }).join('');

    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Facturas pendientes${searchText ? ' · "' + esc(searchText) + '"' : ''}</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="flex-between mb-16">
          <span class="text-sm text-muted">${matches.length} factura${matches.length === 1 ? '' : 's'}</span>
          <span class="text-red" style="font-weight:700">${fmtMoney(totalSaldo)}</span>
        </div>
        ${body}
      </div>
    `;
    document.body.appendChild(overlay);
  },
```

- [ ] **Step 7.4: Correr — deben pasar**

Run: `npx vitest run tests/deudores.test.js -t "showFlatInvoicesModal"`

Expected: PASS (4 tests).

- [ ] **Step 7.5: Correr toda la suite**

Run: `npm test`

Expected: PASS (todos los existentes + nuevos de Deudores).

- [ ] **Step 7.6: Commit**

```bash
git add js/deudores.js tests/deudores.test.js
git commit -m "feat(deudores): showFlatInvoicesModal for multi-punto invoice list"
```

---

## Tarea 8: Extraer `Puntos.renderFilterCombobox` (con regression tests)

Helper reutilizable para Historial. **Crítico no romper alta de entregas** (que usa `Puntos.renderSelector`).

**Files:**
- Modify: `js/puntos.js`
- Test: `tests/integration.test.js`

- [ ] **Step 8.1: Agregar tests de regresión + nuevo combobox a `tests/integration.test.js`**

Agregar al final del archivo:

```javascript
// ─── Puntos module — regression for renderSelector + new renderFilterCombobox ───

loadScript('js/puntos.js');

describe('Puntos.renderSelector — regression after extracting helper', () => {
  beforeEach(() => {
    Puntos.cache = [
      { id: 'p1', nombre: 'Don Pedro', direccion: 'Calle 1', creado_por: 'test-user-id' },
      { id: 'p2', nombre: 'Benedetti Norte', direccion: 'Calle 2', creado_por: 'test-user-id' }
    ];
  });

  it('still produces input + hidden + dropdown structure', () => {
    const html = Puntos.renderSelector();
    expect(html).toContain('id="ent-punto-search"');
    expect(html).toContain('id="ent-punto"');
    expect(html).toContain('id="punto-dropdown"');
  });

  it('preselects nombre when selectedId provided', () => {
    const html = Puntos.renderSelector('p1');
    expect(html).toContain('value="Don Pedro"');
  });
});

describe('Puntos.renderFilterCombobox — new helper', () => {
  beforeEach(() => {
    Puntos.cache = [
      { id: 'p1', nombre: 'Don Pedro', direccion: '', creado_por: 'test-user-id' },
      { id: 'p2', nombre: 'Benedetti Norte', direccion: '', creado_por: 'test-user-id' },
      { id: 'p3', nombre: 'Benedetti Sur', direccion: '', creado_por: 'test-user-id' }
    ];
  });

  it('returns HTML with the given inputId, hiddenId, dropdownId', () => {
    const html = Puntos.renderFilterCombobox({
      inputId: 'hist-punto-search',
      hiddenId: 'hist-punto-id',
      dropdownId: 'hist-punto-dd',
      includeAll: true
    });
    expect(html).toContain('id="hist-punto-search"');
    expect(html).toContain('id="hist-punto-id"');
    expect(html).toContain('id="hist-punto-dd"');
  });

  it('honors includeAll flag (default true)', () => {
    const html = Puntos.renderFilterCombobox({
      inputId: 'a', hiddenId: 'b', dropdownId: 'c'
    });
    // The "Todos los puntos" option is rendered when dropdown opens — verify
    // the placeholder string is set.
    expect(html).toContain('Todos los puntos');
  });

  it('excludes "Todos" option when includeAll=false', () => {
    const html = Puntos.renderFilterCombobox({
      inputId: 'a', hiddenId: 'b', dropdownId: 'c', includeAll: false
    });
    expect(html).not.toContain('Todos los puntos');
  });
});
```

- [ ] **Step 8.2: Correr — deben fallar (renderFilterCombobox no existe)**

Run: `npx vitest run tests/integration.test.js -t "renderFilterCombobox"`

Expected: FAIL.

- [ ] **Step 8.3: Implementar `Puntos.renderFilterCombobox` en `js/puntos.js`**

Agregar al objeto `Puntos` (sin tocar `renderSelector`):

```javascript
  /** Reusable combobox for FILTERING (not entry creation). Different from renderSelector. */
  renderFilterCombobox(opts) {
    const { inputId, hiddenId, dropdownId, includeAll = true } = opts;
    const placeholder = includeAll ? 'Todos los puntos' : 'Buscar punto...';
    return `
      <div class="punto-selector" id="${inputId}-wrap" data-include-all="${includeAll}">
        <input class="form-input" id="${inputId}" type="text"
               placeholder="${placeholder}" autocomplete="off"
               onfocus="Puntos._openFilterDropdown('${inputId}', '${hiddenId}', '${dropdownId}')"
               oninput="Puntos._onFilterInput('${inputId}', '${hiddenId}', '${dropdownId}')">
        <input type="hidden" id="${hiddenId}" value="">
        <div class="punto-dropdown hidden" id="${dropdownId}"></div>
      </div>
    `;
  },

  _openFilterDropdown(inputId, hiddenId, dropdownId) {
    const dd = document.getElementById(dropdownId);
    if (!dd) return;
    dd.classList.remove('hidden');
    Puntos._renderFilterOptions(inputId, hiddenId, dropdownId);
    setTimeout(() => {
      const handler = (e) => {
        const wrap = document.getElementById(inputId + '-wrap');
        if (wrap && !wrap.contains(e.target)) {
          dd.classList.add('hidden');
          document.removeEventListener('click', handler);
        }
      };
      document.removeEventListener('click', Puntos._closeFilterHandler);
      Puntos._closeFilterHandler = handler;
      document.addEventListener('click', handler);
    }, 0);
  },

  _onFilterInput(inputId, hiddenId, dropdownId) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    // Clear the hidden id when user is typing free text (multi-punto mode)
    if (hidden) hidden.value = '';
    Puntos._renderFilterOptions(inputId, hiddenId, dropdownId);
    // Notify owner via custom event so it can pick up filters.puntoSearchText
    input.dispatchEvent(new CustomEvent('punto-text-change', {
      bubbles: true, detail: { text: input.value }
    }));
  },

  _renderFilterOptions(inputId, hiddenId, dropdownId) {
    const input = document.getElementById(inputId);
    const dd = document.getElementById(dropdownId);
    const wrap = document.getElementById(inputId + '-wrap');
    if (!input || !dd || !wrap) return;
    const includeAll = wrap.dataset.includeAll === 'true';

    const q = (input.value || '').toLowerCase();
    const matches = Puntos.cache.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.direccion || '').toLowerCase().includes(q)
    );

    const allOpt = includeAll ? `
      <div class="punto-option" onclick="Puntos._selectFilterOption('${inputId}', '${hiddenId}', '${dropdownId}', '', '')">
        <div class="punto-option-name">Todos los puntos</div>
      </div>
    ` : '';

    dd.innerHTML = allOpt + matches.map(p => `
      <div class="punto-option" onclick="Puntos._selectFilterOption('${inputId}', '${hiddenId}', '${dropdownId}', '${p.id}', '${escJs(p.nombre)}')">
        <div class="punto-option-name">${esc(p.nombre)}</div>
        ${p.direccion ? `<div class="punto-option-detail">${esc(p.direccion)}</div>` : ''}
      </div>
    `).join('');
  },

  _selectFilterOption(inputId, hiddenId, dropdownId, puntoId, puntoNombre) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const dd = document.getElementById(dropdownId);
    if (input) input.value = puntoNombre;
    if (hidden) hidden.value = puntoId;
    if (dd) dd.classList.add('hidden');
    if (Puntos._closeFilterHandler) document.removeEventListener('click', Puntos._closeFilterHandler);
    input.dispatchEvent(new CustomEvent('punto-select', {
      bubbles: true, detail: { puntoId, puntoNombre }
    }));
  },
```

- [ ] **Step 8.4: Correr regression + nuevos tests — deben pasar**

Run: `npx vitest run tests/integration.test.js -t "Puntos"`

Expected: PASS (renderSelector regression + 3 renderFilterCombobox tests).

- [ ] **Step 8.5: Smoke manual del alta de entregas**

Servir, ir a `/#/entrega`, verificar que el selector de punto sigue funcionando: tipear, abrir dropdown, seleccionar, "+ Nuevo punto". Si algo se rompió, revertir y debuggear antes de seguir.

- [ ] **Step 8.6: Commit**

```bash
git add js/puntos.js tests/integration.test.js
git commit -m "feat(puntos): add renderFilterCombobox helper for filter use cases"
```

---

## Tarea 9: `Historial._resolvePuntoIds` y multi-punto en fetchEntregas

Función pura para resolver text → ids matchantes. Modificar `fetchEntregas` para usar `.in()` en modo multi-punto.

**Files:**
- Modify: `js/historial.js`
- Test: `tests/integration.test.js`

- [ ] **Step 9.1: Agregar tests para `_resolvePuntoIds`**

Agregar a `tests/integration.test.js`:

```javascript
loadScript('js/historial.js');

describe('Historial._resolvePuntoIds — substring resolver', () => {
  const cache = [
    { id: 'p1', nombre: 'Don Pedro' },
    { id: 'p2', nombre: 'Benedetti Norte' },
    { id: 'p3', nombre: 'Benedetti Sur' }
  ];

  it('returns null for empty text (signals "no filter")', () => {
    expect(Historial._resolvePuntoIds('', cache)).toBeNull();
  });

  it('returns matching ids for "benedetti"', () => {
    const ids = Historial._resolvePuntoIds('benedetti', cache);
    expect(ids).toHaveLength(2);
    expect(ids.sort()).toEqual(['p2', 'p3']);
  });

  it('matches case-insensitive', () => {
    const ids = Historial._resolvePuntoIds('BENEDETTI', cache);
    expect(ids).toHaveLength(2);
  });

  it('returns empty array for no match', () => {
    expect(Historial._resolvePuntoIds('xyz', cache)).toEqual([]);
  });
});
```

- [ ] **Step 9.2: Correr — debe fallar**

Run: `npx vitest run tests/integration.test.js -t "_resolvePuntoIds"`

Expected: FAIL.

- [ ] **Step 9.3: Agregar `puntoSearchText` a filters y `_resolvePuntoIds` a `Historial`**

Modificar `js/historial.js:2`:

```javascript
  filters: { periodo: 'semana', puntoId: '', puntoSearchText: '', repartidorId: '' },
```

Agregar al final del namespace `Historial` (antes del `}`):

```javascript
  _resolvePuntoIds(text, cache) {
    if (!text) return null;
    const q = text.toLowerCase();
    return (cache || []).filter(p => (p.nombre || '').toLowerCase().includes(q)).map(p => p.id);
  },
```

- [ ] **Step 9.4: Correr — debe pasar**

Run: `npx vitest run tests/integration.test.js -t "_resolvePuntoIds"`

Expected: PASS (4 tests).

- [ ] **Step 9.5: Modificar `fetchEntregas` para soportar multi-punto**

En `js/historial.js`, dentro de `fetchEntregas`, reemplazar el bloque de filtro por punto (líneas aprox. 95–97):

```javascript
    if (Historial.filters.puntoId) {
      query = query.eq('punto_entrega_id', Historial.filters.puntoId);
    } else if (Historial.filters.puntoSearchText) {
      const ids = Historial._resolvePuntoIds(Historial.filters.puntoSearchText, Puntos.cache);
      if (ids && ids.length === 0) {
        // No matching puntos — render empty without query
        listEl.innerHTML = '<div class="empty-state"><p>Sin matches para esa búsqueda</p></div>';
        Historial._data = [];
        Historial._renderClientHeader();
        return;
      }
      if (ids && ids.length > 0) {
        query = query.in('punto_entrega_id', ids);
      }
    }
```

(Nota: `_renderClientHeader` se implementa en Task 10. Por ahora dejar la llamada — si no existe, la función es undefined pero no crashea con `?.()` — usar:)

```javascript
        Historial._renderClientHeader && Historial._renderClientHeader();
```

- [ ] **Step 9.6: Correr toda la suite — todo sigue pasando**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9.7: Commit**

```bash
git add js/historial.js tests/integration.test.js
git commit -m "feat(historial): _resolvePuntoIds and multi-punto query support"
```

---

## Tarea 10: `Historial._aggregateClientHeader` y `_renderClientHeader`

Cálculos de vendido/cobrado/saldo + render del mini-card. Usa `_data` ya cargado.

**Files:**
- Modify: `js/historial.js`
- Test: `tests/integration.test.js`

- [ ] **Step 10.1: Tests para `_aggregateClientHeader`**

```javascript
describe('Historial._aggregateClientHeader — pure aggregation', () => {
  it('sums vendido and cobrado from entregas list', () => {
    const entregas = [
      { id: 'e1', monto_total: 1000, monto_pagado: 600, punto_entrega_id: 'p1' },
      { id: 'e2', monto_total: 500, monto_pagado: 500, punto_entrega_id: 'p1' }
    ];
    const r = Historial._aggregateClientHeader(entregas);
    expect(r.vendido).toBe(1500);
    expect(r.cobrado).toBe(1100);
    expect(r.saldo).toBe(400);
  });

  it('counts distinct puntos', () => {
    const entregas = [
      { id: 'e1', monto_total: 100, monto_pagado: 0, punto_entrega_id: 'p1' },
      { id: 'e2', monto_total: 100, monto_pagado: 0, punto_entrega_id: 'p2' },
      { id: 'e3', monto_total: 100, monto_pagado: 0, punto_entrega_id: 'p1' }
    ];
    const r = Historial._aggregateClientHeader(entregas);
    expect(r.puntosCount).toBe(2);
  });

  it('returns zeros for empty entregas', () => {
    const r = Historial._aggregateClientHeader([]);
    expect(r).toMatchObject({ vendido: 0, cobrado: 0, saldo: 0, puntosCount: 0 });
  });
});
```

- [ ] **Step 10.2: Correr — debe fallar**

Run: `npx vitest run tests/integration.test.js -t "_aggregateClientHeader"`

Expected: FAIL.

- [ ] **Step 10.3: Implementar `_aggregateClientHeader` y `_renderClientHeader`**

Agregar a `Historial`:

```javascript
  _aggregateClientHeader(entregas) {
    const puntos = new Set();
    let vendido = 0, cobrado = 0;
    (entregas || []).forEach(e => {
      vendido += Number(e.monto_total) || 0;
      cobrado += Number(e.monto_pagado) || 0;
      if (e.punto_entrega_id) puntos.add(e.punto_entrega_id);
    });
    return { vendido, cobrado, saldo: vendido - cobrado, puntosCount: puntos.size };
  },

  _renderClientHeader() {
    const headerEl = document.getElementById('hist-client-header');
    if (!headerEl) return;

    const hasFilter = Historial.filters.puntoId || Historial.filters.puntoSearchText;
    if (!hasFilter || !Historial._data || Historial._data.length === 0) {
      headerEl.innerHTML = '';
      return;
    }

    const agg = Historial._aggregateClientHeader(Historial._data);
    let title;
    if (Historial.filters.puntoId) {
      const p = Puntos.cache.find(x => x.id === Historial.filters.puntoId);
      title = p ? esc(p.nombre) : 'Cliente';
    } else {
      title = `"${esc(Historial.filters.puntoSearchText)}"`;
      if (agg.puntosCount > 1) title += ` <span class="text-sm text-muted">(${agg.puntosCount} puntos)</span>`;
    }

    const saldoColor = agg.saldo > 0 ? 'text-red' : 'text-green';
    const action = Historial.filters.puntoId
      ? (agg.saldo > 0 ? `<button class="btn btn-secondary btn-block mt-8" onclick="Pagos.showDeudorModal('${Historial.filters.puntoId}', '${escJs(title)}')">Ver cuenta corriente</button>` : '')
      : (agg.saldo > 0 ? `<button class="btn btn-secondary btn-block mt-8" onclick="Deudores.showFlatInvoicesModal('${escJs(Historial.filters.puntoSearchText)}')">Ver todas las facturas pendientes</button>` : '');

    headerEl.innerHTML = `
      <div class="metric-card" style="margin-bottom:8px">
        <div class="metric-label">${title}</div>
        <div class="text-sm">Vendido: ${fmtMoney(agg.vendido)} · Cobrado: ${fmtMoney(agg.cobrado)}</div>
        <div class="metric-value ${saldoColor}">Saldo: ${fmtMoney(agg.saldo)}</div>
        ${action}
      </div>
    `;
  },
```

- [ ] **Step 10.4: Llamar a `_renderClientHeader` desde `fetchEntregas` después de setear `_data`**

En `js/historial.js`, dentro de `fetchEntregas`, después de la línea `Historial._data = data;` (cerca del final del try), agregar:

```javascript
    Historial._renderClientHeader();
```

- [ ] **Step 10.5: Asegurar que el contenedor `#hist-client-header` existe en el HTML del `render()`**

En `Historial.render()`, agregar `<div id="hist-client-header"></div>` justo antes de `<div id="hist-list">`:

```javascript
      <div id="hist-client-header"></div>
      <div id="hist-list"><div class="spinner mt-8"></div></div>
```

- [ ] **Step 10.6: Correr toda la suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 10.7: Commit**

```bash
git add js/historial.js tests/integration.test.js
git commit -m "feat(historial): client aggregate header (single & multi-punto modes)"
```

---

## Tarea 11: Reemplazar `<select>` de punto por combobox en Historial

Conectar el combobox nuevo a `Historial.filters.puntoId`/`puntoSearchText` vía custom events.

**Files:**
- Modify: `js/historial.js`

- [ ] **Step 11.1: Reemplazar el `<select id="hist-punto">` por el combobox en `Historial.render()`**

Cambiar las líneas 16-25 (`#hist-filters` div):

```javascript
      <div id="hist-filters" class="mb-8" style="display:grid;grid-template-columns:1fr ${Auth.isAdmin() ? '1fr' : ''};gap:8px">
        ${Puntos.renderFilterCombobox({
          inputId: 'hist-punto-search',
          hiddenId: 'hist-punto-id',
          dropdownId: 'hist-punto-dropdown',
          includeAll: true
        })}
        ${Auth.isAdmin() ? `
        <select class="form-select" id="hist-repartidor" onchange="Historial.onFilterChange()" style="min-height:40px;font-size:0.85rem">
          <option value="">Todos</option>
        </select>
        ` : ''}
      </div>
```

- [ ] **Step 11.2: Reemplazar la lógica de carga del select en `loadData()` por la suscripción a eventos del combobox**

En `js/historial.js`, reemplazar el bloque de líneas 32-36 (el que rellena `puntoSel`) por:

```javascript
    // Wire combobox events to Historial.filters
    const searchInput = document.getElementById('hist-punto-search');
    if (searchInput && !searchInput.dataset.wired) {
      searchInput.dataset.wired = '1';
      searchInput.addEventListener('punto-select', (ev) => {
        Historial.filters.puntoId = ev.detail.puntoId || '';
        Historial.filters.puntoSearchText = '';
        Historial.fetchEntregas();
      });
      searchInput.addEventListener('punto-text-change', (ev) => {
        Historial.filters.puntoSearchText = ev.detail.text || '';
        Historial.filters.puntoId = '';
        Historial.fetchEntregas();
      });
    }
```

- [ ] **Step 11.3: Borrar la función `onFilterChange` references ya obsoletas para punto**

`onFilterChange` sigue usándose para repartidor. Verificar que sigue funcional. La línea aprox. 65 que lee `hist-punto`:

```javascript
  onFilterChange() {
    Historial.filters.puntoId = document.getElementById('hist-punto')?.value || '';
    const repEl = document.getElementById('hist-repartidor');
    Historial.filters.repartidorId = repEl ? repEl.value : '';
    Historial.fetchEntregas();
  },
```

Reemplazar por (saca la lectura de `hist-punto` que ya no existe):

```javascript
  onFilterChange() {
    const repEl = document.getElementById('hist-repartidor');
    Historial.filters.repartidorId = repEl ? repEl.value : '';
    Historial.fetchEntregas();
  },
```

- [ ] **Step 11.4: Correr toda la suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 11.5: Smoke manual de Historial**

- Abrir `/#/historial`.
- Tipear "benedetti" en el combobox SIN seleccionar → la lista debería filtrar y mostrar entregas de TODOS los puntos Benedetti, header de cliente con "(N puntos)", botón "Ver todas las facturas pendientes".
- Click en el botón → abre el modal flat con las facturas, cada una con botón pago.
- Tipear y luego seleccionar un punto del dropdown → modo single-punto, header sin "(N puntos)", botón "Ver cuenta corriente" (si saldo > 0).
- Seleccionar "Todos los puntos" → vuelve a sin filtro.

- [ ] **Step 11.6: Commit**

```bash
git add js/historial.js
git commit -m "feat(historial): replace select with combobox supporting multi-punto search"
```

---

## Tarea 12: Pagos refresh hooks para `/deudores`

Tres lugares donde hay que agregar el hook (`confirmar`, `pagarTodo`, `deletePago`).

**Files:**
- Modify: `js/pagos.js`

- [ ] **Step 12.1: Modificar `Pagos.confirmar` (alrededor de línea 97-99)**

Buscar el bloque:

```javascript
      if (App.currentRoute === '/historial') Historial.fetchEntregas();
      else if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
```

Reemplazar por:

```javascript
      if (App.currentRoute === '/historial') Historial.fetchEntregas();
      else if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/deudores') Deudores.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
```

- [ ] **Step 12.2: Modificar `Pagos.pagarTodo` (alrededor de línea 273-275)**

Buscar:

```javascript
      if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
```

Reemplazar por:

```javascript
      if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/deudores') Deudores.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
```

- [ ] **Step 12.3: Modificar `Pagos.deletePago` (alrededor de línea 234-236)**

Buscar:

```javascript
      if (App.currentRoute === '/historial') Historial.fetchEntregas();
      else if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
```

Reemplazar por:

```javascript
      if (App.currentRoute === '/historial') Historial.fetchEntregas();
      else if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/deudores') Deudores.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
```

- [ ] **Step 12.4: Correr toda la suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 12.5: Smoke manual**

Estando en `/#/deudores`, abrir un cliente, registrar un pago → la lista de deudores se refresca (si saldó la deuda, debería desaparecer).

- [ ] **Step 12.6: Commit**

```bash
git add js/pagos.js
git commit -m "feat(pagos): refresh /deudores after pago confirm/pagarTodo/delete"
```

---

## Tarea 13: Bump del Service Worker

**Files:**
- Modify: `sw.js`

- [ ] **Step 13.1: Modificar `sw.js`**

Cambiar línea 1:

```javascript
const CACHE_NAME = 'alfajores-v23';
```

Agregar `'./js/deudores.js'` al array `STATIC_ASSETS` (después de `historial.js`):

```javascript
  './js/historial.js',
  './js/deudores.js',
  './js/analisis.js',
```

- [ ] **Step 13.2: Smoke**

Servir, abrir DevTools → Application → Service Workers, verificar que actualiza al refrescar. La nueva tab funciona offline (probar).

- [ ] **Step 13.3: Commit**

```bash
git add sw.js
git commit -m "chore: bump SW to v23 (deudores.js added to cache)"
```

---

## Tarea 14: Smoke test manual end-to-end + ajuste de bottom-nav si hace falta

Solo manual, no automatizable. Recorrer todos los flujos en mobile (DevTools mobile mode) y celular real si está disponible.

**Files:** ninguno por default. Si la nav queda apretada, modificar `css/styles.css` (sección `.nav-btn`) y/o el label en `index.html`.

- [ ] **Step 14.1: Verificar layout de bottom-nav en mobile ≤360px**

DevTools → Toggle device toolbar → Galaxy S8 (360×740) o similar. Si las 6 tabs se ven apretadas/los labels se cortan:

- Opción A: reducir `.nav-btn` padding de `8px 12px` a `8px 6px` en `css/styles.css:470`.
- Opción B: cambiar label `Deudores` por `Deudas` en `index.html`.

Aplicar la mínima necesaria. Si todo se ve bien, no tocar nada.

- [ ] **Step 14.2: Recorrer los 3 flujos de la queja de Emi**

1. **Vista Deudores ataca "se entierran las viejas":** `/#/deudores` → orden por "Antigüedad" → las más viejas arriba. Buscar "benedetti" → header agregado + botón flat.
2. **Buscador en historial:** `/#/historial` → tipear "benedetti" sin seleccionar → entregas de N puntos Benedetti listadas, header con "(N puntos)" y botón "Ver todas las facturas pendientes".
3. **Agrupación Benedetti:** desde el botón de cualquiera de las dos vistas → modal flat con todas las facturas, cargar pago a una factura sin cerrar el modal, verificar que el pago se registra y la fila se actualiza al cerrar/reabrir.

Anotar cualquier issue. Si crítico, abrir task adicional. Si menor, anotar para iteración futura.

- [ ] **Step 14.3: Verificar regresiones críticas**

- Alta de entrega (`/#/entrega`): selector de punto sigue funcionando, "+ Nuevo punto" sigue disponible, guardar entrega OK.
- Dashboard: top-5 deudores se muestra como antes.
- Análisis (admin): sección Deudores sigue mostrando datos.
- Portal cliente: si hay un token a mano, abrir y verificar.

- [ ] **Step 14.4: Si hay cambios de Step 14.1, commitear**

```bash
git add css/styles.css index.html
git commit -m "chore: tighten bottom-nav padding for 6-tab layout"
```

- [ ] **Step 14.5: Avisar a Emi para que pruebe en su celular real**

Mensaje sugerido: "Emi, subí los cambios. Probá: (1) la nueva tab Deudores con orden por Antigüedad, (2) tipear 'Benedetti' en el buscador del Historial, (3) tocar 'Ver todas las facturas pendientes' y cargar pagos uno por uno. Cualquier cosa que veas mal, contame."

---

## Self-review

(Ejecutado al cerrar el plan — checklist mental, no requiere acción si todo OK.)

**Spec coverage:**
- Vista `/deudores` sin cap → Tasks 1, 5, 6 ✓
- Buscador por texto en `/deudores` → Tasks 3, 6 ✓
- Tres órdenes (saldo / antigüedad / alfabético) → Tasks 4, 5 ✓
- Agregados arriba (count + total saldo + botón flat) → Task 6 ✓
- Modal flat con facturas + pago inline → Task 7 ✓
- Combobox reutilizable en Historial → Task 8 ✓
- Multi-punto search en Historial → Task 9 ✓
- Header de cliente en Historial (single/multi) → Task 10 ✓
- Reemplazo de `<select>` por combobox → Task 11 ✓
- Refresh hooks → Task 12 ✓
- SW bump → Task 13 ✓
- Tests para todo lo testeable → Tasks 2-10 ✓
- Tests de regresión `Puntos.renderSelector` → Task 8 ✓
- Smoke manual → Task 14 ✓

**Type/method consistency:**
- `_aggregate` devuelve `{ porPunto, unpaidEntregas }` (Task 2). Consumido por `renderList` (Task 6) y por `loadData` (Task 5). ✓
- `_filter`/`_sort` operan sobre arrays con `nombre`. ✓
- `Puntos.renderFilterCombobox(opts)` interfaz definida en Task 8 y usada en Task 11. ✓
- `Historial._resolvePuntoIds(text, cache)` definida en Task 9, usada en Task 9 (fetchEntregas). ✓
- `showFlatInvoicesModal(searchText)` definida en Task 7, invocada desde Task 6 (renderList) y Task 10 (header de historial). ✓
- Eventos custom `punto-select` y `punto-text-change` definidos en Task 8 y consumidos en Task 11. ✓

**Placeholders:** ninguno. Todo el código está completo. Los smoke tests están descritos pero son manuales por naturaleza.

**Pregunta abierta del spec:** rol de Emi confirmado por Juan en sesión (admin / cliente externo) → resuelta antes de escribir el plan, no afecta tareas.
