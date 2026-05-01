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
      document.removeEventListener('click', Puntos._closeHandler);
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
      const typed = searchInput.value.trim();
      hiddenInput.value = '__nuevo__';
      searchInput.value = '';
      dropdown?.classList.add('hidden');
      document.getElementById('nuevo-punto-fields')?.classList.remove('hidden');
      const nombreInput = document.getElementById('ent-punto-nombre');
      if (nombreInput && typed) {
        nombreInput.value = typed;
        nombreInput.focus();
      }
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
          <label class="form-label">Telefono</label>
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
  },

  renderFilterCombobox(opts) {
    const { inputId, hiddenId, dropdownId, includeAll = true } = opts;
    const placeholder = includeAll ? 'Todos los puntos' : 'Buscar punto...';
    return `
      <div class="punto-selector" id="${inputId}-wrap" data-include-all="${includeAll}">
        <input class="form-input" id="${inputId}" type="text"
               placeholder="${placeholder}" autocomplete="off"
               onfocus="Puntos._openFilterDropdown('${inputId}', '${hiddenId}', '${dropdownId}')"
               oninput="Puntos._onFilterInput('${inputId}', '${hiddenId}', '${dropdownId}')">
        <input type="hidden" id="${hiddenId}" value="">
        <div class="punto-dropdown hidden" id="${dropdownId}"></div>
      </div>
    `;
  },

  _openFilterDropdown(inputId, hiddenId, dropdownId) {
    const dd = document.getElementById(dropdownId);
    if (!dd) return;
    dd.classList.remove('hidden');
    Puntos._renderFilterOptions(inputId, hiddenId, dropdownId);
    setTimeout(() => {
      const handler = (e) => {
        const wrap = document.getElementById(inputId + '-wrap');
        if (wrap && !wrap.contains(e.target)) {
          dd.classList.add('hidden');
          document.removeEventListener('click', handler);
        }
      };
      document.removeEventListener('click', Puntos._closeFilterHandler);
      Puntos._closeFilterHandler = handler;
      document.addEventListener('click', handler);
    }, 0);
  },

  _onFilterInput(inputId, hiddenId, dropdownId) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = '';
    Puntos._renderFilterOptions(inputId, hiddenId, dropdownId);
    input.dispatchEvent(new CustomEvent('punto-text-change', {
      bubbles: true, detail: { text: input.value }
    }));
  },

  _renderFilterOptions(inputId, hiddenId, dropdownId) {
    const input = document.getElementById(inputId);
    const dd = document.getElementById(dropdownId);
    const wrap = document.getElementById(inputId + '-wrap');
    if (!input || !dd || !wrap) return;
    const includeAll = wrap.dataset.includeAll === 'true';

    const q = (input.value || '').toLowerCase();
    const matches = Puntos.cache.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.direccion || '').toLowerCase().includes(q)
    );

    const allOpt = includeAll ? `
      <div class="punto-option" onclick="Puntos._selectFilterOption('${inputId}', '${hiddenId}', '${dropdownId}', '', '')">
        <div class="punto-option-name">Todos los puntos</div>
      </div>
    ` : '';

    dd.innerHTML = allOpt + matches.map(p => `
      <div class="punto-option" onclick="Puntos._selectFilterOption('${inputId}', '${hiddenId}', '${dropdownId}', '${p.id}', '${escJs(p.nombre)}')">
        <div class="punto-option-name">${esc(p.nombre)}</div>
        ${p.direccion ? `<div class="punto-option-detail">${esc(p.direccion)}</div>` : ''}
      </div>
    `).join('');
  },

  _selectFilterOption(inputId, hiddenId, dropdownId, puntoId, puntoNombre) {
    const input = document.getElementById(inputId);
    const hidden = document.getElementById(hiddenId);
    const dd = document.getElementById(dropdownId);
    if (input) input.value = puntoNombre;
    if (hidden) hidden.value = puntoId;
    if (dd) dd.classList.add('hidden');
    if (Puntos._closeFilterHandler) document.removeEventListener('click', Puntos._closeFilterHandler);
    input.dispatchEvent(new CustomEvent('punto-select', {
      bubbles: true, detail: { puntoId, puntoNombre }
    }));
  },
};
