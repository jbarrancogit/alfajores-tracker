/**
 * Integration tests — load real JS modules into jsdom context.
 * Uses vm.runInThisContext (same pattern as flows.test.js / deudores.test.js).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(__dirname, '..');
function loadScript(p) {
  vm.runInThisContext(readFileSync(resolve(ROOT, p), 'utf-8'), { filename: p });
}

// ─── Puntos module — regression for renderSelector + new renderFilterCombobox ───

loadScript('js/supabase.js');
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
    expect(html).toContain('Todos los puntos');
  });

  it('excludes "Todos" option when includeAll=false', () => {
    const html = Puntos.renderFilterCombobox({
      inputId: 'a', hiddenId: 'b', dropdownId: 'c', includeAll: false
    });
    expect(html).not.toContain('Todos los puntos');
  });
});
