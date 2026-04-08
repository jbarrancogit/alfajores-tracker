const SUPABASE_URL = 'https://rcyeujuqsicgkmilxpvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_40z5jVgzQoUeS815XABZNw_ewFTjg2o';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Batch .in() queries to avoid PostgREST URL length limits (~8KB) */
async function batchIn(table, select, field, ids) {
  if (!ids || ids.length === 0) return [];
  const CHUNK = 200;
  const results = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await db.from(table).select(select).in(field, ids.slice(i, i + CHUNK));
    if (data) results.push(...data);
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
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
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
