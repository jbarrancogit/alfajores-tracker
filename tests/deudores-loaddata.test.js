/**
 * Deudores.loadData — regression tests for the PostgREST row cap.
 *
 * Supabase caps every REST response at db-max-rows (1000 by default) and
 * reports the truncation only in the Content-Range header, which supabase-js
 * does not surface. A query with no .range() therefore returns the first 1000
 * rows silently. With 2333 entregas in production the Deudores view was
 * aggregating only the oldest 1000, so every recent unpaid sale was invisible.
 *
 * The fake below reproduces that cap so the bug is testable.
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

loadScript('js/supabase.js');
loadScript('js/pagos.js');
loadScript('js/deudores.js');

const MAX_ROWS = 1000;
const TOTAL = 2333;

let ENTREGAS = [];
let PAGOS = [];
let entregasRequests = 0;

/** Build the dataset: one old debt, one brand-new debt, everything else paid. */
function seed() {
  ENTREGAS = [];
  PAGOS = [];
  for (let i = 0; i < TOTAL; i++) {
    const isOldDebt = i === 0;
    const isNewDebt = i === TOTAL - 1;
    const id = `e${i}`;
    const nombre = isOldDebt ? 'Kiosco Viejo' : isNewDebt ? 'Verduleria Lulu' : `Cliente ${i}`;
    ENTREGAS.push({
      id,
      punto_entrega_id: isOldDebt ? 'p-viejo' : isNewDebt ? 'p-lulu' : `p${i}`,
      fecha_hora: new Date(Date.UTC(2026, 3, 1) + i * 3600000).toISOString(),
      monto_total: isOldDebt ? 800 : isNewDebt ? 5000 : 1000,
      repartidor_id: 'test-user-id',
      puntos_entrega: { nombre },
      entrega_lineas: [],
    });
    if (!isOldDebt && !isNewDebt) PAGOS.push({ entrega_id: id, monto: 1000 });
  }
}

/** Applies PostgREST semantics: eq/in filters, then the max-rows cap. */
function resolveRows(rows, state) {
  let out = rows;
  for (const [field, value] of state.filters) {
    out = Array.isArray(value)
      ? out.filter(r => value.includes(r[field]))
      : out.filter(r => r[field] === value);
  }
  const from = state.from;
  const to = state.to == null ? from + MAX_ROWS - 1 : Math.min(state.to, from + MAX_ROWS - 1);
  return { data: out.slice(from, to + 1), error: null };
}

function makeChain(getRows, onRequest) {
  const state = { from: 0, to: null, filters: [] };
  const chain = {
    select: () => chain,
    eq: (f, v) => { state.filters.push([f, v]); return chain; },
    in: (f, v) => { state.filters.push([f, v]); return chain; },
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: (n) => { state.to = state.from + n - 1; return chain; },
    range: (a, b) => { state.from = a; state.to = b; return chain; },
    then: (ok, err) => {
      if (onRequest) onRequest();
      return Promise.resolve(resolveRows(getRows(), state)).then(ok, err);
    },
  };
  return chain;
}

beforeEach(() => {
  seed();
  entregasRequests = 0;
  document.body.innerHTML =
    '<div id="app"></div><div id="deud-header"></div><div id="deud-list"></div>';
  vi.clearAllMocks();
  Deudores._data = [];
  Deudores._unpaidEntregas = [];
  Deudores.filters = { orden: 'saldo', search: '', repartidorId: '' };

  db.from.mockImplementation((table) => {
    if (table === 'entregas') return makeChain(() => ENTREGAS, () => { entregasRequests++; });
    if (table === 'pagos') return makeChain(() => PAGOS);
    if (table === 'entrega_lineas') return makeChain(() => []);
    return makeChain(() => []);
  });
});

describe('Deudores.loadData — must not be silently truncated at 1000 rows', () => {
  it('sees a debt created after the 1000th entrega', async () => {
    await Deudores.loadData();

    const lulu = Deudores._data.find(d => d.nombre === 'Verduleria Lulu');
    expect(lulu).toBeDefined();
    expect(lulu.saldo).toBe(5000);
  });

  it('still sees the oldest debt (no date cutoff that hides old deudores)', async () => {
    await Deudores.loadData();

    const viejo = Deudores._data.find(d => d.nombre === 'Kiosco Viejo');
    expect(viejo).toBeDefined();
    expect(viejo.saldo).toBe(800);
  });

  it('aggregates exactly the two unpaid entregas out of 2333', async () => {
    await Deudores.loadData();

    expect(Deudores._data).toHaveLength(2);
    expect(Deudores._unpaidEntregas).toHaveLength(2);
  });

  it('pages through the table instead of issuing one capped request', async () => {
    await Deudores.loadData();

    expect(entregasRequests).toBeGreaterThan(1);
  });

  it('renders the recent debtor into the list', async () => {
    await Deudores.loadData();

    expect(document.getElementById('deud-list').innerHTML).toContain('Verduleria Lulu');
  });
});
