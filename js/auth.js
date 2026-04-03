const Auth = {
  currentUser: null,    // Supabase auth user
  currentProfile: null, // Row from usuarios table

  renderLogin() {
    document.getElementById('bottom-nav').hidden = true;
    document.getElementById('app').innerHTML = `
      <div class="login-screen">
        <img src="assets/icon-192.png" alt="Logo" class="login-logo">
        <div class="login-title">Alfajores Tracker</div>
        <div class="login-subtitle">Control de entregas</div>
        <form class="login-form" onsubmit="Auth.handleLogin(event)">
          <div class="login-error" id="login-error"></div>
          <div class="form-group">
            <label class="form-label" for="login-email">Email</label>
            <input class="form-input" id="login-email" type="email"
                   placeholder="tu@email.com" required autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label" for="login-pass">Contraseña</label>
            <input class="form-input" id="login-pass" type="password"
                   placeholder="Tu contraseña" required autocomplete="current-password">
          </div>
          <button class="btn btn-primary btn-block btn-lg" type="submit" id="login-btn">
            Entrar
          </button>
        </form>
      </div>
    `;
  },

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const { error } = await db.auth.signInWithPassword({ email, password: pass });

    if (error) {
      errEl.textContent = 'Email o contraseña incorrectos';
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
    // On success, onAuthStateChange in app.js handles the rest
  },

  async onLogin(session) {
    Auth.currentUser = session.user;
    console.log('Auth: usuario autenticado', session.user.id, session.user.email);

    // Fetch profile from usuarios table
    const { data, error } = await db
      .from('usuarios')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error) console.warn('Auth: error leyendo perfil:', error.message);

    if (error || !data) {
      // User exists in auth but not in usuarios table — create basic profile
      const { data: newProfile, error: insertErr } = await db
        .from('usuarios')
        .insert({
          id: session.user.id,
          nombre: session.user.email.split('@')[0],
          email: session.user.email,
          rol: 'repartidor'
        })
        .select()
        .single();
      if (insertErr) console.error('Auth: error creando perfil:', insertErr);
      Auth.currentProfile = newProfile;
    } else {
      Auth.currentProfile = data;
    }
    console.log('Auth: perfil cargado', Auth.currentProfile);
  },

  async logout() {
    await db.auth.signOut();
    window.location.hash = '#/';
  },

  isAdmin() {
    return Auth.currentProfile?.rol === 'admin';
  }
};
