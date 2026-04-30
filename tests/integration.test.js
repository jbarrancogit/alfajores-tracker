/**
 * Integration tests — load actual JS modules into jsdom context
 * and test interactions between components with mocked Supabase.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(__dirname, '..');

/** Load a JS file into globalThis (like a <script> tag). */
function loadScript(relativePath) {
  const code = readFileSync(resolve(ROOT, relativePath), 'utf-8');
  vm.runInThisContext(code, { filename: relativePath });
}

// Load modules once — they define globals via `const` which can't be re-declared
loadScript('js/supabase.js');
loadScript('js/tipos.js');
loadScript('js/pagos.js');
loadScript('js/puntos.js');

// ─── Tests ────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  vi.clearAllMocks();
  // Reset Tipos cache
  if (globalThis.Tipos) globalThis.Tipos.cache = [];
});

// ─── Supabase utilities ───────────────────────────────────

describe('Supabase utilities — loaded from actual file', () => {
  it('esc() is defined globally', () => {
    expect(typeof esc).toBe('function');
  });

  it('fmtMoney() is defined globally', () => {
    expect(typeof fmtMoney).toBe('function');
  });

  it('fmtDate() is defined globally', () => {
    expect(typeof fmtDate).toBe('function');
  });

  it('fmtDateTime() is defined globally', () => {
    expect(typeof fmtDateTime).toBe('function');
  });

  it('db client is created', () => {
    expect(db).toBeDefined();
  });

  it('esc escapes HTML from actual loaded code', () => {
    expect(esc('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('fmtMoney formats from actual loaded code', () => {
    expect(fmtMoney(0)).toBe('$0');
  });

  it('showToast creates toast element', () => {
    showToast('Test message');
    const toast = document.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe('Test message');
  });
});

// ─── Tipos module ─────────────────────────────────────────

describe('Tipos module — loaded from actual file', () => {
  it('Tipos object is defined', () => {
    expect(Tipos).toBeDefined();
  });

  it('cache starts empty', () => {
    expect(Tipos.cache).toEqual([]);
  });

  it('activos() filters by activo flag', () => {
    Tipos.cache = [
      { id: '1', nombre: 'Glaseado', activo: true },
      { id: '2', nombre: 'Maicena', activo: false },
      { id: '3', nombre: 'Miel', activo: true },
    ];
    const activos = Tipos.activos();
    expect(activos).toHaveLength(2);
    expect(activos.map(t => t.nombre)).toEqual(['Glaseado', 'Miel']);
  });

  it('nombre() returns type name from cache', () => {
    Tipos.cache = [{ id: 'abc', nombre: 'Glaseado Premium' }];
    expect(Tipos.nombre('abc')).toBe('Glaseado Premium');
  });

  it('nombre() returns ? for unknown id', () => {
    Tipos.cache = [];
    expect(Tipos.nombre('nonexistent')).toBe('?');
  });

  it('saveLast / getLastPrecio persist to localStorage', () => {
    Tipos.saveLast('tipo1', 150, 80);
    expect(Tipos.getLastPrecio('tipo1')).toBe(150);
    expect(Tipos.getLastCosto('tipo1')).toBe(80);
  });

  it('getLastPrecio returns falsy for unknown tipo', () => {
    expect(Tipos.getLastPrecio('nope-unknown-xyz')).toBeFalsy();
  });
});

// ─── Pagos module ─────────────────────────────────────────

describe('Pagos module — loaded from actual file', () => {
  it('Pagos object is defined', () => {
    expect(Pagos).toBeDefined();
  });

  it('badge returns correct status for fully paid', () => {
    const html = Pagos.badge(1000, 1000);
    expect(html).toContain('Pagado');
    expect(html).toContain('badge-green');
  });

  it('badge returns correct status for partial', () => {
    const html = Pagos.badge(300, 1000);
    expect(html).toContain('Parcial');
    expect(html).toContain('badge-yellow');
  });

  it('badge returns correct status for unpaid', () => {
    const html = Pagos.badge(0, 500);
    expect(html).toContain('Debe');
    expect(html).toContain('badge-red');
  });

  it('renderFormInline generates correct HTML with max attribute', () => {
    const html = Pagos.renderFormInline('entrega-123', 500);
    expect(html).toContain('max="500"');
    expect(html).toContain('value="500"');
    expect(html).toContain('pago-monto-entrega-123');
    expect(html).toContain('Efectivo');
    expect(html).toContain('Transfer.');
  });

  it('renderFormInline sets default forma_pago to efectivo', () => {
    const html = Pagos.renderFormInline('e1', 100);
    expect(html).toContain('value="efectivo"');
  });

  it('renderHistorial returns "Sin pagos" for empty array', () => {
    const html = Pagos.renderHistorial([]);
    expect(html).toContain('Sin pagos');
  });

  it('renderHistorial returns "Sin pagos" for null', () => {
    const html = Pagos.renderHistorial(null);
    expect(html).toContain('Sin pagos');
  });
});

// ─── Cross-module payment flow ────────────────────────────

describe('Payment flow — cross-module integration', () => {
  it('badge reflects overpayment as Pagado', () => {
    const html = Pagos.badge(1500, 1000);
    expect(html).toContain('Pagado');
  });

  it('form max attribute prevents overpayment in UI', () => {
    const deuda = 250;
    const html = Pagos.renderFormInline('test-id', deuda);
    expect(html).toContain(`max="${deuda}"`);
    expect(html).toContain(`value="${deuda}"`);
  });

  it('fmtMoney + badge work together correctly', () => {
    const result = Pagos.badge(750, 1500);
    const total = fmtMoney(1500);
    const paid = fmtMoney(750);

    expect(result).toContain('Parcial');
    expect(total).toContain('1');
    expect(paid).toContain('750');
  });
});

// ─── Toast system ─────────────────────────────────────────

describe('Toast system — from actual loaded code', () => {
  it('creates toast element on first call', () => {
    expect(document.querySelector('.toast')).toBeNull();
    showToast('Hello');
    expect(document.querySelector('.toast')).not.toBeNull();
  });

  it('reuses same toast element', () => {
    showToast('First');
    showToast('Second');
    const toasts = document.querySelectorAll('.toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('Second');
  });

  it('adds visible class', () => {
    showToast('Visible');
    const toast = document.querySelector('.toast');
    expect(toast.classList.contains('visible')).toBe(true);
  });
});

// ─── Puntos module — regression for renderSelector + new renderFilterCombobox ───

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
    expect(html).toContain('Todos los puntos');
  });

  it('excludes "Todos" option when includeAll=false', () => {
    const html = Puntos.renderFilterCombobox({
      inputId: 'a', hiddenId: 'b', dropdownId: 'c', includeAll: false
    });
    expect(html).not.toContain('Todos los puntos');
  });
});

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
