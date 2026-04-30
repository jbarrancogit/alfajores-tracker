const Historial = {
  filters: { periodo: 'semana', puntoId: '', puntoSearchText: '', repartidorId: '' },

  render() {
    Historial.loadData();
    return `
      <div class="app-header">
        <h1>Historial</h1>
      </div>
      <div class="filter-bar" id="hist-period-bar">
        <button class="filter-chip active" onclick="Historial.setPeriod(this, 'hoy')">Hoy</button>
        <button class="filter-chip" onclick="Historial.setPeriod(this, 'semana')">Semana</button>
        <button class="filter-chip" onclick="Historial.setPeriod(this, 'mes')">Mes</button>
        <button class="filter-chip" onclick="Historial.setPeriod(this, 'todo')">Todo</button>
      </div>
      <div id="hist-filters" class="mb-8" style="display:grid;grid-template-columns:1fr ${Auth.isAdmin() ? '1fr' : ''};gap:8px">
        <select class="form-select" id="hist-punto" onchange="Historial.onFilterChange()" style="min-height:40px;font-size:0.85rem">
          <option value="">Todos los puntos</option>
        </select>
        ${Auth.isAdmin() ? `
        <select class="form-select" id="hist-repartidor" onchange="Historial.onFilterChange()" style="min-height:40px;font-size:0.85rem">
          <option value="">Todos</option>
        </select>
        ` : ''}
      </div>
      <div id="hist-client-header"></div>
      <div id="hist-list"><div class="spinner mt-8"></div></div>
    `;
  },

  async loadData() {
    await Puntos.fetchAll();
    const puntoSel = document.getElementById('hist-punto');
    if (puntoSel) {
      const opts = Puntos.cache.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
      puntoSel.innerHTML = '<option value="">Todos los puntos</option>' + opts;
    }

    if (Auth.isAdmin()) {
      const { data: usuarios } = await db.from('usuarios').select('id, nombre');
      const repSel = document.getElementById('hist-repartidor');
      if (repSel && usuarios) {
        const opts = usuarios.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
        repSel.innerHTML = '<option value="">Todos</option>' + opts;
      }
    }

    if (!Historial.filters.periodo) Historial.filters.periodo = 'semana';
    const periodOrder = ['hoy', 'semana', 'mes', 'todo'];
    const chips = document.querySelectorAll('#hist-period-bar .filter-chip');
    chips.forEach(c => c.classList.remove('active'));
    const idx = periodOrder.indexOf(Historial.filters.periodo);
    chips[idx >= 0 ? idx : 1]?.classList.add('active');

    Historial.fetchEntregas();
  },

  setPeriod(chip, periodo) {
    document.querySelectorAll('#hist-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Historial.filters.periodo = periodo;
    Historial.fetchEntregas();
  },

  onFilterChange() {
    Historial.filters.puntoId = document.getElementById('hist-punto')?.value || '';
    const repEl = document.getElementById('hist-repartidor');
    Historial.filters.repartidorId = repEl ? repEl.value : '';
    Historial.fetchEntregas();
  },

  async fetchEntregas() {
    const listEl = document.getElementById('hist-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="spinner mt-8"></div>';
   try {
    Historial._fetchId = (Historial._fetchId || 0) + 1;
    const myFetchId = Historial._fetchId;

    let query = db.from('entregas')
      .select('*, puntos_entrega(nombre), entrega_lineas(*, tipos_alfajor(nombre))')
      .order('fecha_hora', { ascending: false });

    const now = new Date();
    if (Historial.filters.periodo === 'hoy') {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      query = query.gte('fecha_hora', today.toISOString());
    } else if (Historial.filters.periodo === 'semana') {
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('fecha_hora', weekAgo.toISOString());
    } else if (Historial.filters.periodo === 'mes') {
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
      query = query.gte('fecha_hora', monthAgo.toISOString());
    }

    if (Historial.filters.puntoId) {
      query = query.eq('punto_entrega_id', Historial.filters.puntoId);
    } else if (Historial.filters.puntoSearchText) {
      const ids = Historial._resolvePuntoIds(Historial.filters.puntoSearchText, Puntos.cache);
      if (ids && ids.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>Sin matches para esa búsqueda</p></div>';
        Historial._data = [];
        Historial._renderClientHeader && Historial._renderClientHeader();
        return;
      }
      if (ids && ids.length > 0) {
        query = query.in('punto_entrega_id', ids);
      }
    }

    if (Auth.isAdmin() && Historial.filters.repartidorId) {
      query = query.eq('repartidor_id', Historial.filters.repartidorId);
    } else if (!Auth.isAdmin()) {
      query = query.eq('repartidor_id', Auth.currentUser.id);
    }

    const { data } = await query.limit(100);

    if (myFetchId !== Historial._fetchId) return;

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Sin entregas en este período</p></div>';
      Historial._data = [];
      Historial._renderClientHeader();
      return;
    }

    listEl.innerHTML = data.map(e => {
      const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
      const lineas = (e.entrega_lineas || []);
      const resumen = lineas.length > 0
        ? lineas.map(l => `${l.cantidad} ${l.tipos_alfajor?.nombre || '?'}`).join(', ')
        : e.cantidad + ' uds';
      return `
        <div class="list-item" onclick="Historial.showDetail('${e.id}')">
          <div class="list-item-content">
            <div class="list-item-title">${esc(nombre)}</div>
            <div class="list-item-subtitle">${fmtDateTime(e.fecha_hora)} · ${esc(resumen)}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount">${fmtMoney(e.monto_total)}</div>
            ${Pagos.badge(e.monto_pagado, e.monto_total)}
          </div>
        </div>
      `;
    }).join('');

    if (data.length === 100) {
      listEl.innerHTML += '<p class="text-sm text-muted" style="text-align:center;padding:12px">Mostrando las últimas 100 entregas</p>';
    }

    Historial._data = data;
    Historial._renderClientHeader();
   } catch (err) {
    console.error('Historial error:', err);
    showToast('Error cargando historial');
   }
  },

  _resolvePuntoIds(text, cache) {
    if (!text) return null;
    const q = text.toLowerCase();
    return (cache || []).filter(p => (p.nombre || '').toLowerCase().includes(q)).map(p => p.id);
  },

  _data: [],

  async showDetail(id) {
   try {
    const e = Historial._data.find(x => x.id === id);
    if (!e) return;
    const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
    const saldo = Number(e.monto_total) - Number(e.monto_pagado);
    const lineas = e.entrega_lineas || [];

    // Fetch payment history
    const pagosHist = await Pagos.historial(e.id);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Detalle de entrega</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="card">
          <p><strong>Punto:</strong> ${esc(nombre)}</p>
          <p><strong>Recibió:</strong> ${esc(e.recibio || '-')}</p>
          <p><strong>Fecha:</strong> ${fmtDateTime(e.fecha_hora)}</p>

          ${lineas.length > 0 ? `
            <div class="detail-lines">
              ${lineas.map(l => `
                <div class="detail-line">
                  <span class="detail-line-type">${esc(l.tipos_alfajor?.nombre || '?')}</span>
                  <span>${l.cantidad} × ${fmtMoney(l.precio_unitario)} = ${fmtMoney(l.cantidad * l.precio_unitario)}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <p><strong>Cantidad:</strong> ${e.cantidad} unidades</p>
            <p><strong>Precio unitario:</strong> ${fmtMoney(e.precio_unitario)}</p>
          `}

          <p><strong>Total:</strong> ${fmtMoney(e.monto_total)}</p>
          <p><strong>Pagado:</strong> ${fmtMoney(e.monto_pagado)}</p>
          ${saldo > 0 ? `<p><strong>Debe:</strong> <span class="text-red">${fmtMoney(saldo)}</span></p>` : ''}
          <p><strong>Forma de pago:</strong> ${{efectivo:'Efectivo',transferencia:'Transferencia',transferencia_mauri:'Transfer. Mauri',mixto:'Mixto',fiado:'Fiado'}[e.forma_pago] || esc(e.forma_pago)}</p>
          ${e.notas ? `<p><strong>Notas:</strong> ${esc(e.notas)}</p>` : ''}
        </div>

        ${pagosHist.length > 0 ? `
          <div class="section-title">Historial de pagos</div>
          ${Pagos.renderHistorial(pagosHist, e.id)}
        ` : ''}

        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary w-full" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          ${saldo > 0 ? `<button class="btn btn-primary w-full" id="detail-pagar-btn">Registrar pago</button>` : ''}
          <button class="btn btn-secondary w-full" id="edit-entrega-btn">Editar</button>
          ${Auth.isAdmin() ? `<button class="btn btn-secondary w-full text-red" id="delete-entrega-btn">Eliminar</button>` : ''}
        </div>
        <div id="detail-pago-slot"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    if (saldo > 0) {
      document.getElementById('detail-pagar-btn').onclick = () => {
        document.getElementById('detail-pago-slot').innerHTML = Pagos.renderFormInline(e.id, saldo);
      };
    }

    document.getElementById('edit-entrega-btn').onclick = () => {
      overlay.remove();
      Entregas.renderForm(e);
    };
    const delBtn = document.getElementById('delete-entrega-btn');
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!confirm('¿Eliminar esta entrega y todos sus pagos?')) return;
        delBtn.disabled = true;
        try {
          const { error } = await db.from('entregas').delete().eq('id', e.id);
          if (error) throw error;
          showToast('Entrega eliminada');
          overlay.remove();
          Historial.fetchEntregas();
        } catch (err) {
          showToast('Error: ' + friendlyError(err));
          delBtn.disabled = false;
        }
      };
    }
   } catch (err) {
    console.error('Historial detail error:', err);
    showToast('Error cargando detalle');
   }
  },

  _aggregateClientHeader(entregas) {
    const puntos = new Set();
    let vendido = 0, cobrado = 0;
    (entregas || []).forEach(e => {
      vendido += Number(e.monto_total) || 0;
      cobrado += Number(e.monto_pagado) || 0;
      if (e.punto_entrega_id) puntos.add(e.punto_entrega_id);
    });
    return { vendido, cobrado, saldo: vendido - cobrado, puntosCount: puntos.size };
  },

  _renderClientHeader() {
    const headerEl = document.getElementById('hist-client-header');
    if (!headerEl) return;

    const hasFilter = Historial.filters.puntoId || Historial.filters.puntoSearchText;
    if (!hasFilter || !Historial._data || Historial._data.length === 0) {
      headerEl.innerHTML = '';
      return;
    }

    const agg = Historial._aggregateClientHeader(Historial._data);
    let title;
    if (Historial.filters.puntoId) {
      const p = Puntos.cache.find(x => x.id === Historial.filters.puntoId);
      title = p ? esc(p.nombre) : 'Cliente';
    } else {
      title = `"${esc(Historial.filters.puntoSearchText)}"`;
      if (agg.puntosCount > 1) title += ` <span class="text-sm text-muted">(${agg.puntosCount} puntos)</span>`;
    }

    const saldoColor = agg.saldo > 0 ? 'text-red' : 'text-green';
    const action = Historial.filters.puntoId
      ? (agg.saldo > 0 ? `<button class="btn btn-secondary btn-block mt-8" onclick="Pagos.showDeudorModal('${Historial.filters.puntoId}', '${escJs(title)}')">Ver cuenta corriente</button>` : '')
      : (agg.saldo > 0 ? `<button class="btn btn-secondary btn-block mt-8" onclick="Deudores.showFlatInvoicesModal('${escJs(Historial.filters.puntoSearchText)}')">Ver todas las facturas pendientes</button>` : '');

    headerEl.innerHTML = `
      <div class="metric-card" style="margin-bottom:8px">
        <div class="metric-label">${title}</div>
        <div class="text-sm">Vendido: ${fmtMoney(agg.vendido)} · Cobrado: ${fmtMoney(agg.cobrado)}</div>
        <div class="metric-value ${saldoColor}">Saldo: ${fmtMoney(agg.saldo)}</div>
        ${action}
      </div>
    `;
  }
};
