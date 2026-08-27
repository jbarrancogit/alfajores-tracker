/**
 * Pagos.showDeudorModal — the debt has to be reachable, not just visible.
 *
 * There are two records of how much an entrega was paid: the pagos table, and
 * the denormalised entregas.monto_pagado column kept in sync by a trigger. They
 * can drift — a failed edit leaves monto_pagado set with no pago rows behind it.
 *
 * Deudores computes the balance from pagos, so a drifted entrega shows up in the
 * list as debt. The modal used to filter on monto_pagado, so it dropped that same
 * entrega and reported "Sin deudas pendientes" without opening. The client could
 * see the debt on the list and could not open, pay or clear it — for months, on
 * the Carnes nano entrega of 2026-04-30.
 *
 * Both sides now read the pagos table.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(__dirname, '..');

function loadScript(relativePath) {
  vm.runInThisContext(readFileSync(resolve(ROOT, relativePath), 'utf-8'), { filename: relativePath });
}

loadScript('js/supabase.js');
loadScript('js/pagos.js');

const PUNTO = 'punto-carnes-nano';

let ENTREGAS = [];
let PAGOS = [];

function chain(getRows) {
  const state = { from: 0, to: null, filters: [] };
  const c = {
    select: () => c,
    eq: (f, v) => { state.filters.push([f, v]); return c; },
    in: (f, v) => { state.filters.push([f, v]); return c; },
    order: () => c,
    limit: () => c,
    range: (a, b) => { state.from = a; state.to = b; return c; },
    then: (ok, err) => {
      let rows = getRows();
      for (const [field, value] of state.filters) {
        rows = Array.isArray(value)
          ? rows.filter(r => value.includes(r[field]))
          : rows.filter(r => r[field] === value);
      }
      const to = state.to == null ? state.from + 999 : state.to;
      return Promise.resolve({ data: rows.slice(state.from, to + 1), error: null }).then(ok, err);
    },
  };
  return c;
}

beforeEach(() => {
  // One entrega whose monto_pagado says "paid in full" while no pago backs it,
  // plus a genuinely settled one so the punto is not trivially all-debt.
  ENTREGAS = [
    {
      id: 'e-fantasma', punto_entrega_id: PUNTO, fecha_hora: '2026-04-30T15:52:00Z',
      monto_total: 18000, monto_pagado: 18000, cantidad: 0, entrega_lineas: [],
    },
    {
      id: 'e-normal', punto_entrega_id: PUNTO, fecha_hora: '2026-05-21T15:09:00Z',
      monto_total: 13500, monto_pagado: 13500, cantidad: 10, entrega_lineas: [],
    },
  ];
  PAGOS = [{ entrega_id: 'e-normal', monto: 13500 }];

  document.body.innerHTML = '<div id="app"></div>';
  vi.clearAllMocks();

  db.from.mockImplementation((table) => {
    if (table === 'entregas') return chain(() => ENTREGAS);
    if (table === 'pagos') return chain(() => PAGOS);
    return chain(() => []);
  });
});

describe('Pagos.showDeudorModal — balance comes from the pagos table', () => {
  it('opens for an entrega whose monto_pagado drifted out of sync', async () => {
    await Pagos.showDeudorModal(PUNTO, 'Carnes nano');

    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.innerHTML).toContain('Carnes nano');
  });

  it('counts the drifted entrega as the only pending one', async () => {
    await Pagos.showDeudorModal(PUNTO, 'Carnes nano');

    const overlay = document.querySelector('.modal-overlay');
    expect(overlay.innerHTML).toContain('1 entregas pendientes');
    expect(overlay.innerHTML).toContain('$18.000');
  });

  it('offers a payment form for the drifted entrega', async () => {
    await Pagos.showDeudorModal(PUNTO, 'Carnes nano');

    const overlay = document.querySelector('.modal-overlay');
    expect(overlay.innerHTML).toContain('pago-slot-e-fantasma');
    expect(overlay.innerHTML).toContain('Registrar pago');
  });

  it('still reports no debt when every entrega really is settled', async () => {
    PAGOS = [
      { entrega_id: 'e-fantasma', monto: 18000 },
      { entrega_id: 'e-normal', monto: 13500 },
    ];

    await Pagos.showDeudorModal(PUNTO, 'Carnes nano');

    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});

describe('Pagos.pagarTodo — settles what the pagos table says is owed', () => {
  it('registers a payment for the drifted entrega', async () => {
    const registrar = vi.spyOn(Pagos, 'registrar').mockResolvedValue(undefined);
    document.body.innerHTML =
      '<div id="app"></div><input type="hidden" id="pago-todo-forma" value="efectivo">';
    const btn = document.createElement('button');

    await Pagos.pagarTodo(PUNTO, btn);

    expect(registrar).toHaveBeenCalledWith('e-fantasma', 18000, 'efectivo');
    expect(registrar).not.toHaveBeenCalledWith('e-normal', expect.anything(), expect.anything());
  });
});
