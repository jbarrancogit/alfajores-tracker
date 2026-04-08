const App = {
  currentRoute: null,

  routes: {
    '/': () => Dashboard.render(),
    '/entrega': () => Entregas.renderForm(),
    '/historial': () => Historial.render(),
    '/ruta': () => Ruta.render(),
    '/analisis': () => Analisis.render(),
    '/config': () => Config.render(),
  },

  init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.addEventListener('online', () => showToast('Conexión restaurada'));
    window.addEventListener('offline', () => showToast('Sin conexión a internet'));
    window.addEventListener('hashchange', () => App.navigate());

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = '#' + btn.dataset.route;
      });
    });

    db.auth.onAuthStateChange((event, session) => {
      if (session) {
        Auth.onLogin(session).then(() => {
          const hash = window.location.hash.slice(1) || '/';
          if (!hash.startsWith('/cliente/')) {
            document.getElementById('bottom-nav').hidden = false;
          }
          App.navigate();
        });
      } else {
        Auth.currentUser = null;
        Auth.currentProfile = null;
        // Check if this is a portal route — no login needed
        const hash = window.location.hash.slice(1) || '/';
        if (hash.startsWith('/cliente/')) {
          App.navigate();
        } else {
          document.getElementById('bottom-nav').hidden = true;
          Auth.renderLogin();
        }
      }
    });
  },

  navigate() {
    const hash = window.location.hash.slice(1) || '/';

    // Portal route: /cliente/{token}
    if (hash.startsWith('/cliente/')) {
      const token = hash.replace('/cliente/', '');
      App.currentRoute = '/cliente';
      document.getElementById('bottom-nav').hidden = true;
      Portal.render(token);
      return;
    }

    // Regular routes require auth
    if (!Auth.currentUser) return;

    // Admin-only route guards (prevent data-fetching side effects)
    if ((hash === '/config' || hash === '/analisis') && !Auth.isAdmin()) {
      window.location.hash = '#/';
      return;
    }

    const route = App.routes[hash];
    if (!route) {
      window.location.hash = '#/';
      return;
    }
    App.currentRoute = hash;
    App.updateNav(hash);

    const appEl = document.getElementById('app');
    const html = route();
    if (typeof html === 'string') {
      appEl.innerHTML = '<div class="screen">' + html + '</div>';
    }
  },

  updateNav(hash) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const isActive = btn.dataset.route === hash;
      btn.classList.toggle('active', isActive);
    });
    // Hide Análisis tab for non-admin
    const analBtn = document.querySelector('[data-route="/analisis"]');
    if (analBtn && Auth.currentProfile) {
      analBtn.style.display = Auth.currentProfile.rol === 'admin' ? '' : 'none';
    }
  },

  setContent(html) {
    document.getElementById('app').innerHTML = '<div class="screen">' + html + '</div>';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
