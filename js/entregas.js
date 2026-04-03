const Entregas = {
  lastPrecio: null,

  renderForm(entrega) {
    // entrega is optional — if passed, we're editing
    const isEdit = !!entrega;
    const e = entrega || {};

    // Fetch puntos first, then render
    Puntos.fetchAll().then(() => {
      const now = new Date();
      const fechaDefault = e.fecha_hora
        ? new Date(e.fecha_hora).toISOString().slice(0, 16)
        : now.toISOString().slice(0, 16);

      App.setContent(`
        <div class="app-header">
          <h1>${isEdit ? 'Editar entrega' : 'Nueva entrega'}</h1>
          ${isEdit ? `<button class="btn-icon" onclick="window.location.hash='#/historial'">&times;</button>` : ''}
        </div>

        <form onsubmit="Entregas.handleSave(event, ${isEdit ? `'${e.id}'` : 'null'})">
          <div class="form-group">
            <label class="form-label">Punto de entrega</label>
            ${Puntos.renderSelector(e.punto_entrega_id)}
          </div>

          <div id="nuevo-punto-fields" class="hidden">
            <div class="form-group">
              <label class="form-label">Nombre del punto</label>
              <input class="form-input" id="ent-punto-nombre" placeholder="Ej: Kiosco Don Pedro">
            </div>
            <div class="form-group">
              <label class="form-label">Dirección</label>
              <input class="form-input" id="ent-punto-dir" placeholder="Calle y número">
            </div>
            <div class="form-group">
              <label class="form-label">Contacto</label>
              <input class="form-input" id="ent-punto-contacto" placeholder="Nombre de la persona">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">¿Quién recibió?</label>
            <input class="form-input" id="ent-recibio" value="${esc(e.recibio || '')}" placeholder="Nombre de quien recibió">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group">
              <label class="form-label">Cantidad</label>
              <input class="form-input" id="ent-cantidad" type="number" min="1" step="1"
                     value="${e.cantidad || ''}" placeholder="0"
                     inputmode="numeric" oninput="Entregas.calcTotal()">
            </div>
            <div class="form-group">
              <label class="form-label">Precio unitario</label>
              <input class="form-input" id="ent-precio" type="number" min="0" step="1"
                     value="${e.precio_unitario || Entregas.lastPrecio || ''}" placeholder="$0"
                     inputmode="numeric" oninput="Entregas.calcTotal()">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Total</label>
            <input class="form-input" id="ent-total" type="number" readonly
                   value="${e.monto_total || ''}" style="color:var(--accent);font-weight:700">
          </div>

          <div class="form-group">
            <label class="form-label">Monto pagado</label>
            <input class="form-input" id="ent-pagado" type="number" min="0" step="1"
                   value="${e.monto_pagado || ''}" placeholder="$0" inputmode="numeric">
          </div>

          <div class="form-group">
            <label class="form-label">Forma de pago</label>
            <div class="toggle-group">
              <button type="button" class="toggle-btn ${(e.forma_pago || 'efectivo') === 'efectivo' ? 'active' : ''}"
                      onclick="Entregas.setPago(this, 'efectivo')">Efectivo</button>
              <button type="button" class="toggle-btn ${e.forma_pago === 'transferencia' ? 'active' : ''}"
                      onclick="Entregas.setPago(this, 'transferencia')">Transfer.</button>
              <button type="button" class="toggle-btn ${e.forma_pago === 'fiado' ? 'active' : ''}"
                      onclick="Entregas.setPago(this, 'fiado')">Fiado</button>
            </div>
            <input type="hidden" id="ent-forma-pago" value="${e.forma_pago || 'efectivo'}">
          </div>

          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea class="form-textarea" id="ent-notas" placeholder="Observaciones (opcional)">${esc(e.notas || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Fecha y hora</label>
            <input class="form-input" id="ent-fecha" type="datetime-local" value="${fechaDefault}">
          </div>

          <button class="btn btn-primary btn-block btn-lg mt-16" type="submit" id="ent-submit">
            ${isEdit ? 'Actualizar' : 'Guardar entrega'}
          </button>
        </form>
      `);
    });

    return '<div class="loading-screen"><div class="spinner"></div></div>';
  },

  onPuntoChange() {
    const val = document.getElementById('ent-punto').value;
    const fields = document.getElementById('nuevo-punto-fields');
    fields.classList.toggle('hidden', val !== '__nuevo__');
  },

  calcTotal() {
    const cant = parseFloat(document.getElementById('ent-cantidad').value) || 0;
    const precio = parseFloat(document.getElementById('ent-precio').value) || 0;
    document.getElementById('ent-total').value = cant * precio;
  },

  setPago(btn, value) {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ent-forma-pago').value = value;
    // If fiado, set monto_pagado to 0
    if (value === 'fiado') {
      document.getElementById('ent-pagado').value = 0;
    }
  },

  async handleSave(e, editId) {
    e.preventDefault();
    const btn = document.getElementById('ent-submit');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    let puntoId = document.getElementById('ent-punto').value;

    // Create new punto if needed
    if (puntoId === '__nuevo__') {
      const nombre = document.getElementById('ent-punto-nombre').value.trim();
      if (!nombre) {
        showToast('Ingresá el nombre del punto');
        btn.disabled = false;
        btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
        return;
      }
      const punto = await Puntos.create({
        nombre,
        direccion: document.getElementById('ent-punto-dir').value.trim(),
        contacto: document.getElementById('ent-punto-contacto').value.trim()
      });
      puntoId = punto.id;
    }

    const cantidad = parseInt(document.getElementById('ent-cantidad').value) || 0;
    const precio = parseFloat(document.getElementById('ent-precio').value) || 0;

    if (cantidad <= 0) {
      showToast('Ingresá la cantidad');
      btn.disabled = false;
      btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
      return;
    }

    const row = {
      fecha_hora: document.getElementById('ent-fecha').value,
      repartidor_id: Auth.currentUser.id,
      punto_entrega_id: puntoId || null,
      punto_nombre_temp: puntoId ? '' : document.getElementById('ent-punto-nombre')?.value.trim() || '',
      recibio: document.getElementById('ent-recibio').value.trim(),
      cantidad,
      precio_unitario: precio,
      monto_total: cantidad * precio,
      monto_pagado: parseFloat(document.getElementById('ent-pagado').value) || 0,
      forma_pago: document.getElementById('ent-forma-pago').value,
      notas: document.getElementById('ent-notas').value.trim()
    };

    // Remember last price
    Entregas.lastPrecio = precio;

    let error;
    if (editId) {
      ({ error } = await db.from('entregas').update(row).eq('id', editId));
    } else {
      ({ error } = await db.from('entregas').insert(row));
    }

    if (error) {
      showToast('Error al guardar: ' + error.message);
      btn.disabled = false;
      btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
      return;
    }

    showToast(editId ? 'Entrega actualizada' : 'Entrega guardada');
    window.location.hash = '#/';
  }
};
