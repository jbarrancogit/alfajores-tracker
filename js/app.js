const App = {
  currentRoute: null,

  routes: {
    '/': () => Dashboard.render(),
    '/entrega': () => Entregas.renderForm(),
    '/historial': () => Historial.render(),
    '/resumenes': () => Resumenes.render(),
  },

  init() {
    // Listen for hash changes
    window.addEventListener('hashchange', () => App.navigate());

    // Nav button clicks
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = '#' + btn.dataset.route;
      });
    });

    // Auth state listener
    db.auth.onAuthStateChange((event, session) => {
      if (session) {
        Auth.onLogin(session).then(() => {
          document.getElementById('bottom-nav').hidden = false;
          App.navigate();
        });
      } else {
        Auth.currentUser = null;
        Auth.currentProfile = null;
        document.getElementById('bottom-nav').hidden = true;
        Auth.renderLogin();
      }
    });
  },

  navigate() {
    const hash = window.location.hash.slice(1) || '/';
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
    // If route returns a Promise (async render), it handles its own DOM update
  },

  updateNav(hash) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const isActive = btn.dataset.route === hash;
      btn.classList.toggle('active', isActive);
    });
    // Hide Resúmenes tab for non-admin
    const resBtn = document.querySelector('[data-route="/resumenes"]');
    if (resBtn && Auth.currentProfile) {
      resBtn.style.display = Auth.currentProfile.rol === 'admin' ? '' : 'none';
    }
  },

  /** Render into #app from async functions */
  setContent(html) {
    document.getElementById('app').innerHTML = '<div class="screen">' + html + '</div>';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
