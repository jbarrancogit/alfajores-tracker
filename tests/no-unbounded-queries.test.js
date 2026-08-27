/**
 * Guardrail against silent truncation.
 *
 * Supabase caps every REST response at db-max-rows (1000 by default) and
 * reports it only in the Content-Range header, which supabase-js does not
 * expose. An unbounded .select() therefore returns 1000 rows and no error —
 * the caller cannot tell a complete answer from a truncated one.
 *
 * That is what hid recent debts from the Deudores view once the entregas table
 * passed 1000 rows, in June 2026. Nothing failed, nothing logged, and the
 * numbers on screen stayed plausible for twelve weeks.
 *
 * This test fails the build if any module issues a read that is not explicitly
 * bounded, so the same class of bug cannot come back unnoticed in a module
 * nobody thought to re-check.
 *
 * A read is bounded when it either
 *   - goes through selectAll(), which pages until the server returns a short
 *     page and so cannot be truncated, or
 *   - caps itself on purpose with .limit() / .range() / .single() /
 *     .maybeSingle(), which makes the bound visible at the call site.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const JS_DIR = resolve(__dirname, '..', 'js');

// supabase.js defines selectAll()/batchIn() — the paging primitives themselves,
// and the only place allowed to issue a raw range query.
const EXEMPT_FILES = ['supabase.js'];

const BOUND_CALLS = ['.limit(', '.range(', '.single(', '.maybeSingle('];
const WRITE_CALLS = ['.insert(', '.update(', '.delete(', '.upsert('];

const BACKSLASH = String.fromCharCode(92);
const QUOTES = ["'", '"', '`'];
const OPENERS = ['(', '[', '{'];
const CLOSERS = [')', ']', '}'];

/** Extract the full chained expression that starts at `.from(`. */
function readChain(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== BACKSLASH) quote = null;
      continue;
    }
    if (QUOTES.includes(c)) { quote = c; continue; }
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth--;
    else if (c === ';' && depth <= 0) return src.slice(start, i);
  }
  return src.slice(start);
}

/**
 * Queries are often built up over several statements:
 *   let query = db.from('entregas').select(...);
 *   if (filtro) query = query.eq(...);
 *   const { data } = await query.limit(100);
 * so a bound on the variable counts, not just one in the opening chain.
 */
function variableName(lineText) {
  const declared = lineText.trim().match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
  return declared ? declared[1] : null;
}

function boundLater(lines, lineIndex, name) {
  if (!name) return false;
  const window = lines.slice(lineIndex, lineIndex + 60).join('\n');
  return BOUND_CALLS.some(call => window.includes(name + call));
}

function findUnboundedReads(src) {
  const lines = src.split('\n');
  const offenders = [];
  for (let i = src.indexOf('.from('); i !== -1; i = src.indexOf('.from(', i + 1)) {
    const chain = readChain(src, i);
    if (WRITE_CALLS.some(w => chain.includes(w))) continue;
    if (BOUND_CALLS.some(b => chain.includes(b))) continue;

    const lineNumber = src.slice(0, i).split('\n').length;
    const lineText = lines[lineNumber - 1];
    if (boundLater(lines, lineNumber - 1, variableName(lineText))) continue;

    const table = (chain.match(/^\.from\(\s*['"]([^'"]+)['"]/) || [])[1] || '?';
    offenders.push({ line: lineNumber, table, snippet: lineText.trim() });
  }
  return offenders;
}

const files = readdirSync(JS_DIR)
  .filter(f => f.endsWith('.js'))
  .filter(f => !EXEMPT_FILES.includes(f));

describe('no unbounded Supabase reads', () => {
  it.each(files)('%s bounds every read', (file) => {
    const src = readFileSync(join(JS_DIR, file), 'utf-8');
    const offenders = findUnboundedReads(src);
    const detail = offenders
      .map(o => `  ${file}:${o.line}  tabla "${o.table}"  ->  ${o.snippet}`)
      .join('\n');
    const message =
      '\nLectura sin limite: Supabase la trunca en 1000 filas sin devolver error.\n' +
      'Usa selectAll() para recorrer la tabla completa, o .limit()/.range()/.single()\n' +
      'si el tope es intencional.\n' + detail + '\n';
    expect(offenders, message).toHaveLength(0);
  });
});
