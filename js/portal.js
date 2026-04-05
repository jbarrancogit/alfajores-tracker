const Portal = {
  portalDb: null,
  token: null,

  async render(token) {
    Portal.token = token;
    Portal.portalDb = createPortalClient(token);

    document.getElementById('bottom-nav').hidden = true;

    const { data: puntos } = await Portal.portalDb
      .from('puntos_entrega')
      .select('id, nombre')
      .limit(1);

    if (!puntos || puntos.length === 0) {
      App.setContent(`
        <div class="portal-screen">
          <div class="portal-header">
            <img src="assets/icon-192.png" alt="Logo" class="portal-logo">
            <h1>Alfajores Tracker</h1>
          </div>
          <div class="empty-state"><p>Link inválido o expirado</p></div>
        </div>
      `);
      return;
    }

    const punto = puntos[0];

    const { data: entregas } = await Portal.portalDb
      .from('entregas')
      .select('*, entrega_lineas(cantidad, precio_unitario, tipos_alfajor(nombre)), pagos(monto, forma_pago, fecha)')
      .eq('punto_entrega_id', punto.id)
      .order('fecha_hora', { ascending: false });

    const list = entregas || [];
    const totalComprado = list.reduce((s, e) => s + Number(e.monto_total), 0);
    const totalPagado = list.reduce((s, e) => s + Number(e.monto_pagado), 0);
    const deuda = totalComprado - totalPagado;

    App.setContent(`
      <div class="portal-screen">
        <div class="portal-header">
          <img src="assets/icon-192.png" alt="Logo" class="portal-logo">
          <h1>${esc(punto.nombre)}</h1>
          <p class="text-sm text-muted">Cuenta corriente</p>
        </div>

        <div class="metrics-grid" style="margin-bottom:16px">
          <div class="metric-card">
            <div class="metric-value">${fmtMoney(totalComprado)}</div>
            <div class="metric-label">Total comprado</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${fmtMoney(totalPagado)}</div>
            <div class="metric-label">Total pagado</div>
          </div>
          <div class="metric-card">
            <div class="metric-value" style="color:${deuda > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(deuda)}</div>
            <div class="metric-label">${deuda > 0 ? 'Deuda' : 'Al día'}</div>
          </div>
        </div>

        <div class="section-title">Entregas</div>
        ${list.length === 0 ? '<p class="text-sm text-muted">Sin entregas registradas</p>' :
          list.map(e => {
            const lineas = (e.entrega_lineas || []).map(l =>
              `${l.cantidad} ${esc(l.tipos_alfajor?.nombre || '?')} × ${fmtMoney(l.precio_unitario)}`
            ).join('<br>');
            const pagos = (e.pagos || []);
            const montoPagado = Number(e.monto_pagado);
            const montoTotal = Number(e.monto_total);
            const badge = montoPagado >= montoTotal
              ? '<span class="badge badge-green">Pagado</span>'
              : montoPagado > 0
                ? '<span class="badge badge-yellow">Parcial</span>'
                : '<span class="badge badge-red">Debe</span>';

            return `
              <div class="portal-entrega">
                <div class="portal-entrega-header">
                  <span>${fmtDateTime(e.fecha_hora)}</span>
                  <span>${fmtMoney(montoTotal)} ${badge}</span>
                </div>
                <div class="portal-entrega-detail">${lineas}</div>
                ${pagos.length > 0 ? `
                  <div class="portal-pagos">
                    ${pagos.map(p => `
                      <div class="text-xs text-muted">Pago: ${fmtMoney(p.monto)} (${esc(p.forma_pago)})${p.fecha ? ' — ' + fmtDateTime(p.fecha) : ''}</div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')
        }

        <div class="portal-footer">
          <p class="text-xs text-muted">Alfajores Tracker</p>
        </div>
      </div>
    `);
  }
};
