const SUPABASE_URL = 'https://rcyeujuqsicgkmilxpvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_40z5jVgzQoUeS815XABZNw_ewFTjg2o';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Supabase caps every REST response at db-max-rows (1000 by default). The cap
 * is reported only in the Content-Range header, which supabase-js does not
 * expose, so an unbounded .select() quietly returns 1000 rows and no error:
 * the caller cannot tell a complete answer from a truncated one.
 *
 * selectAll() is the only safe way to read a table that can outgrow that cap.
 * It pages until the server returns a short page, so it either returns every
 * matching row or throws. tests/no-unbounded-queries.test.js fails the build if
 * a module reads through db.from() without going through here or capping itself
 * on purpose with .limit()/.range()/.single().
 *
 * @param {string}   table        table name
 * @param {string}   select       PostgREST select expression
 * @param {Function} [applyFilters] receives the query, returns it filtered
 * @param {Object}   [options]    { client, label }
 */
const DB_PAGE_SIZE = 1000;
const DB_MAX_PAGES = 500;

async function selectAll(table, select, applyFilters, options) {
  const opts = options || {};
  const client = opts.client || db;
  const label = opts.label || table;
  const rows = [];

  for (let page = 0; page < DB_MAX_PAGES; page++) {
    const from = page * DB_PAGE_SIZE;
    let q = client.from(table).select(select);
    if (applyFilters) q = applyFilters(q);

    const { data, error } = await q.range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;

    rows.push(...data);
    if (data.length < DB_PAGE_SIZE) return rows;
  }

  // Refuse to return a half-read table: a silent partial answer is the bug
  // this helper exists to prevent.
  throw new Error(`selectAll(${label}): superó ${DB_MAX_PAGES} páginas`);
}

/**
 * Batch .in() queries to avoid PostgREST URL length limits (~8KB).
 * Each chunk goes through fetchAll(), because a chunk of 200 ids can still
 * match more than 1000 rows on a one-to-many table.
 */
async function batchIn(table, select, field, ids, options) {
  if (!ids || ids.length === 0) return [];
  const CHUNK = 200;
  const results = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const rows = await selectAll(table, select, q => q.in(field, slice), {
      client: options && options.client,
      label: `${table}.in(${field})`
    });
    results.push(...rows);
  }
  return results;
}

/** Escape HTML to prevent XSS in template literals */
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

/** Escape for embedding in JS string inside onclick attributes */
function escJs(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/** User-friendly DB error message */
function friendlyError(err) {
  const msg = err?.message || String(err);
  if (msg.includes('duplicate key')) return 'Ya existe un registro con esos datos';
  if (msg.includes('violates foreign key')) return 'No se puede eliminar, hay datos relacionados';
  if (msg.includes('violates check')) return 'Valor fuera de rango permitido';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'Sin conexión a internet';
  if (msg.length > 80) return 'Error del servidor';
  return msg;
}

/** Format number as ARS currency */
function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Format date for display */
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/** Format date + time */
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/** Show toast notification */
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.toggle('toast-error', /error|sin conexi/i.test(msg));
  toast.classList.add('visible');
  setTimeout(() => { toast.classList.remove('visible'); toast.classList.remove('toast-error'); }, 1800);
}

/** Create a Supabase client with a portal token header for client access */
function createPortalClient(token) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { 'x-client-token': token }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
