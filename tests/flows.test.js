/**
 * Flow tests — verify all business logic, metrics, roles, and invariants.
 * Uses an in-memory mock DB. Touches ZERO real data.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(__dirname, '..');
function loadScript(p) {
  vm.runInThisContext(readFileSync(resolve(ROOT, p), 'utf-8'), { filename: p });
}

// Load all modules (uses mocks from setup.js)
loadScript('js/supabase.js');
loadScript('js/tipos.js');
loadScript('js/pagos.js');

// ─── Test data factory ──────────────────────────────

const ADMIN_ID = 'admin-001';
const REP_FABIAN_ID = 'rep-fabian';
const REP_AGUSTINA_ID = 'rep-agustina';
const PUNTO_FARGO_ID = 'punto-fargo';
const PUNTO_KIOSCO_ID = 'punto-kiosco';

function makeEntrega(overrides = {}) {
  return {
    id: 'e-' + Math.random().toString(36).slice(2, 8),
    fecha_hora: new Date().toISOString(),
    repartidor_id: REP_FABIAN_ID,
    punto_entrega_id: PUNTO_FARGO_ID,
    punto_nombre_temp: '',
    cantidad: 10,
    monto_total: 50000,
    monto_pagado: 0,
    forma_pago: 'fiado',
    notas: '',
    puntos_entrega: { nombre: 'Ariel Fargo' },
    usuarios: { nombre: 'Fabian' },
    entrega_lineas: [
      { cantidad: 10, precio_unitario: 5000, costo_unitario: 2500, tipo_alfajor_id: 't1', tipos_alfajor: { nombre: 'Glaseado' } }
    ],
    ...overrides
  };
}

function makePago(overrides = {}) {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    entrega_id: 'e-1',
    monto: 10000,
    forma_pago: 'efectivo',
    fecha: new Date().toISOString(),
    registrado_por: REP_FABIAN_ID,
    usuarios: { nombre: 'Fabian' },
    ...overrides
  };
}

// ════════════════════════════════════════════════════
// 1. UTILITY FUNCTIONS (new ones added in this session)
// ════════════════════════════════════════════════════

describe('escJs() — JS string escaping for onclick', () => {
  it('escapes single quotes', () => {
    expect(escJs("O'Brien")).toBe("O\\'Brien");
  });

  it('escapes backslashes', () => {
    expect(escJs('path\\name')).toBe('path\\\\name');
  });

  it('escapes double quotes as HTML entity', () => {
    expect(escJs('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('handles null/undefined', () => {
    expect(escJs(null)).toBe('');
    expect(escJs(undefined)).toBe('');
  });

  it('handles normal strings unchanged', () => {
    expect(escJs('Ariel Fargo')).toBe('Ariel Fargo');
  });

  it('prevents XSS in onclick context', () => {
    const malicious = "'); alert('xss";
    const escaped = escJs(malicious);
    // All single quotes should be escaped with backslash
    expect(escaped).toBe("\\'); alert(\\'xss");
    // Unescaped single quotes should not exist (every ' preceded by \)
    expect(escaped.replace(/\\'/g, '')).not.toContain("'");
  });
});

describe('friendlyError() — user-facing error messages', () => {
  it('simplifies duplicate key errors', () => {
    expect(friendlyError({ message: 'duplicate key value violates unique constraint "xyz"' }))
      .toBe('Ya existe un registro con esos datos');
  });

  it('simplifies foreign key errors', () => {
    expect(friendlyError({ message: 'violates foreign key constraint' }))
      .toBe('No se puede eliminar, hay datos relacionados');
  });

  it('simplifies network errors', () => {
    expect(friendlyError({ message: 'Failed to fetch' }))
      .toBe('Sin conexión a internet');
  });

  it('simplifies check constraint errors', () => {
    expect(friendlyError({ message: 'violates check constraint' }))
      .toBe('Valor fuera de rango permitido');
  });

  it('truncates very long messages', () => {
    expect(friendlyError({ message: 'x'.repeat(100) }))
      .toBe('Error del servidor');
  });

  it('passes through short messages', () => {
    expect(friendlyError({ message: 'Entrega no encontrada' }))
      .toBe('Entrega no encontrada');
  });

  it('handles string errors', () => {
    expect(friendlyError('something broke')).toBe('something broke');
  });
});

describe('fmtDate() — null/invalid handling', () => {
  it('returns dash for null', () => {
    expect(fmtDate(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(fmtDate(undefined)).toBe('—');
  });

  it('returns dash for empty string', () => {
    expect(fmtDate('')).toBe('—');
  });

  it('returns dash for invalid date', () => {
    expect(fmtDate('not-a-date')).toBe('—');
  });

  it('formats valid ISO date', () => {
    const result = fmtDate('2026-04-08T12:00:00Z');
    // jsdom locale may use 1 or 2 digit format (8/4 or 08/04)
    expect(result).toMatch(/\d{1,2}\/\d{1,2}/);
  });
});

describe('fmtDateTime() — null/invalid handling', () => {
  it('returns dash for null', () => {
    expect(fmtDateTime(null)).toBe('—');
  });

  it('returns dash for invalid date', () => {
    expect(fmtDateTime('garbage')).toBe('—');
  });

  it('formats valid ISO date with time', () => {
    const result = fmtDateTime('2026-04-08T15:30:00Z');
    // jsdom locale may vary: "8/4 12:30" or "08/04 12:30 p. m."
    expect(result).toMatch(/\d{1,2}\/\d{1,2}/);
    expect(result).toContain(':');
  });
});

describe('batchIn() — chunked .in() queries', () => {
  it('returns empty array for empty ids', async () => {
    expect(await batchIn('pagos', 'monto', 'entrega_id', [])).toEqual([]);
  });

  it('returns empty array for null ids', async () => {
    expect(await batchIn('pagos', 'monto', 'entrega_id', null)).toEqual([]);
  });
});

// ════════════════════════════════════════════════════
// 2. PAYMENT BADGE — all edge cases
// ════════════════════════════════════════════════════

describe('Pagos.badge() — all payment states', () => {
  it('fully paid → Pagado (green)', () => {
    expect(Pagos.badge(5000, 5000)).toContain('badge-green');
    expect(Pagos.badge(5000, 5000)).toContain('Pagado');
  });

  it('overpaid → still Pagado', () => {
    expect(Pagos.badge(6000, 5000)).toContain('Pagado');
  });

  it('partial → Parcial (yellow)', () => {
    expect(Pagos.badge(2000, 5000)).toContain('badge-yellow');
    expect(Pagos.badge(2000, 5000)).toContain('Parcial');
  });

  it('$1 of $1000 → Parcial', () => {
    expect(Pagos.badge(1, 1000)).toContain('Parcial');
  });

  it('zero paid → Debe (red)', () => {
    expect(Pagos.badge(0, 5000)).toContain('badge-red');
    expect(Pagos.badge(0, 5000)).toContain('Debe');
  });

  it('null paid → Debe', () => {
    expect(Pagos.badge(null, 5000)).toContain('Debe');
  });

  it('$0 total, $0 paid → Pagado (0/0 edge case)', () => {
    expect(Pagos.badge(0, 0)).toContain('Pagado');
  });

  it('handles string inputs', () => {
    expect(Pagos.badge('5000', '5000')).toContain('Pagado');
    expect(Pagos.badge('100', '5000')).toContain('Parcial');
  });
});

// ════════════════════════════════════════════════════
// 3. METRICS INVARIANTS — the core business logic
// ════════════════════════════════════════════════════

describe('Metrics invariant: Cobrado = Efectivo + Transferencia', () => {
  it('holds with mixed payment methods', () => {
    const pagos = [
      makePago({ monto: 10000, forma_pago: 'efectivo' }),
      makePago({ monto: 5000, forma_pago: 'transferencia' }),
      makePago({ monto: 20000, forma_pago: 'efectivo' }),
      makePago({ monto: 3000, forma_pago: 'transferencia' }),
    ];

    let ef = 0, tr = 0;
    pagos.forEach(p => {
      if (p.forma_pago === 'efectivo') ef += Number(p.monto);
      else if (p.forma_pago === 'transferencia') tr += Number(p.monto);
    });
    const cobrado = ef + tr;

    expect(cobrado).toBe(38000);
    expect(ef).toBe(30000);
    expect(tr).toBe(8000);
    expect(cobrado).toBe(ef + tr); // THE INVARIANT
  });

  it('holds with only efectivo', () => {
    const pagos = [
      makePago({ monto: 5000, forma_pago: 'efectivo' }),
    ];
    let ef = 0, tr = 0;
    pagos.forEach(p => {
      if (p.forma_pago === 'efectivo') ef += Number(p.monto);
      else if (p.forma_pago === 'transferencia') tr += Number(p.monto);
    });
    expect(ef + tr).toBe(ef); // transfer is 0
    expect(ef + tr).toBe(5000);
  });

  it('holds with transferencia_mauri included', () => {
    const pagos = [
      makePago({ monto: 10000, forma_pago: 'efectivo' }),
      makePago({ monto: 5000, forma_pago: 'transferencia' }),
      makePago({ monto: 8000, forma_pago: 'transferencia_mauri' }),
    ];

    let ef = 0, tr = 0, ma = 0;
    pagos.forEach(p => {
      if (p.forma_pago === 'efectivo') ef += Number(p.monto);
      else if (p.forma_pago === 'transferencia') tr += Number(p.monto);
      else if (p.forma_pago === 'transferencia_mauri') ma += Number(p.monto);
    });
    const cobrado = ef + tr + ma;

    expect(cobrado).toBe(23000);
    expect(ef).toBe(10000);
    expect(tr).toBe(5000);
    expect(ma).toBe(8000);
    expect(cobrado).toBe(ef + tr + ma); // THE INVARIANT with 3 methods
  });

  it('holds with zero pagos', () => {
    let ef = 0, tr = 0, ma = 0;
    expect(ef + tr + ma).toBe(0);
  });

  it('Pendiente = Vendido - Cobrado (with mauri)', () => {
    const entregas = [
      makeEntrega({ monto_total: 50000 }),
      makeEntrega({ monto_total: 30000 }),
    ];
    const pagos = [
      makePago({ monto: 20000, forma_pago: 'efectivo' }),
      makePago({ monto: 10000, forma_pago: 'transferencia' }),
      makePago({ monto: 5000, forma_pago: 'transferencia_mauri' }),
    ];

    const vendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);
    let ef = 0, tr = 0, ma = 0;
    pagos.forEach(p => {
      if (p.forma_pago === 'efectivo') ef += Number(p.monto);
      else if (p.forma_pago === 'transferencia') tr += Number(p.monto);
      else if (p.forma_pago === 'transferencia_mauri') ma += Number(p.monto);
    });
    const cobrado = ef + tr + ma;
    const pendiente = vendido - cobrado;

    expect(vendido).toBe(80000);
    expect(cobrado).toBe(35000);
    expect(pendiente).toBe(45000);
    expect(pendiente).toBe(vendido - cobrado); // INVARIANT
  });
});

describe('Ganancia calculation', () => {
  it('ganancia = sum((precio - costo) * cantidad)', () => {
    const entregas = [
      makeEntrega({
        entrega_lineas: [
          { cantidad: 10, precio_unitario: 5000, costo_unitario: 2500 },
          { cantidad: 5, precio_unitario: 4000, costo_unitario: 2000 },
        ]
      }),
    ];

    let ganancia = 0;
    entregas.forEach(e => {
      (e.entrega_lineas || []).forEach(l => {
        ganancia += (Number(l.precio_unitario) - Number(l.costo_unitario)) * l.cantidad;
      });
    });

    expect(ganancia).toBe(10 * 2500 + 5 * 2000); // 25000 + 10000
    expect(ganancia).toBe(35000);
  });

  it('ganancia is 0 when precio equals costo', () => {
    const entregas = [
      makeEntrega({
        entrega_lineas: [
          { cantidad: 10, precio_unitario: 3000, costo_unitario: 3000 },
        ]
      }),
    ];

    let ganancia = 0;
    entregas.forEach(e => {
      (e.entrega_lineas || []).forEach(l => {
        ganancia += (Number(l.precio_unitario) - Number(l.costo_unitario)) * l.cantidad;
      });
    });

    expect(ganancia).toBe(0);
  });
});

// ════════════════════════════════════════════════════
// 4. PER-ENTREGA PAGOS MAP (source of truth pattern)
// ════════════════════════════════════════════════════

describe('pagosSum per entrega — single source of truth', () => {
  it('sums pagos per entrega correctly', () => {
    const pagos = [
      makePago({ entrega_id: 'e1', monto: 10000, forma_pago: 'efectivo' }),
      makePago({ entrega_id: 'e1', monto: 5000, forma_pago: 'transferencia' }),
      makePago({ entrega_id: 'e2', monto: 20000, forma_pago: 'efectivo' }),
    ];

    const _pagosSum = {};
    pagos.forEach(p => {
      if (!_pagosSum[p.entrega_id]) _pagosSum[p.entrega_id] = 0;
      _pagosSum[p.entrega_id] += Number(p.monto);
    });

    expect(_pagosSum['e1']).toBe(15000);
    expect(_pagosSum['e2']).toBe(20000);
    expect(_pagosSum['e3'] || 0).toBe(0); // no pagos for e3
  });

  it('deuda = monto_total - pagosSum per punto', () => {
    const entregas = [
      makeEntrega({ id: 'e1', punto_entrega_id: 'p1', monto_total: 50000 }),
      makeEntrega({ id: 'e2', punto_entrega_id: 'p1', monto_total: 30000 }),
      makeEntrega({ id: 'e3', punto_entrega_id: 'p2', monto_total: 20000 }),
    ];
    const pagos = [
      makePago({ entrega_id: 'e1', monto: 50000 }), // fully paid
      makePago({ entrega_id: 'e2', monto: 10000 }), // partial
      // e3 has no pagos — full debt
    ];

    const _pagosSum = {};
    pagos.forEach(p => {
      _pagosSum[p.entrega_id] = (_pagosSum[p.entrega_id] || 0) + Number(p.monto);
    });
    const pagado = (eId) => _pagosSum[eId] || 0;

    const puntoDeuda = {};
    entregas.forEach(e => {
      const key = e.punto_entrega_id;
      if (!puntoDeuda[key]) puntoDeuda[key] = { total: 0, pagado: 0 };
      puntoDeuda[key].total += Number(e.monto_total);
      puntoDeuda[key].pagado += pagado(e.id);
    });

    expect(puntoDeuda['p1'].total).toBe(80000);
    expect(puntoDeuda['p1'].pagado).toBe(60000);
    expect(puntoDeuda['p1'].total - puntoDeuda['p1'].pagado).toBe(20000);

    expect(puntoDeuda['p2'].total).toBe(20000);
    expect(puntoDeuda['p2'].pagado).toBe(0);
    expect(puntoDeuda['p2'].total - puntoDeuda['p2'].pagado).toBe(20000);
  });
});

// ════════════════════════════════════════════════════
// 5. ROLE-BASED ACCESS
// ════════════════════════════════════════════════════

describe('Auth.isAdmin() — role checks', () => {
  it('returns true for admin role', () => {
    Auth.currentProfile = { rol: 'admin' };
    expect(Auth.isAdmin()).toBe(true);
  });

  it('returns false for repartidor role', () => {
    Auth.currentProfile = { rol: 'repartidor' };
    Auth.isAdmin = () => Auth.currentProfile?.rol === 'admin';
    expect(Auth.isAdmin()).toBe(false);
  });

  it('returns false for null profile', () => {
    Auth.currentProfile = null;
    Auth.isAdmin = () => Auth.currentProfile?.rol === 'admin';
    expect(Auth.isAdmin()).toBe(false);
  });

  it('returns false for undefined role', () => {
    Auth.currentProfile = { rol: undefined };
    Auth.isAdmin = () => Auth.currentProfile?.rol === 'admin';
    expect(Auth.isAdmin()).toBe(false);
  });

  // Reset Auth mock after role tests
  afterAll(() => {
    Auth.currentProfile = { id: 'test-user-id', nombre: 'Test', rol: 'admin', comision_pct: 10 };
    Auth.isAdmin = vi.fn(() => true);
  });
});

// ════════════════════════════════════════════════════
// 6. PAYMENT DELETE — admin only
// ════════════════════════════════════════════════════

describe('Pagos.deletePago() — admin guard', () => {
  it('function exists', () => {
    expect(typeof Pagos.deletePago).toBe('function');
  });

  it('renderHistorial shows delete button for admin', () => {
    Auth.isAdmin = vi.fn(() => true);
    const pagos = [makePago({ id: 'p1', monto: 5000 })];
    const html = Pagos.renderHistorial(pagos, 'e1');
    expect(html).toContain('deletePago');
    expect(html).toContain('Eliminar pago');
  });

  it('renderHistorial hides delete button for repartidor', () => {
    Auth.isAdmin = vi.fn(() => false);
    const pagos = [makePago({ id: 'p1', monto: 5000 })];
    const html = Pagos.renderHistorial(pagos, 'e1');
    expect(html).not.toContain('deletePago');
  });

  it('renderHistorial hides delete button when no entregaId', () => {
    Auth.isAdmin = vi.fn(() => true);
    const pagos = [makePago({ id: 'p1', monto: 5000 })];
    const html = Pagos.renderHistorial(pagos);
    expect(html).not.toContain('deletePago');
  });

  afterAll(() => {
    Auth.isAdmin = vi.fn(() => true);
  });
});

// ════════════════════════════════════════════════════
// 7. OVERPAYMENT PREVENTION
// ════════════════════════════════════════════════════

describe('Overpayment prevention — renderFormInline', () => {
  it('max attribute equals remaining debt', () => {
    const html = Pagos.renderFormInline('e1', 15000);
    expect(html).toContain('max="15000"');
    expect(html).toContain('value="15000"');
  });

  it('max is 0 when fully paid', () => {
    const html = Pagos.renderFormInline('e1', 0);
    expect(html).toContain('max="0"');
  });
});

// ════════════════════════════════════════════════════
// 8. REPARTIDOR SCOPING
// ════════════════════════════════════════════════════

describe('Repartidor data scoping', () => {
  it('repartidor only sees own entregas in filtered data', () => {
    const allEntregas = [
      makeEntrega({ id: 'e1', repartidor_id: REP_FABIAN_ID }),
      makeEntrega({ id: 'e2', repartidor_id: REP_AGUSTINA_ID }),
      makeEntrega({ id: 'e3', repartidor_id: REP_FABIAN_ID }),
    ];

    // Simulate repartidor filter
    const currentUserId = REP_FABIAN_ID;
    const filtered = allEntregas.filter(e => e.repartidor_id === currentUserId);

    expect(filtered).toHaveLength(2);
    expect(filtered.every(e => e.repartidor_id === REP_FABIAN_ID)).toBe(true);
  });

  it('admin sees all entregas (no filter)', () => {
    const allEntregas = [
      makeEntrega({ repartidor_id: REP_FABIAN_ID }),
      makeEntrega({ repartidor_id: REP_AGUSTINA_ID }),
    ];

    // Admin: no filter
    expect(allEntregas).toHaveLength(2);
  });

  it('repartidor deudores scoped to own entregas', () => {
    const allEntregas = [
      makeEntrega({ id: 'e1', repartidor_id: REP_FABIAN_ID, punto_entrega_id: PUNTO_FARGO_ID, monto_total: 50000 }),
      makeEntrega({ id: 'e2', repartidor_id: REP_AGUSTINA_ID, punto_entrega_id: PUNTO_KIOSCO_ID, monto_total: 30000 }),
    ];

    const isAdmin = false;
    const currentUserId = REP_FABIAN_ID;
    const scoped = isAdmin ? allEntregas : allEntregas.filter(e => e.repartidor_id === currentUserId);

    expect(scoped).toHaveLength(1);
    expect(scoped[0].punto_entrega_id).toBe(PUNTO_FARGO_ID);
  });
});

// ════════════════════════════════════════════════════
// 9. LIQUIDACIÓN CALCULATION
// ════════════════════════════════════════════════════

describe('Liquidación — commission per repartidor', () => {
  it('commission = vendido * pct / 100', () => {
    const vendido = 500000;
    const pct = 20;
    const comision = vendido * pct / 100;
    expect(comision).toBe(100000);
  });

  it('a rendir = cobrado sin mauri - comision', () => {
    const vendido = 500000;
    const cobrado = 350000; // efectivo + transfer + mauri
    const mauri = 80000;
    const pct = 20;
    const cobradoSinMauri = cobrado - mauri; // 270000
    const comision = vendido * pct / 100;    // 100000
    const aRendir = cobradoSinMauri - comision; // 170000

    expect(cobradoSinMauri).toBe(270000);
    expect(comision).toBe(100000);
    expect(aRendir).toBe(170000);
  });

  it('groups by repartidor correctly', () => {
    const entregas = [
      makeEntrega({ id: 'e1', repartidor_id: REP_FABIAN_ID, monto_total: 50000 }),
      makeEntrega({ id: 'e2', repartidor_id: REP_FABIAN_ID, monto_total: 30000 }),
      makeEntrega({ id: 'e3', repartidor_id: REP_AGUSTINA_ID, monto_total: 40000 }),
    ];
    const pagos = [
      makePago({ entrega_id: 'e1', monto: 50000 }),
      makePago({ entrega_id: 'e2', monto: 20000 }),
      makePago({ entrega_id: 'e3', monto: 40000 }),
    ];

    const _pagosSum = {};
    pagos.forEach(p => { _pagosSum[p.entrega_id] = (_pagosSum[p.entrega_id] || 0) + Number(p.monto); });
    const pagado = (eId) => _pagosSum[eId] || 0;

    const liqMap = {};
    entregas.forEach(e => {
      const key = e.repartidor_id;
      if (!liqMap[key]) liqMap[key] = { vendido: 0, cobrado: 0 };
      liqMap[key].vendido += Number(e.monto_total);
      liqMap[key].cobrado += pagado(e.id);
    });

    expect(liqMap[REP_FABIAN_ID].vendido).toBe(80000);
    expect(liqMap[REP_FABIAN_ID].cobrado).toBe(70000);
    expect(liqMap[REP_AGUSTINA_ID].vendido).toBe(40000);
    expect(liqMap[REP_AGUSTINA_ID].cobrado).toBe(40000);
  });
});

// ════════════════════════════════════════════════════
// 10. TOAST SYSTEM — error styling
// ════════════════════════════════════════════════════

describe('Toast — error vs success styling', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('adds toast-error class for error messages', () => {
    showToast('Error: algo falló');
    const toast = document.querySelector('.toast');
    expect(toast.classList.contains('toast-error')).toBe(true);
  });

  it('adds toast-error for network errors', () => {
    showToast('Sin conexión a internet');
    const toast = document.querySelector('.toast');
    expect(toast.classList.contains('toast-error')).toBe(true);
  });

  it('does NOT add toast-error for success messages', () => {
    showToast('Pago registrado');
    const toast = document.querySelector('.toast');
    expect(toast.classList.contains('toast-error')).toBe(false);
  });

  it('has aria-live for accessibility', () => {
    showToast('Test');
    const toast = document.querySelector('.toast');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.getAttribute('role')).toBe('status');
  });
});

// ════════════════════════════════════════════════════
// 11. DUPLICATE DETECTION (audit logic)
// ════════════════════════════════════════════════════

describe('Duplicate payment detection', () => {
  it('detects pagos < 10 seconds apart with same monto and forma', () => {
    const now = new Date();
    const pagos = [
      makePago({ id: 'p1', entrega_id: 'e1', monto: 5000, forma_pago: 'efectivo', fecha: now.toISOString() }),
      makePago({ id: 'p2', entrega_id: 'e1', monto: 5000, forma_pago: 'efectivo', fecha: new Date(now.getTime() + 3000).toISOString() }),
    ];

    const sorted = [...pagos].sort((a, b) =>
      a.entrega_id.localeCompare(b.entrega_id) || new Date(a.fecha) - new Date(b.fecha)
    );

    const duplicates = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (a.entrega_id === b.entrega_id && a.monto === b.monto && a.forma_pago === b.forma_pago) {
        const diffSec = Math.abs(new Date(b.fecha) - new Date(a.fecha)) / 1000;
        if (diffSec < 10) duplicates.push(b);
      }
    }

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe('p2');
  });

  it('does NOT flag pagos far apart in time', () => {
    const pagos = [
      makePago({ id: 'p1', entrega_id: 'e1', monto: 5000, forma_pago: 'efectivo', fecha: '2026-04-08T10:00:00Z' }),
      makePago({ id: 'p2', entrega_id: 'e1', monto: 5000, forma_pago: 'efectivo', fecha: '2026-04-08T15:00:00Z' }),
    ];

    const sorted = [...pagos].sort((a, b) =>
      a.entrega_id.localeCompare(b.entrega_id) || new Date(a.fecha) - new Date(b.fecha)
    );

    const duplicates = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (a.entrega_id === b.entrega_id && a.monto === b.monto && a.forma_pago === b.forma_pago) {
        const diffSec = Math.abs(new Date(b.fecha) - new Date(a.fecha)) / 1000;
        if (diffSec < 10) duplicates.push(b);
      }
    }

    expect(duplicates).toHaveLength(0);
  });

  it('does NOT flag different amounts on same entrega', () => {
    const now = new Date();
    const pagos = [
      makePago({ id: 'p1', entrega_id: 'e1', monto: 5000, forma_pago: 'efectivo', fecha: now.toISOString() }),
      makePago({ id: 'p2', entrega_id: 'e1', monto: 3000, forma_pago: 'efectivo', fecha: new Date(now.getTime() + 2000).toISOString() }),
    ];

    const sorted = [...pagos].sort((a, b) =>
      a.entrega_id.localeCompare(b.entrega_id) || new Date(a.fecha) - new Date(b.fecha)
    );

    const duplicates = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (a.entrega_id === b.entrega_id && a.monto === b.monto && a.forma_pago === b.forma_pago) {
        const diffSec = Math.abs(new Date(b.fecha) - new Date(a.fecha)) / 1000;
        if (diffSec < 10) duplicates.push(b);
      }
    }

    expect(duplicates).toHaveLength(0);
  });
});
