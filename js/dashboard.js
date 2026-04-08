const Dashboard = {
  render() {
    Dashboard.loadData();
    return `
      <div class="app-header">
        <h1>Alfajores Tracker</h1>
        <div style="display:flex;gap:6px">
          ${Auth.isAdmin() ? `
          <button class="btn-icon" onclick="window.location.hash='#/config'" title="Configuración">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          ` : ''}
          <button class="btn-icon" onclick="Auth.logout()" title="Cerrar sesión">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
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
   try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isAdmin = Auth.isAdmin();

    let query = db.from('entregas').select('*').gte('fecha_hora', today.toISOString());
    if (!isAdmin) query = query.eq('repartidor_id', Auth.currentUser.id);
    const { data: todayEntregas } = await query;

    const entregas = todayEntregas || [];
    const totalVendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);

    // Derive Cobrado from actual pagos to avoid desync with entregas.monto_pagado
    let totalCobrado = 0;
    const dashEntregaIds = entregas.map(e => e.id);
    if (dashEntregaIds.length > 0) {
      const dashPagos = await batchIn('pagos', 'monto', 'entrega_id', dashEntregaIds);
      totalCobrado = dashPagos.reduce((s, p) => s + Number(p.monto), 0);
    }

    const metricsEl = document.getElementById('dash-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${entregas.length}</div><div class="metric-label">Entregas</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalVendido)}</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalCobrado)}</div><div class="metric-label">Cobrado</div></div>
      `;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    let deudaQ = db.from('entregas')
      .select('punto_entrega_id, monto_total, monto_pagado, puntos_entrega(nombre)')
      .gte('fecha_hora', cutoff.toISOString());
    if (!isAdmin) deudaQ = deudaQ.eq('repartidor_id', Auth.currentUser.id);
    const { data: allEntregas } = await deudaQ;
    const deudaMap = {};
    (allEntregas || []).forEach(e => {
      if (!e.punto_entrega_id) return;
      const key = e.punto_entrega_id;
      if (!deudaMap[key]) deudaMap[key] = {
        id: key,
        nombre: e.puntos_entrega?.nombre || '?',
        total: 0,
        pagado: 0,
        entregas: 0
      };
      deudaMap[key].total += Number(e.monto_total);
      deudaMap[key].pagado += Number(e.monto_pagado);
      if (Number(e.monto_pagado) < Number(e.monto_total)) deudaMap[key].entregas++;
    });
    const deudores = Object.values(deudaMap)
      .map(d => ({ ...d, saldo: d.total - d.pagado }))
      .filter(d => d.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 5);

    const deudoresEl = document.getElementById('dash-deudores');
    if (deudoresEl) {
      if (deudores.length === 0) {
        deudoresEl.innerHTML = '<p class="text-sm text-muted" style="padding:8px 0">Sin deudas pendientes</p>';
      } else {
        deudoresEl.innerHTML = deudores.map(d => `
          <div class="list-item" onclick="Pagos.showDeudorModal('${d.id}', '${esc(d.nombre)}')">
            <div class="list-item-content">
              <div class="list-item-title">${esc(d.nombre)}</div>
              <div class="list-item-subtitle">${d.entregas} entregas pendientes</div>
            </div>
            <div class="list-item-right">
              <div class="list-item-amount text-red">${fmtMoney(d.saldo)}</div>
            </div>
          </div>
        `).join('');
      }
    }

    let recentQ = db.from('entregas')
      .select('*, puntos_entrega(nombre), entrega_lineas(cantidad, tipos_alfajor(nombre))')
      .order('fecha_hora', { ascending: false }).limit(5);
    if (!isAdmin) recentQ = recentQ.eq('repartidor_id', Auth.currentUser.id);
    const { data: recientes } = await recentQ;

    const recientesEl = document.getElementById('dash-recientes');
    if (recientesEl) {
      if (!recientes || recientes.length === 0) {
        recientesEl.innerHTML = '<div class="empty-state"><p>Aún no hay entregas registradas</p></div>';
      } else {
        recientesEl.innerHTML = recientes.map(e => {
          const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
          const lineas = e.entrega_lineas || [];
          const resumen = lineas.length > 0
            ? lineas.map(l => `${l.cantidad} ${l.tipos_alfajor?.nombre || '?'}`).join(', ')
            : e.cantidad + ' uds';
          return `
            <div class="list-item">
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
      }
    }
   } catch (err) {
    console.error('Dashboard.loadData error:', err);
    showToast('Error cargando datos');
   }
  }
};
