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
