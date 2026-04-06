const Puntos = {
  cache: [],

  async fetchAll() {
    const { data, error } = await db
      .from('puntos_entrega')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    if (error) console.error('Error cargando puntos:', error);
    Puntos.cache = data || [];
    return Puntos.cache;
  },

  /** Return puntos visible to the current user (repartidor sees own, admin sees all) */
  myPuntos() {
    if (Auth.isAdmin()) return Puntos.cache;
    return Puntos.cache.filter(p => p.creado_por === Auth.currentUser.id);
  },

  async create(punto) {
    const { data, error } = await db
      .from('puntos_entrega')
      .insert({
        nombre: punto.nombre,
        direccion: punto.direccion || '',
        contacto: punto.contacto || '',
        telefono: punto.telefono || '',
        notas: punto.notas || '',
        creado_por: Auth.currentUser.id
      })
      .select()
      .single();
    if (error) throw error;
    Puntos.cache.push(data);
    return data;
  },

  async update(id, fields) {
    const { error } = await db.from('puntos_entrega').update(fields).eq('id', id);
    if (error) throw error;
    const cached = Puntos.cache.find(p => p.id === id);
    if (cached) Object.assign(cached, fields);
  },

  renderSelector(selectedId) {
    const puntos = Puntos.myPuntos();
    const selected = puntos.find(p => p.id === selectedId);
    return `
      <div class="punto-selector" id="punto-selector">
        <input class="form-input" id="ent-punto-search" type="text"
               placeholder="Buscar punto de entrega..."
               value="${selected ? esc(selected.nombre) : ''}"
               autocomplete="off"
               onfocus="Puntos.openDropdown()"
               oninput="Puntos.filterDropdown()">
        <input type="hidden" id="ent-punto" value="${selectedId || ''}">
        <div class="punto-dropdown hidden" id="punto-dropdown"></div>
      </div>
    `;
  },

  openDropdown() {
    const dropdown = document.getElementById('punto-dropdown');
    if (!dropdown) return;
    dropdown.classList.remove('hidden');
    Puntos.filterDropdown();
    setTimeout(() => {
      document.addEventListener('click', Puntos._closeHandler);
    }, 0);
  },

  _closeHandler(e) {
    const sel = document.getElementById('punto-selector');
    if (sel && !sel.contains(e.target)) {
      document.getElementById('punto-dropdown')?.classList.add('hidden');
      document.removeEventListener('click', Puntos._closeHandler);
    }
  },

  filterDropdown() {
    const input = document.getElementById('ent-punto-search');
    const dropdown = document.getElementById('punto-dropdown');
    if (!input || !dropdown) return;

    const query = input.value.toLowerCase();
    const puntos = Puntos.myPuntos().filter(p =>
      p.nombre.toLowerCase().includes(query) ||
      (p.direccion || '').toLowerCase().includes(query) ||
      (p.contacto || '').toLowerCase().includes(query)
    );

    dropdown.innerHTML = puntos.map(p => `
      <div class="punto-option" onclick="Puntos.selectPunto('${p.id}')">
        <div class="punto-option-name">${esc(p.nombre)}</div>
        ${p.direccion ? `<div class="punto-option-detail">${esc(p.direccion)}</div>` : ''}
      </div>
    `).join('') + `
      <div class="punto-option punto-option-new" onclick="Puntos.selectPunto('__nuevo__')">
        <div class="punto-option-name">+ Nuevo punto de entrega</div>
      </div>
    `;
  },

  selectPunto(id) {
    const hiddenInput = document.getElementById('ent-punto');
    const searchInput = document.getElementById('ent-punto-search');
    const dropdown = document.getElementById('punto-dropdown');

    if (id === '__nuevo__') {
      hiddenInput.value = '__nuevo__';
      searchInput.value = '';
      dropdown?.classList.add('hidden');
      document.getElementById('nuevo-punto-fields')?.classList.remove('hidden');
      document.removeEventListener('click', Puntos._closeHandler);
      return;
    }

    const punto = Puntos.cache.find(p => p.id === id);
    hiddenInput.value = id;
    searchInput.value = punto ? punto.nombre : '';
    dropdown?.classList.add('hidden');
    document.getElementById('nuevo-punto-fields')?.classList.add('hidden');
    document.removeEventListener('click', Puntos._closeHandler);
  },

  editPunto(id) {
    const p = Puntos.cache.find(x => x.id === id);
    if (!p) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Editar punto</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre *</label>
          <input class="form-input" id="edit-punto-nombre" value="${esc(p.nombre)}">
        </div>
        <div class="form-group">
          <label class="form-label">Direccion</label>
          <input class="form-input" id="edit-punto-dir" value="${esc(p.direccion || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Contacto</label>
          <input class="form-input" id="edit-punto-contacto" value="${esc(p.contacto || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Telefono *</label>
          <input class="form-input" id="edit-punto-tel" type="tel" value="${esc(p.telefono || '')}"
                 placeholder="Ej: 261-555-1234">
        </div>
        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="form-textarea" id="edit-punto-notas">${esc(p.notas || '')}</textarea>
        </div>
        <button class="btn btn-primary btn-block" onclick="Puntos.savePunto('${p.id}')">Guardar</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  async savePunto(id) {
    const nombre = document.getElementById('edit-punto-nombre').value.trim();
    const telefono = document.getElementById('edit-punto-tel').value.trim();
    if (!nombre) { showToast('Ingresa el nombre'); return; }
    if (!telefono) { showToast('El telefono es obligatorio'); return; }

    try {
      await Puntos.update(id, {
        nombre,
        direccion: document.getElementById('edit-punto-dir').value.trim(),
        contacto: document.getElementById('edit-punto-contacto').value.trim(),
        telefono,
        notas: document.getElementById('edit-punto-notas').value.trim()
      });
      document.querySelector('.modal-overlay')?.remove();
      showToast('Punto actualizado');
      if (App.currentRoute === '/config') Config.loadData();
    } catch (err) {
      showToast('Error: ' + (err.message || err));
    }
  }
};
