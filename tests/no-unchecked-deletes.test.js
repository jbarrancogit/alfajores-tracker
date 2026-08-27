/**
 * Guardrail against deletes that report success without deleting anything.
 *
 * PostgREST answers a DELETE that matched no rows with 200 and an empty body,
 * and RLS filters rows out before the delete rather than raising. So this,
 *
 *   const { error } = await db.from('entregas').delete().eq('id', id);
 *   if (error) throw error;
 *   showToast('Entrega eliminada');
 *
 * shows a success message whether it deleted the row or nothing at all. That is
 * how an entrega with no lines and no pagos survived a rollback in April 2026
 * and then sat in the debt list until August.
 *
 * Every delete now goes through deleteRows(), which asks the server for the rows
 * it removed and, when the caller passes expectRows, turns a no-op into an error.
 * This test fails the build if a module reaches for .delete() directly again.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import vm from 'vm';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const JS_DIR = resolve(__dirname, '..', 'js');

// deleteRows() lives in supabase.js; load it the same way the browser does.
vm.runInThisContext(readFileSync(resolve(JS_DIR, 'supabase.js'), 'utf-8'), { filename: 'js/supabase.js' });

beforeEach(() => { vi.clearAllMocks(); });

// supabase.js defines deleteRows() — the only place allowed to call .delete().
const EXEMPT_FILES = ['supabase.js'];

/**
 * Only Supabase query builders count. Plain JS collections have a .delete() too
 * — Pagos._inflight is a Set — so a delete is flagged only when it hangs off a
 * .from() chain.
 */
function findRawDeletes(src) {
  const lines = src.split('\n');
  const offenders = [];
  for (let i = src.indexOf('.from('); i !== -1; i = src.indexOf('.from(', i + 1)) {
    const end = src.indexOf(';', i);
    const chain = src.slice(i, end === -1 ? src.length : end);
    if (!chain.includes('.delete(')) continue;
    const lineNumber = src.slice(0, i).split('\n').length;
    offenders.push({ line: lineNumber, snippet: lines[lineNumber - 1].trim() });
  }
  return offenders;
}

const files = readdirSync(JS_DIR)
  .filter(f => f.endsWith('.js'))
  .filter(f => !EXEMPT_FILES.includes(f));

describe('no unchecked deletes', () => {
  it.each(files)('%s deletes through deleteRows()', (file) => {
    const src = readFileSync(join(JS_DIR, file), 'utf-8');
    const offenders = findRawDeletes(src);
    const detail = offenders.map(o => `  ${file}:${o.line}  ->  ${o.snippet}`).join('\n');
    const message =
      '\nBorrado directo: si no borra nada, PostgREST devuelve 200 sin error y la\n' +
      'app informa exito igual. Usa deleteRows(tabla, filtros, { expectRows: true })\n' +
      'para que un borrado vacio falle.\n' + detail + '\n';
    expect(offenders, message).toHaveLength(0);
  });
});

describe('deleteRows', () => {
  it('throws when expectRows is set and nothing was deleted', async () => {
    db.from.mockImplementation(() => ({
      delete: () => ({
        eq: function () { return this; },
        select: () => Promise.resolve({ data: [], error: null }),
      }),
    }));

    await expect(
      deleteRows('entregas', q => q.eq('id', 'no-existe'), { expectRows: true, label: 'la entrega' })
    ).rejects.toThrow(/No se eliminó ningún registro/);
  });

  it('returns the deleted rows', async () => {
    db.from.mockImplementation(() => ({
      delete: () => ({
        eq: function () { return this; },
        select: () => Promise.resolve({ data: [{ id: 'e1' }], error: null }),
      }),
    }));

    const rows = await deleteRows('entregas', q => q.eq('id', 'e1'), { expectRows: true });
    expect(rows).toEqual([{ id: 'e1' }]);
  });

  it('accepts deleting nothing when expectRows is not set', async () => {
    db.from.mockImplementation(() => ({
      delete: () => ({
        eq: function () { return this; },
        select: () => Promise.resolve({ data: [], error: null }),
      }),
    }));

    await expect(
      deleteRows('entrega_lineas', q => q.eq('entrega_id', 'e1'))
    ).resolves.toEqual([]);
  });
});
