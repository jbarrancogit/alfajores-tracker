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
});

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

describe('Deudores.render — HTML output', () => {
  beforeEach(() => {
    vi.spyOn(Deudores, 'loadData').mockResolvedValue(undefined);
  });

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
