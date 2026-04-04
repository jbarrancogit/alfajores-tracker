const App = {
  currentRoute: null,

  routes: {
    '/': () => Dashboard.render(),
    '/entrega': () => Entregas.renderForm(),
    '/historial': () => Historial.render(),
    '/analisis': () => Analisis.render(),
    '/config': () => Config.render(),
  },

  init() {
    window.addEventListener('hashchange', () => App.navigate());

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = '#' + btn.dataset.route;
      });
    });

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
