const SUPABASE_URL = 'https://rcyeujuqsicgkmilxpvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_40z5jVgzQoUeS815XABZNw_ewFTjg2o';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/** Format date + time */
function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/** Show toast notification */
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}
