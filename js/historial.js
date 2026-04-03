const Historial = {
  filters: { periodo: 'semana', puntoId: '', repartidorId: '' },

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

    const chips = document.querySelectorAll('#hist-period-bar .filter-chip');
    chips.forEach(c => c.classList.remove('active'));
    chips[1]?.classList.add('active');
    Historial.filters.periodo = 'semana';

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

    let query = db.from('entregas')
      .select('*, puntos_entrega(nombre)')
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
    }

    if (Auth.isAdmin() && Historial.filters.repartidorId) {
      query = query.eq('repartidor_id', Historial.filters.repartidorId);
    } else if (!Auth.isAdmin()) {
      query = query.eq('repartidor_id', Auth.currentUser.id);
    }

    const { data } = await query.limit(100);

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Sin entregas en este período</p></div>';
      return;
    }

    listEl.innerHTML = data.map(e => {
      const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
      const pagado = Number(e.monto_pagado) >= Number(e.monto_total);
      return `
        <div class="list-item" onclick="Historial.showDetail('${e.id}')">
          <div class="list-item-content">
            <div class="list-item-title">${esc(nombre)}</div>
            <div class="list-item-subtitle">${fmtDateTime(e.fecha_hora)} · ${e.cantidad} uds · ${esc(e.recibio || '')}</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount">${fmtMoney(e.monto_total)}</div>
            <span class="badge ${pagado ? 'badge-green' : 'badge-red'}">${pagado ? 'Pagado' : 'Debe'}</span>
          </div>
        </div>
      `;
    }).join('');

    Historial._data = data;
  },

  _data: [],

  showDetail(id) {
    const e = Historial._data.find(x => x.id === id);
    if (!e) return;
    const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
    const pagado = Number(e.monto_pagado) >= Number(e.monto_total);
    const saldo = Number(e.monto_total) - Number(e.monto_pagado);

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
          <p><strong>Cantidad:</strong> ${e.cantidad} unidades</p>
          <p><strong>Precio unitario:</strong> ${fmtMoney(e.precio_unitario)}</p>
          <p><strong>Total:</strong> ${fmtMoney(e.monto_total)}</p>
          <p><strong>Pagado:</strong> ${fmtMoney(e.monto_pagado)}</p>
          ${saldo > 0 ? `<p><strong>Debe:</strong> <span class="text-red">${fmtMoney(saldo)}</span></p>` : ''}
          <p><strong>Forma de pago:</strong> ${esc(e.forma_pago)}</p>
          ${e.notas ? `<p><strong>Notas:</strong> ${esc(e.notas)}</p>` : ''}
        </div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary w-full" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          <button class="btn btn-primary w-full" id="edit-entrega-btn">Editar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('edit-entrega-btn').onclick = () => {
      overlay.remove();
      Entregas.renderForm(e);
    };
  }
};
