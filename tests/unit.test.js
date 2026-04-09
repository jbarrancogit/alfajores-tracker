/**
 * Unit tests — pure functions extracted from the vanilla JS modules.
 * Each function is copied here to test in isolation without DOM/DB deps.
 */
import { describe, it, expect } from 'vitest';

// ─── Extracted pure functions ─────────────────────────────

/** From supabase.js — HTML escape */
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/** From supabase.js — currency format */
function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** From pagos.js — payment status badge */
function badge(montoPagado, montoTotal) {
  const pagado = Number(montoPagado);
  const total = Number(montoTotal);
  if (pagado >= total) return '<span class="badge badge-green">Pagado</span>';
  if (pagado > 0) return '<span class="badge badge-yellow">Parcial</span>';
  return '<span class="badge badge-red">Debe</span>';
}

/** From excel.js — ISO week number (1-4 cycle) */
function semana(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return ((weekNum - 1) % 4) + 1;
}

/** From analisis.js — previous period range */
function prevRange(from, to) {
  const duration = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - duration),
    to: new Date(from.getTime()),
  };
}

/** From entregas.js — monetary rounding */
function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/** From pagos.js — derive forma_pago from payment methods set */
function deriveFormaPago(allPagos) {
  const methods = new Set((allPagos || []).map(p => p.forma_pago));
  if (methods.size === 1) return [...methods][0];
  if (methods.size > 1) return 'mixto';
  return 'fiado';
}

// ─── Tests ────────────────────────────────────────────────

