const Resumenes = {
  periodo: 'semana',

  render() {
    if (!Auth.isAdmin()) {
      return '<div class="empty-state"><p>Solo el administrador puede ver resúmenes</p></div>';
    }
    Resumenes.loadData();
    return `
      <div class="app-header">
        <h1>Resúmenes</h1>
      </div>
      <div class="filter-bar" id="res-period-bar">
        <button class="filter-chip" onclick="Resumenes.setPeriod(this, 'hoy')">Hoy</button>
        <button class="filter-chip active" onclick="Resumenes.setPeriod(this, 'semana')">Semana</button>
        <button class="filter-chip" onclick="Resumenes.setPeriod(this, 'mes')">Mes</button>
        <button class="filter-chip" onclick="Resumenes.setPeriod(this, 'todo')">Todo</button>
      </div>
      <div id="res-totals" class="metrics-grid mb-16">
        <div class="metric-card"><div class="metric-value">-</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">-</div><div class="metric-label">Cobrado</div></div>
        <div class="metric-card"><div class="metric-value">-</div><div class="metric-label">Pendiente</div></div>
      </div>
      <div class="section-title">Por punto de entrega</div>
      <div id="res-puntos"><div class="spinner mt-8"></div></div>
      <div class="section-title">Deudores</div>
      <div id="res-deudores"><div class="spinner mt-8"></div></div>
      <div class="section-title">Por repartidor</div>
      <div id="res-repartidores"><div class="spinner mt-8"></div></div>
    `;
  },

  setPeriod(chip, periodo) {
    document.querySelectorAll('#res-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Resumenes.periodo = periodo;
    Resumenes.loadData();
  },

  async loadData() {
    let query = db.from('entregas').select('*, puntos_entrega(nombre), usuarios(nombre)');

    const now = new Date();
    if (Resumenes.periodo === 'hoy') {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      query = query.gte('fecha_hora', today.toISOString());
    } else if (Resumenes.periodo === 'semana') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      query = query.gte('fecha_hora', d.toISOString());
    } else if (Resumenes.periodo === 'mes') {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      query = query.gte('fecha_hora', d.toISOString());
    }

    const { data } = await query;
    const entregas = data || [];

    const totalVendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);
    const totalCobrado = entregas.reduce((s, e) => s + Number(e.monto_pagado), 0);
    const totalPendiente = totalVendido - totalCobrado;

    const totalsEl = document.getElementById('res-totals');
    if (totalsEl) {
      totalsEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalVendido)}</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalCobrado)}</div><div class="metric-label">Cobrado</div></div>
        <div class="metric-card"><div class="metric-value" style="color:${totalPendiente > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(totalPendiente)}</div><div class="metric-label">Pendiente</div></div>
      `;
    }

    const puntoMap = {};
    entregas.forEach(e => {
      const key = e.punto_entrega_id || '__temp__';
      const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
      if (!puntoMap[key]) puntoMap[key] = { nombre, cantidad: 0, total: 0 };
      puntoMap[key].cantidad += e.cantidad;
      puntoMap[key].total += Number(e.monto_total);
    });
    const puntoRank = Object.values(puntoMap).sort((a, b) => b.total - a.total);

    const puntosEl = document.getElementById('res-puntos');
    if (puntosEl) {
      if (puntoRank.length === 0) {
        puntosEl.innerHTML = '<p class="text-sm text-muted">Sin datos</p>';
      } else {
        puntosEl.innerHTML = puntoRank.map(p => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${esc(p.nombre)}</div>
              <div class="list-item-subtitle">${p.cantidad} unidades</div>
            </div>
            <div class="list-item-right">
              <div class="list-item-amount">${fmtMoney(p.total)}</div>
            </div>
          </div>
        `).join('');
      }
    }

    const { data: allEntregas } = await db.from('entregas').select('punto_entrega_id, monto_total, monto_pagado, puntos_entrega(nombre)');
    const deudaMap = {};
    (allEntregas || []).forEach(e => {
      if (!e.punto_entrega_id) return;
      const key = e.punto_entrega_id;
      if (!deudaMap[key]) deudaMap[key] = { nombre: e.puntos_entrega?.nombre || '?', total: 0, pagado: 0 };
      deudaMap[key].total += Number(e.monto_total);
      deudaMap[key].pagado += Number(e.monto_pagado);
    });
    const deudores = Object.values(deudaMap)
      .map(d => ({ ...d, saldo: d.total - d.pagado }))
      .filter(d => d.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);

    const deudoresEl = document.getElementById('res-deudores');
    if (deudoresEl) {
      if (deudores.length === 0) {
        deudoresEl.innerHTML = '<p class="text-sm text-muted">Sin deudas pendientes</p>';
      } else {
        deudoresEl.innerHTML = deudores.map(d => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${esc(d.nombre)}</div>
              <div class="list-item-subtitle">Total: ${fmtMoney(d.total)} · Pagado: ${fmtMoney(d.pagado)}</div>
            </div>
            <div class="list-item-right">
              <div class="list-item-amount text-red">${fmtMoney(d.saldo)}</div>
            </div>
          </div>
        `).join('');
      }
    }

    const repMap = {};
    entregas.forEach(e => {
      const key = e.repartidor_id;
      const nombre = e.usuarios?.nombre || 'Desconocido';
      if (!repMap[key]) repMap[key] = { nombre, entregas: 0, total: 0, cobrado: 0 };
      repMap[key].entregas++;
      repMap[key].total += Number(e.monto_total);
      repMap[key].cobrado += Number(e.monto_pagado);
    });
    const repRank = Object.values(repMap).sort((a, b) => b.total - a.total);

    const repEl = document.getElementById('res-repartidores');
    if (repEl) {
      if (repRank.length === 0) {
        repEl.innerHTML = '<p class="text-sm text-muted">Sin datos</p>';
      } else {
        repEl.innerHTML = repRank.map(r => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${esc(r.nombre)}</div>
              <div class="list-item-subtitle">${r.entregas} entregas · Cobró ${fmtMoney(r.cobrado)}</div>
            </div>
            <div class="list-item-right">
              <div class="list-item-amount">${fmtMoney(r.total)}</div>
            </div>
          </div>
        `).join('');
      }
    }
  }
};
