const Config = {
  render() {
    if (!Auth.isAdmin()) {
      window.location.hash = '#/';
      return '<div class="empty-state"><p>Acceso denegado</p></div>';
    }
    Config.loadData();
    return `
      <div class="app-header">
        <h1>Configuración</h1>
        <button class="btn-icon" onclick="window.location.hash='#/'">&times;</button>
      </div>
      <div id="config-content"><div class="spinner mt-8"></div></div>
    `;
  },

  async loadData() {
    await Tipos.fetchAll();
    const { data: usuarios } = await db.from('usuarios').select('*').order('nombre');

    const contentEl = document.getElementById('config-content');
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">Tipos de alfajor</div>
        <div id="config-tipos">
          ${Tipos.cache.map(t => `
            <div class="config-item" data-id="${t.id}">
              <div class="config-item-info">
                <div class="config-item-name">${esc(t.nombre)}</div>
                <div class="config-item-detail">
                  ${t.es_reventa ? 'Reventa' : 'Producción propia'}
                  · Orden: ${t.orden}
                  ${t.costo_default ? ' · Costo: ' + fmtMoney(t.costo_default) : ''}
                </div>
              </div>
              <div class="config-item-actions">
                <button class="btn-icon" style="width:32px;height:32px" title="Editar"
                        onclick="Config.editTipo('${t.id}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <div class="toggle-switch ${t.activo ? 'on' : ''}"
                     onclick="Config.toggleTipo('${t.id}', ${!t.activo})"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-block mt-8" onclick="Config.addTipo()">+ Nuevo tipo</button>
      </div>

      <div class="config-section">
        <div class="config-section-title">Usuarios</div>
        <div id="config-usuarios">
          ${(usuarios || []).map(u => `
            <div class="config-item">
              <div class="config-item-info">
                <div class="config-item-name">${esc(u.nombre)}</div>
                <div class="config-item-detail">${esc(u.email || '')} · ${u.rol} · ${Number(u.comision_pct) || 0}% comisión</div>
              </div>
              <div class="config-item-actions">
                <button class="btn-icon" style="width:32px;height:32px" title="Editar"
                        onclick="Config.editUsuario('${u.id}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-block mt-8" onclick="Config.showInviteForm()">+ Invitar usuario</button>
        <div id="config-invite-slot"></div>
      </div>
    `;
  },

  async toggleTipo(id, newState) {
    const { error } = await db.from('tipos_alfajor').update({ activo: newState }).eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast(newState ? 'Tipo activado' : 'Tipo desactivado');
    Config.loadData();
  },

  editTipo(id) {
    const tipo = Tipos.cache.find(t => t.id === id);
    if (!tipo) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Editar tipo</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="edit-tipo-nombre" value="${esc(tipo.nombre)}">
        </div>
        <div class="form-group">
          <label class="form-label">Orden</label>
          <input class="form-input" id="edit-tipo-orden" type="number" value="${tipo.orden}">
        </div>
        <div class="form-group">
          <label class="form-label">Costo default</label>
          <input class="form-input" id="edit-tipo-costo" type="number" value="${tipo.costo_default || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="edit-tipo-reventa" ${tipo.es_reventa ? 'checked' : ''} style="margin-right:8px">
            Es reventa
          </label>
        </div>
        <button class="btn btn-primary btn-block" onclick="Config.saveTipo('${id}')">Guardar</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  async saveTipo(id) {
    const nombre = document.getElementById('edit-tipo-nombre').value.trim();
    const orden = parseInt(document.getElementById('edit-tipo-orden').value) || 0;
    const costoDefault = parseFloat(document.getElementById('edit-tipo-costo').value) || 0;
    const esReventa = document.getElementById('edit-tipo-reventa').checked;

    if (!nombre) { showToast('Ingresá un nombre'); return; }

    const { error } = await db.from('tipos_alfajor').update({
      nombre, orden, costo_default: costoDefault, es_reventa: esReventa
    }).eq('id', id);

    if (error) { showToast('Error: ' + error.message); return; }

    document.querySelector('.modal-overlay')?.remove();
    showToast('Tipo actualizado');
    Config.loadData();
  },

  addTipo() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Nuevo tipo</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="new-tipo-nombre" placeholder="Ej: Alfajor de dulce de leche">
        </div>
        <div class="form-group">
          <label class="form-label">Orden</label>
          <input class="form-input" id="new-tipo-orden" type="number" value="${Tipos.cache.length + 1}">
        </div>
        <div class="form-group">
          <label class="form-label">Costo default</label>
          <input class="form-input" id="new-tipo-costo" type="number" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="new-tipo-reventa" style="margin-right:8px">
            Es reventa
          </label>
        </div>
        <button class="btn btn-primary btn-block" onclick="Config.saveNewTipo()">Crear</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  async saveNewTipo() {
    const nombre = document.getElementById('new-tipo-nombre').value.trim();
    const orden = parseInt(document.getElementById('new-tipo-orden').value) || 0;
    const costoDefault = parseFloat(document.getElementById('new-tipo-costo').value) || 0;
    const esReventa = document.getElementById('new-tipo-reventa').checked;

    if (!nombre) { showToast('Ingresá un nombre'); return; }

    const { error } = await db.from('tipos_alfajor').insert({
      nombre, orden, costo_default: costoDefault, es_reventa: esReventa
    });

    if (error) { showToast('Error: ' + error.message); return; }

    document.querySelector('.modal-overlay')?.remove();
    showToast('Tipo creado');
    Config.loadData();
  },

  editUsuario(id) {
    const slot = document.getElementById('config-invite-slot');
    if (!slot) return;
    db.from('usuarios').select('*').eq('id', id).single().then(({ data: u }) => {
      if (!u) return;
      slot.innerHTML = `
        <div class="card mt-8">
          <h3 class="mb-8">${esc(u.nombre)}</h3>
          <div class="form-group">
            <label class="form-label">Comisión %</label>
            <input class="form-input" id="edit-user-comision" type="number" min="0" max="100" step="0.5"
                   value="${Number(u.comision_pct) || 0}" inputmode="decimal">
          </div>
          <div class="form-group">
            <label class="form-label">Rol</label>
            <div class="toggle-group">
              <button type="button" class="toggle-btn ${u.rol === 'repartidor' ? 'active' : ''}"
                      onclick="Config.setInviteRol(this, 'repartidor')">Repartidor</button>
              <button type="button" class="toggle-btn ${u.rol === 'admin' ? 'active' : ''}"
                      onclick="Config.setInviteRol(this, 'admin')">Admin</button>
            </div>
            <input type="hidden" id="invite-rol" value="${u.rol}">
          </div>
          <button class="btn btn-primary btn-block" onclick="Config.saveUsuario('${u.id}')">Guardar</button>
        </div>
      `;
    });
  },

  async saveUsuario(id) {
    const comision = parseFloat(document.getElementById('edit-user-comision').value) || 0;
    const rol = document.getElementById('invite-rol').value;
    const { error } = await db.from('usuarios').update({ comision_pct: comision, rol }).eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Usuario actualizado');
    document.getElementById('config-invite-slot').innerHTML = '';
    Config.loadData();
  },

  showInviteForm() {
    const slot = document.getElementById('config-invite-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="card mt-8">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="invite-email" type="email" placeholder="usuario@email.com">
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="invite-nombre" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña inicial</label>
          <input class="form-input" id="invite-pass" type="text" placeholder="Contraseña temporal">
        </div>
        <div class="form-group">
          <label class="form-label">Rol</label>
          <div class="toggle-group">
            <button type="button" class="toggle-btn active" onclick="Config.setInviteRol(this, 'repartidor')">Repartidor</button>
            <button type="button" class="toggle-btn" onclick="Config.setInviteRol(this, 'admin')">Admin</button>
          </div>
          <input type="hidden" id="invite-rol" value="repartidor">
        </div>
        <div class="form-group">
          <label class="form-label">Comisión %</label>
          <input class="form-input" id="invite-comision" type="number" min="0" max="100" step="0.5"
                 value="0" inputmode="decimal">
        </div>
        <button class="btn btn-primary btn-block" onclick="Config.sendInvite()">Crear usuario</button>
      </div>
    `;
  },

  setInviteRol(btn, rol) {
    const parent = btn.closest('.toggle-group');
    parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('invite-rol').value = rol;
  },

  async sendInvite() {
    const email = document.getElementById('invite-email').value.trim();
    const nombre = document.getElementById('invite-nombre').value.trim();
    const pass = document.getElementById('invite-pass').value;
    const rol = document.getElementById('invite-rol').value;

    if (!email || !nombre || !pass) {
      showToast('Completá todos los campos');
      return;
    }

    if (pass.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      // Save admin session before signUp (it may create a new session)
      const { data: adminSession } = await db.auth.getSession();

      const { data, error } = await db.auth.signUp({
        email,
        password: pass,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: { nombre: nombre }
        }
      });
      if (error) throw error;

      // Restore admin session if signUp changed it
      const { data: currentSession } = await db.auth.getSession();
      if (adminSession?.session && currentSession?.session?.user?.id !== adminSession.session.user.id) {
        await db.auth.setSession(adminSession.session);
      }

      if (data.user) {
        // Insert into usuarios table (works even if email not yet confirmed)
        const { error: insertErr } = await db.from('usuarios').insert({
          id: data.user.id,
          nombre: nombre,
          email: email,
          rol: rol,
          comision_pct: parseFloat(document.getElementById('invite-comision').value) || 0
        });
        // Ignore duplicate key error (user may already exist)
        if (insertErr && !insertErr.message.includes('duplicate')) throw insertErr;
      }

      showToast('Usuario creado — ya puede iniciar sesión');
      document.getElementById('config-invite-slot').innerHTML = '';
      Config.loadData();
    } catch (err) {
      console.error('Error invitando usuario:', err);
      showToast('Error: ' + (err.message || err));
    }
  }
};