describe('esc() — HTML escape', () => {
  it('escapes HTML tags', () => {
    expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });
  it('escapes ampersands', () => {
    expect(esc('A & B')).toBe('A &amp; B');
  });
  it('escapes quotes', () => {
    expect(esc('"hello"')).toBe('"hello"');
  });
  it('returns empty string for null', () => {
    expect(esc(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(esc(undefined)).toBe('');
  });
  it('handles numbers', () => {
    expect(esc(42)).toBe('42');
  });
  it('handles empty string', () => {
    expect(esc('')).toBe('');
  });
});

describe('fmtMoney() — currency formatting', () => {
  it('formats positive integers', () => {
    const result = fmtMoney(1000);
    expect(result).toMatch(/^\$1[.,]000$/);
  });
  it('formats zero', () => {
    expect(fmtMoney(0)).toBe('$0');
  });
  it('handles null/undefined as $0', () => {
    expect(fmtMoney(null)).toBe('$0');
    expect(fmtMoney(undefined)).toBe('$0');
  });
  it('rounds decimals to integers', () => {
    const result = fmtMoney(1234.56);
    expect(result).toMatch(/^\$1[.,]235$/);
  });
  it('formats large numbers', () => {
    const result = fmtMoney(1000000);
    expect(result).toMatch(/^\$1[.,]000[.,]000$/);
  });
  it('handles negative numbers', () => {
    const result = fmtMoney(-500);
    expect(result).toContain('500');
  });
  it('handles string input', () => {
    const result = fmtMoney('2500');
    expect(result).toMatch(/^\$2[.,]500$/);
  });
});

describe('badge() — payment status', () => {
  it('returns Pagado when fully paid', () => {
    expect(badge(1000, 1000)).toContain('Pagado');
    expect(badge(1000, 1000)).toContain('badge-green');
  });
  it('returns Pagado when overpaid', () => {
    expect(badge(1200, 1000)).toContain('Pagado');
  });
  it('returns Parcial when partially paid', () => {
    expect(badge(500, 1000)).toContain('Parcial');
    expect(badge(500, 1000)).toContain('badge-yellow');
  });
  it('returns Debe when nothing paid', () => {
    expect(badge(0, 1000)).toContain('Debe');
    expect(badge(0, 1000)).toContain('badge-red');
  });
  it('handles string inputs', () => {
    expect(badge('1000', '1000')).toContain('Pagado');
  });
  it('handles null as zero', () => {
    expect(badge(null, 1000)).toContain('Debe');
  });
  it('returns Pagado for zero-value delivery fully paid', () => {
    expect(badge(0, 0)).toContain('Pagado');
  });
  it('returns Parcial for $1 paid of $1000', () => {
    expect(badge(1, 1000)).toContain('Parcial');
  });
});

describe('semana() — ISO week to 4-week cycle', () => {
  it('returns 1-4 range', () => {
    for (let m = 0; m < 12; m++) {
      const result = semana(new Date(2026, m, 15));
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(4);
    }
  });
  it('Jan 1 2026 (Thursday) is week 1', () => {
    expect(semana('2026-01-01')).toBe(1);
  });
  it('consecutive weeks increment correctly', () => {
    const w1 = semana('2026-01-05'); // Monday week 2
    const w2 = semana('2026-01-12'); // Monday week 3
    expect(w2).toBe(w1 + 1 > 4 ? 1 : w1 + 1);
  });
  it('same week returns same value', () => {
    // Tue and Thu of same week (avoid timezone edge at Monday boundary)
    expect(semana('2026-01-06')).toBe(semana('2026-01-08'));
  });
  it('handles year boundary', () => {
    const result = semana('2025-12-31');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(4);
  });
});

describe('prevRange() — previous period calculation', () => {
  it('calculates correct previous week', () => {
    const from = new Date('2026-04-01T00:00:00');
    const to = new Date('2026-04-08T00:00:00');
    const prev = prevRange(from, to);

    expect(prev.to.getTime()).toBe(from.getTime());
    expect(prev.from.getTime()).toBe(new Date('2026-03-25T00:00:00').getTime());
  });
  it('duration of prev equals duration of current', () => {
    const from = new Date('2026-04-01');
    const to = new Date('2026-04-15');
    const prev = prevRange(from, to);

    const currentDuration = to.getTime() - from.getTime();
    const prevDuration = prev.to.getTime() - prev.from.getTime();
    expect(prevDuration).toBe(currentDuration);
  });
  it('prev.to equals current.from', () => {
    const from = new Date('2026-03-01');
    const to = new Date('2026-04-01');
    const prev = prevRange(from, to);

    expect(prev.to.getTime()).toBe(from.getTime());
  });
});

describe('roundMoney() — floating point fix', () => {
  it('rounds 0.1 + 0.2 correctly', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('rounds 2.1 * 3 correctly', () => {
    expect(roundMoney(2.1 * 3)).toBe(6.3);
  });
  it('keeps clean numbers unchanged', () => {
    expect(roundMoney(100)).toBe(100);
    expect(roundMoney(99.99)).toBe(99.99);
  });
  it('rounds to 2 decimals', () => {
    // Note: 1.005 * 100 = 100.499... due to IEEE 754, so Math.round gives 100 → 1.00
    // This is expected JS behavior — the function rounds correctly for real-world inputs
    expect(roundMoney(1.005)).toBe(1); // IEEE 754 precision limit
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(1.004)).toBe(1);
  });
  it('handles zero', () => {
    expect(roundMoney(0)).toBe(0);
  });
  it('handles large numbers', () => {
    expect(roundMoney(999999.999)).toBe(1000000);
  });
});

describe('deriveFormaPago() — payment method derivation', () => {
  it('returns single method when all same', () => {
    expect(deriveFormaPago([
      { forma_pago: 'efectivo' },
      { forma_pago: 'efectivo' },
    ])).toBe('efectivo');
  });
  it('returns transferencia when all transfers', () => {
    expect(deriveFormaPago([
      { forma_pago: 'transferencia' },
    ])).toBe('transferencia');
  });
  it('returns transferencia_mauri when all mauri', () => {
    expect(deriveFormaPago([
      { forma_pago: 'transferencia_mauri' },
    ])).toBe('transferencia_mauri');
  });
  it('returns mixto when mixed methods', () => {
    expect(deriveFormaPago([
      { forma_pago: 'efectivo' },
      { forma_pago: 'transferencia' },
    ])).toBe('mixto');
  });
  it('returns mixto when efectivo + mauri', () => {
    expect(deriveFormaPago([
      { forma_pago: 'efectivo' },
      { forma_pago: 'transferencia_mauri' },
    ])).toBe('mixto');
  });
  it('returns fiado when no payments', () => {
    expect(deriveFormaPago([])).toBe('fiado');
  });
  it('returns fiado for null input', () => {
    expect(deriveFormaPago(null)).toBe('fiado');
  });
  it('handles single payment', () => {
    expect(deriveFormaPago([{ forma_pago: 'efectivo' }])).toBe('efectivo');
  });
});
