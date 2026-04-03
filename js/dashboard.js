const Dashboard = {
  render() {
    Dashboard.loadData();
    return `
      <div class="app-header">
        <h1>Alfajores Tracker</h1>
        <button class="btn-icon" onclick="Auth.logout()" title="Cerrar sesión">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
      <div id="dash-metrics" class="metrics-grid">
        <div class="metric-card"><div class="metric-value">-</div><div class="metric-label">Entregas</div></div>
        <div class="metric-card"><div class="metric-value">-</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">-</div><div class="metric-label">Cobrado</div></div>
      </div>
      <button class="btn btn-primary btn-block btn-lg mb-16" onclick="window.location.hash='#/entrega'">
        + Nueva entrega
      </button>
      <div class="section-title">Deudores</div>
      <div id="dash-deudores"><div class="spinner mt-8"></div></div>
      <div class="section-title">Últimas entregas</div>
      <div id="dash-recientes"><div class="spinner mt-8"></div></div>
    `;
  },

  async loadData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isAdmin = Auth.isAdmin();

    // Today's deliveries
    let query = db.from('entregas').select('*').gte('fecha_hora', today.toISOString());
    if (!isAdmin) query = query.eq('repartidor_id', Auth.currentUser.id);
    const { data: todayEntregas } = await query;

    const entregas = todayEntregas || [];
    const totalVendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);
    const totalCobrado = entregas.reduce((s, e) => s + Number(e.monto_pagado), 0);

    const metricsEl = document.getElementById('dash-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${entregas.length}</div><div class="metric-label">Entregas</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalVendido)}</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalCobrado)}</div><div class="metric-label">Cobrado</div></div>
      `;
    }

    // Top debtors
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
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 3);

    const deudoresEl = document.getElementById('dash-deudores');
    if (deudoresEl) {
      if (deudores.length === 0) {
        deudoresEl.innerHTML = '<p class="text-sm text-muted" style="padding:8px 0">Sin deudas pendientes</p>';
      } else {
        deudoresEl.innerHTML = deudores.map(d => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${esc(d.nombre)}</div>
            </div>
            <div class="list-item-right">
              <div class="list-item-amount text-red">${fmtMoney(d.saldo)}</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Recent deliveries (last 5)
    let recentQ = db.from('entregas').select('*, puntos_entrega(nombre)').order('fecha_hora', { ascending: false }).limit(5);
    if (!isAdmin) recentQ = recentQ.eq('repartidor_id', Auth.currentUser.id);
    const { data: recientes } = await recentQ;

    const recientesEl = document.getElementById('dash-recientes');
    if (recientesEl) {
      if (!recientes || recientes.length === 0) {
        recientesEl.innerHTML = '<div class="empty-state"><p>Aún no hay entregas registradas</p></div>';
      } else {
        recientesEl.innerHTML = recientes.map(e => {
          const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
          const pagado = Number(e.monto_pagado) >= Number(e.monto_total);
          return `
            <div class="list-item">
              <div class="list-item-content">
                <div class="list-item-title">${esc(nombre)}</div>
                <div class="list-item-subtitle">${fmtDateTime(e.fecha_hora)} · ${e.cantidad} uds</div>
              </div>
              <div class="list-item-right">
                <div class="list-item-amount">${fmtMoney(e.monto_total)}</div>
                <span class="badge ${pagado ? 'badge-green' : 'badge-red'}">${pagado ? 'Pagado' : 'Debe'}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }
};
