const Entregas = {
  _DRAFT_KEY: 'entrega_draft',

  renderForm(entrega) {
    const isEdit = !!entrega;
    const e = entrega || {};

    Promise.all([Puntos.fetchAll(), Tipos.fetchAll()]).then(async () => {
      let existingLineas = [];
      if (isEdit) {
        const { data } = await db.from('entrega_lineas')
          .select('*')
          .eq('entrega_id', e.id);
        existingLineas = data || [];
      }

      // Build a map of existing lines by tipo_alfajor_id
      const lineaMap = {};
      existingLineas.forEach(l => { lineaMap[l.tipo_alfajor_id] = l; });

      const now = new Date();
      const toLocalISO = (d) => {
        const off = d.getTimezoneOffset();
        const local = new Date(d.getTime() - off * 60000);
        return local.toISOString().slice(0, 16);
      };
      const fechaDefault = e.fecha_hora
        ? toLocalISO(new Date(e.fecha_hora))
        : toLocalISO(now);

      const tipos = Tipos.activos();

      // Restore draft for new entregas
      const draft = !isEdit ? Entregas._loadDraft() : null;

      // Admin can assign to another repartidor
      let vendedorSelector = '';
      if (Auth.isAdmin()) {
        const { data: usuarios } = await db.from('usuarios').select('id, nombre');
        const selId = draft?.vendedorId || e.repartidor_id || Auth.currentUser.id;
        const opts = (usuarios || []).map(u =>
          `<option value="${u.id}" ${u.id === selId ? 'selected' : ''}>${esc(u.nombre)}</option>`
        ).join('');
        vendedorSelector = `
          <div class="form-group">
            <label class="form-label">Vendedor</label>
            <select class="form-select" id="ent-vendedor">${opts}</select>
          </div>
        `;
      }

      const selectedPuntoId = draft?.puntoId || e.punto_entrega_id || '';

      App.setContent(`
        <div class="app-header">
          <h1>${isEdit ? 'Editar entrega' : 'Nueva entrega'}</h1>
          ${isEdit ? `<button class="btn-icon" onclick="window.location.hash='#/historial'">&times;</button>` : ''}
        </div>

        <form onsubmit="Entregas.handleSave(event, ${isEdit ? `'${e.id}'` : 'null'})">
          <div class="form-group">
            <label class="form-label">Punto de entrega</label>
            ${Puntos.renderSelector(selectedPuntoId)}
          </div>

          <div id="nuevo-punto-fields" class="hidden">
            <div class="form-group">
              <label class="form-label">Nombre del punto *</label>
              <input class="form-input" id="ent-punto-nombre" placeholder="Ej: Kiosco Don Pedro">
            </div>
            <div class="form-group">
              <label class="form-label">Direccion</label>
              <input class="form-input" id="ent-punto-dir" placeholder="Calle y numero">
            </div>
            <div class="form-group">
              <label class="form-label">Contacto</label>
              <input class="form-input" id="ent-punto-contacto" placeholder="Nombre de la persona">
            </div>
            <div class="form-group">
              <label class="form-label">Telefono</label>
              <input class="form-input" id="ent-punto-tel" type="tel" placeholder="Ej: 261-555-1234">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Quien recibio?</label>
            <input class="form-input" id="ent-recibio" value="${esc(draft?.recibio || e.recibio || '')}" placeholder="Nombre de quien recibio">
          </div>

          ${vendedorSelector}

          <div class="section-title">Alfajores</div>
          <div id="ent-lineas">
            ${tipos.map(t => {
              const linea = lineaMap[t.id];
              const draftLine = draft?.lines?.[t.id];
              const cant = linea ? linea.cantidad : (draftLine?.cant || '');
              const precio = linea ? linea.precio_unitario : (draftLine?.precio || Tipos.getLastPrecio(t.id));
              const costo = linea ? linea.costo_unitario : (draftLine?.costo || Tipos.getLastCosto(t.id) || t.costo_default || '');
              return `
                <div class="type-line" data-tipo-id="${t.id}">
                  <div class="type-line-name">
                    ${esc(t.nombre)}${t.es_reventa ? '<span class="reventa-tag">Reventa</span>' : ''}
                  </div>
                  <div class="type-line-fields">
                    <div>
                      <label>Cant.</label>
                      <input class="form-input ent-line-cant" type="number" min="0" step="1"
                             value="${cant}" placeholder="0" inputmode="numeric"
                             oninput="Entregas.calcTotal()">
                    </div>
                    <div>
                      <label>Precio</label>
                      <input class="form-input ent-line-precio" type="number" min="0" step="1"
                             value="${precio}" placeholder="$0" inputmode="numeric"
                             oninput="Entregas.calcTotal()">
                    </div>
                    <div class="ent-costo-col hidden">
                      <label>Costo</label>
                      <input class="form-input ent-line-costo" type="number" min="0" step="1"
                             value="${costo}" placeholder="$0" inputmode="numeric">
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <a href="#" class="ajustar-costos-link" onclick="Entregas.toggleCostos(event)">Ajustar costos</a>

          <div class="form-group">
            <label class="form-label">Total</label>
            <input class="form-input" id="ent-total" type="number" readonly
                   value="${e.monto_total || ''}" style="color:var(--accent);font-weight:700">
          </div>

          <div class="section-title">Pago</div>
          <div class="pago-split-row">
            <div class="form-group">
              <label class="form-label">Efectivo</label>
              <input class="form-input" id="ent-pago-efectivo" type="number" min="0" step="1"
                     placeholder="$0" inputmode="numeric"
                     value="${draft?.pagoEfectivo || e._pagoEfectivo || ''}"
                     oninput="Entregas.calcPagado()">
            </div>
            <div class="form-group">
              <label class="form-label">Transferencia</label>
              <input class="form-input" id="ent-pago-transfer" type="number" min="0" step="1"
                     placeholder="$0" inputmode="numeric"
                     value="${draft?.pagoTransfer || e._pagoTransfer || ''}"
                     oninput="Entregas.calcPagado()">
            </div>
          </div>
          <div class="pago-summary" id="pago-summary"></div>

          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea class="form-textarea" id="ent-notas" placeholder="Observaciones (opcional)">${esc(draft?.notas || e.notas || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Fecha y hora</label>
            <input class="form-input" id="ent-fecha" type="datetime-local" value="${draft?.fecha || fechaDefault}">
          </div>

          <button class="btn btn-primary btn-block btn-lg mt-16" type="submit" id="ent-submit">
            ${isEdit ? 'Actualizar' : 'Guardar entrega'}
          </button>
        </form>
      `);

      // Recalculate totals if draft restored values
      if (draft) {
        Entregas.calcTotal();
        Entregas.calcPagado();
        // Restore nuevo-punto fields if draft had __nuevo__ selected
        if (draft.puntoId === '__nuevo__') {
          document.getElementById('nuevo-punto-fields')?.classList.remove('hidden');
          const npNombre = document.getElementById('ent-punto-nombre');
          const npDir = document.getElementById('ent-punto-dir');
          const npContacto = document.getElementById('ent-punto-contacto');
          const npTel = document.getElementById('ent-punto-tel');
          if (npNombre) npNombre.value = draft.nuevoPuntoNombre || '';
          if (npDir) npDir.value = draft.nuevoPuntoDir || '';
          if (npContacto) npContacto.value = draft.nuevoPuntoContacto || '';
          if (npTel) npTel.value = draft.nuevoPuntoTel || '';
        }
      }

      // Attach draft-save listeners for new entregas
      if (!isEdit) {
        Entregas._attachDraftListeners();
      }
    });

    return '<div class="loading-screen"><div class="spinner"></div></div>';
  },

  toggleCostos(ev) {
    ev.preventDefault();
    const link = ev.target;
    const showing = link.classList.toggle('active');
    link.textContent = showing ? 'Ocultar costos' : 'Ajustar costos';
    document.querySelectorAll('.ent-costo-col').forEach(el => el.classList.toggle('hidden', !showing));
  },

  calcTotal() {
    let total = 0;
    document.querySelectorAll('.type-line').forEach(line => {
      const cant = parseInt(line.querySelector('.ent-line-cant').value) || 0;
      const precio = parseFloat(line.querySelector('.ent-line-precio').value) || 0;
      total += cant * precio;
    });
    total = Math.round(total * 100) / 100;
    document.getElementById('ent-total').value = total;
  },

  calcPagado() {
    const ef = parseFloat(document.getElementById('ent-pago-efectivo').value) || 0;
    const tr = parseFloat(document.getElementById('ent-pago-transfer').value) || 0;
    const total = parseFloat(document.getElementById('ent-total').value) || 0;
    const pagado = ef + tr;
    const sumEl = document.getElementById('pago-summary');
    if (pagado > 0 && pagado < total) {
      sumEl.textContent = 'Pagado: ' + fmtMoney(pagado) + ' — Fiado: ' + fmtMoney(total - pagado);
      sumEl.className = 'pago-summary warn';
    } else if (pagado >= total && total > 0) {
      sumEl.textContent = 'Pagado: ' + fmtMoney(pagado);
      sumEl.className = 'pago-summary ok';
    } else {
      sumEl.textContent = total > 0 ? 'Fiado: ' + fmtMoney(total) : '';
      sumEl.className = 'pago-summary';
    }
  },

  _detectFormaPago() {
    const ef = parseFloat(document.getElementById('ent-pago-efectivo').value) || 0;
    const tr = parseFloat(document.getElementById('ent-pago-transfer').value) || 0;
    if (ef > 0 && tr > 0) return 'mixto';
    if (ef > 0) return 'efectivo';
    if (tr > 0) return 'transferencia';
    return 'fiado';
  },

  /** Collect line data from the form */
  _collectLines() {
    const lines = [];
    document.querySelectorAll('.type-line').forEach(lineEl => {
      const tipoId = lineEl.dataset.tipoId;
      const cant = parseInt(lineEl.querySelector('.ent-line-cant').value) || 0;
      const precio = parseFloat(lineEl.querySelector('.ent-line-precio').value) || 0;
      const costoInput = parseFloat(lineEl.querySelector('.ent-line-costo').value) || 0;
      const tipo = Tipos.cache.find(t => t.id === tipoId);
      const costo = costoInput || (tipo ? parseFloat(tipo.costo_default) || 0 : 0);
      if (cant > 0) {
        lines.push({
          tipo_alfajor_id: tipoId,
          cantidad: cant,
          precio_unitario: Math.round(precio * 100) / 100,
          costo_unitario: Math.round(costo * 100) / 100
        });
        Tipos.saveLast(tipoId, precio, costo);
      }
    });
    return lines;
  },

  /** Save current form state to localStorage */
  _saveDraft() {
    const lines = {};
    document.querySelectorAll('.type-line').forEach(lineEl => {
      const tipoId = lineEl.dataset.tipoId;
      lines[tipoId] = {
        cant: lineEl.querySelector('.ent-line-cant').value,
        precio: lineEl.querySelector('.ent-line-precio').value,
        costo: lineEl.querySelector('.ent-line-costo').value
      };
    });
    const draft = {
      puntoId: document.getElementById('ent-punto')?.value || '',
      recibio: document.getElementById('ent-recibio')?.value || '',
      vendedorId: document.getElementById('ent-vendedor')?.value || '',
      lines,
      pagoEfectivo: document.getElementById('ent-pago-efectivo')?.value || '',
      pagoTransfer: document.getElementById('ent-pago-transfer')?.value || '',
      notas: document.getElementById('ent-notas')?.value || '',
      fecha: document.getElementById('ent-fecha')?.value || '',
      nuevoPuntoNombre: document.getElementById('ent-punto-nombre')?.value || '',
      nuevoPuntoDir: document.getElementById('ent-punto-dir')?.value || '',
      nuevoPuntoContacto: document.getElementById('ent-punto-contacto')?.value || '',
      nuevoPuntoTel: document.getElementById('ent-punto-tel')?.value || '',
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(Entregas._DRAFT_KEY, JSON.stringify(draft));
    } catch (_) { showToast('No se pudo guardar borrador'); }
  },

  _loadDraft() {
    try {
      const raw = localStorage.getItem(Entregas._DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      // Discard drafts older than 24 hours
      if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(Entregas._DRAFT_KEY);
        return null;
      }
      // Filter out lines referencing deactivated/deleted tipos
      if (draft.lines) {
        const activoIds = new Set(Tipos.activos().map(t => t.id));
        for (const tipoId of Object.keys(draft.lines)) {
          if (!activoIds.has(tipoId)) delete draft.lines[tipoId];
        }
      }
      // Clear punto if it no longer exists in cache
      if (draft.puntoId && draft.puntoId !== '__nuevo__' && !Puntos.cache.find(p => p.id === draft.puntoId)) {
        draft.puntoId = '';
      }
      return draft;
    } catch (_) { return null; }
  },

  _clearDraft() {
    localStorage.removeItem(Entregas._DRAFT_KEY);
  },

  _attachDraftListeners() {
    const form = document.querySelector('form');
    if (!form) return;
    form.addEventListener('input', () => Entregas._saveDraft());
    form.addEventListener('change', () => Entregas._saveDraft());
  },

  async handleSave(ev, editId) {
    ev.preventDefault();
    const btn = document.getElementById('ent-submit');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      let puntoId = document.getElementById('ent-punto').value;

      // Create new punto if needed
      if (puntoId === '__nuevo__') {
        const nombre = document.getElementById('ent-punto-nombre').value.trim();
        const telefono = document.getElementById('ent-punto-tel').value.trim();
        if (!nombre) {
          showToast('Ingresa el nombre del punto');
          btn.disabled = false;
          btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
          return;
        }
        const punto = await Puntos.create({
          nombre,
          direccion: document.getElementById('ent-punto-dir').value.trim(),
          contacto: document.getElementById('ent-punto-contacto').value.trim(),
          telefono
        });
        puntoId = punto.id;
      }

      const lines = Entregas._collectLines();
      if (lines.length === 0) {
        showToast('Ingresa al menos un tipo de alfajor');
        btn.disabled = false;
        btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
        return;
      }
      if (lines.some(l => l.precio_unitario < 0 || l.costo_unitario < 0)) {
        showToast('Los precios y costos deben ser positivos');
        btn.disabled = false;
        btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
        return;
      }

      // Calculate aggregates
      const cantidadTotal = lines.reduce((s, l) => s + l.cantidad, 0);
      const montoTotal = Math.round(lines.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0) * 100) / 100;
      const precioPromedio = cantidadTotal > 0 ? montoTotal / cantidadTotal : 0;

      const fechaRaw = document.getElementById('ent-fecha').value;
      const fechaISO = new Date(fechaRaw).toISOString();

      const pagoEf = parseFloat(document.getElementById('ent-pago-efectivo').value) || 0;
      const pagoTr = parseFloat(document.getElementById('ent-pago-transfer').value) || 0;
      if (pagoEf + pagoTr > montoTotal) {
        showToast('El pago no puede superar el total');
        btn.disabled = false;
        btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
        return;
      }

      const repartidorId = document.getElementById('ent-vendedor')
        ? document.getElementById('ent-vendedor').value
        : Auth.currentUser.id;

      const row = {
        fecha_hora: fechaISO,
        repartidor_id: repartidorId,
        punto_entrega_id: puntoId || null,
        punto_nombre_temp: puntoId ? '' : '',
        recibio: document.getElementById('ent-recibio').value.trim(),
        cantidad: cantidadTotal,
        precio_unitario: precioPromedio,
        monto_total: montoTotal,
        monto_pagado: pagoEf + pagoTr,
        forma_pago: Entregas._detectFormaPago(),
        notas: document.getElementById('ent-notas').value.trim()
      };

      let entregaId = editId;

      if (editId) {
        // Don't overwrite monto_pagado/forma_pago during edit — managed by pagos system
        const { monto_pagado: _mp, forma_pago: _fp, ...editRow } = row;
        const { error } = await db.from('entregas').update(editRow).eq('id', editId);
        if (error) throw error;

        // Delete old lines first to avoid unique constraint violation
        // (entrega_id + tipo_alfajor_id must be unique)
        await db.from('entrega_lineas').delete().eq('entrega_id', editId);

        // Insert new lines
        const lineRows = lines.map(l => ({ ...l, entrega_id: entregaId }));
        const { error: lineErr } = await db.from('entrega_lineas').insert(lineRows);
        if (lineErr) throw lineErr;
      } else {
        const { data, error } = await db.from('entregas').insert(row).select().single();
        if (error) throw error;
        entregaId = data.id;

        // Insert lines
        const lineRows = lines.map(l => ({ ...l, entrega_id: entregaId }));
        const { error: lineErr } = await db.from('entrega_lineas').insert(lineRows);
        if (lineErr) {
          await db.from('entregas').delete().eq('id', entregaId);
          throw lineErr;
        }
      }

      // Register initial payments (one per method used)
      if (!editId) {
        const pagosToInsert = [];
        if (pagoEf > 0) pagosToInsert.push({ entrega_id: entregaId, monto: pagoEf, forma_pago: 'efectivo', registrado_por: Auth.currentUser.id });
        if (pagoTr > 0) pagosToInsert.push({ entrega_id: entregaId, monto: pagoTr, forma_pago: 'transferencia', registrado_por: Auth.currentUser.id });
        if (pagosToInsert.length > 0) {
          await db.from('pagos').insert(pagosToInsert);
        }
      }

      // Clear draft on successful save
      Entregas._clearDraft();

      showToast(editId ? 'Entrega actualizada' : 'Entrega guardada');
      // Capture GPS for punto if missing coords
      if (puntoId && navigator.geolocation) {
        const punto = Puntos.cache.find(p => p.id === puntoId);
        if (punto && punto.lat == null) {
          navigator.geolocation.getCurrentPosition(async (pos) => {
            await db.from('puntos_entrega').update({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            }).eq('id', puntoId);
            // Keep cache in sync so next delivery doesn't re-fire
            const cached = Puntos.cache.find(p => p.id === puntoId);
            if (cached) { cached.lat = pos.coords.latitude; cached.lng = pos.coords.longitude; }
          }, () => {});
        }
      }
      window.location.hash = '#/';
    } catch (err) {
      console.error('Error guardando entrega:', err);
      showToast('Error: ' + friendlyError(err));
      btn.disabled = false;
      btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
    }
  }
};
