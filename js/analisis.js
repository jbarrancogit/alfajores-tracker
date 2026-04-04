const Analisis = {
  periodo: 'semana',
  customFrom: null,
  customTo: null,

  render() {
    if (!Auth.isAdmin()) {
      return '<div class="empty-state"><p>Solo el administrador puede ver análisis</p></div>';
    }
    Analisis.loadData();
    return `
      <div class="app-header">
        <h1>Análisis</h1>
        <button class="btn-icon" onclick="Analisis.showExportModal()" title="Exportar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      <div class="filter-bar" id="anal-period-bar">
        <button class="filter-chip" onclick="Analisis.setPeriod(this, 'hoy')">Hoy</button>
        <button class="filter-chip active" onclick="Analisis.setPeriod(this, 'semana')">Semana</button>
        <button class="filter-chip" onclick="Analisis.setPeriod(this, 'mes')">Mes</button>
        <button class="filter-chip" onclick="Analisis.setPeriod(this, 'ciclo')">Ciclo 4s</button>
        <button class="filter-chip" onclick="Analisis.setPeriod(this, 'custom')">Rango</button>
      </div>
      <div id="anal-custom-range" class="hidden">
        <div class="date-range">
          <input class="form-input" type="date" id="anal-from" onchange="Analisis.loadData()">
          <input class="form-input" type="date" id="anal-to" onchange="Analisis.loadData()">
        </div>
      </div>
      <div id="anal-metrics" class="metrics-grid-6">
        ${Array(6).fill('<div class="metric-card"><div class="metric-value">-</div><div class="metric-label">...</div></div>').join('')}
      </div>
      <div id="anal-comparison" class="comparison-row"></div>
      <div class="section-title">Por tipo de alfajor</div>
      <div id="anal-tipos"><div class="spinner mt-8"></div></div>
      <div class="section-title">Ranking clientes</div>
      <div id="anal-ranking"><div class="spinner mt-8"></div></div>
      <div class="section-title">Por repartidor</div>
      <div id="anal-repartidores"><div class="spinner mt-8"></div></div>
      <div class="section-title">Deudores</div>
      <div id="anal-deudores"><div class="spinner mt-8"></div></div>
    `;
  },

  setPeriod(chip, periodo) {
    document.querySelectorAll('#anal-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Analisis.periodo = periodo;
    const customRange = document.getElementById('anal-custom-range');
    if (customRange) customRange.classList.toggle('hidden', periodo !== 'custom');
    if (periodo !== 'custom') Analisis.loadData();
  },

  _dateRange(periodo) {
    const now = new Date();
    let from = null;
    let to = now;

    if (periodo === 'hoy') {
      from = new Date(now); from.setHours(0, 0, 0, 0);
    } else if (periodo === 'semana') {
      from = new Date(now); from.setDate(from.getDate() - 7);
    } else if (periodo === 'mes') {
      from = new Date(now); from.setMonth(from.getMonth() - 1);
    } else if (periodo === 'ciclo') {
      from = new Date(now); from.setDate(from.getDate() - 28);
    } else if (periodo === 'custom') {
      const fEl = document.getElementById('anal-from');
      const tEl = document.getElementById('anal-to');
      from = fEl?.value ? new Date(fEl.value) : new Date(now.getTime() - 7 * 86400000);
      to = tEl?.value ? new Date(tEl.value + 'T23:59:59') : now;
    }

    return { from, to };
  },

  _prevRange(from, to) {
    const duration = to.getTime() - from.getTime();
    return {
      from: new Date(from.getTime() - duration),
      to: new Date(from.getTime())
    };
  },

  async loadData() {
    await Tipos.fetchAll();
    const { from, to } = Analisis._dateRange(Analisis.periodo);

    let query = db.from('entregas')
      .select('*, entrega_lineas(*, tipos_alfajor(nombre)), puntos_entrega(nombre), usuarios(nombre)');
    if (from) query = query.gte('fecha_hora', from.toISOString());
    query = query.lte('fecha_hora', to.toISOString());
    const { data } = await query;
    const entregas = data || [];

    const prev = Analisis._prevRange(from, to);
    let prevQ = db.from('entregas')
      .select('*, entrega_lineas(cantidad, precio_unitario, costo_unitario)');
    prevQ = prevQ.gte('fecha_hora', prev.from.toISOString()).lt('fecha_hora', prev.to.toISOString());
    const { data: prevData } = await prevQ;
    const prevEntregas = prevData || [];

    const totalVendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);
    const totalCobrado = entregas.reduce((s, e) => s + Number(e.monto_pagado), 0);
    const totalUnidades = entregas.reduce((s, e) => s + Number(e.cantidad), 0);
    const totalPendiente = totalVendido - totalCobrado;

    let totalGanancia = 0;
    entregas.forEach(e => {
      (e.entrega_lineas || []).forEach(l => {
        totalGanancia += (Number(l.precio_unitario) - Number(l.costo_unitario)) * l.cantidad;
      });
    });

    const metricsEl = document.getElementById('anal-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalVendido)}</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalCobrado)}</div><div class="metric-label">Cobrado</div></div>
        <div class="metric-card"><div class="metric-value" style="color:var(--green)">${fmtMoney(totalGanancia)}</div><div class="metric-label">Ganancia</div></div>
        <div class="metric-card"><div class="metric-value">${totalUnidades}</div><div class="metric-label">Unidades</div></div>
        <div class="metric-card"><div class="metric-value" style="color:${totalPendiente > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(totalPendiente)}</div><div class="metric-label">Pendiente</div></div>
        <div class="metric-card"><div class="metric-value">${entregas.length}</div><div class="metric-label">Entregas</div></div>
      `;
    }

    const prevVendido = prevEntregas.reduce((s, e) => s + Number(e.monto_total), 0);
    let prevGanancia = 0;
    prevEntregas.forEach(e => {
      (e.entrega_lineas || []).forEach(l => {
        prevGanancia += (Number(l.precio_unitario) - Number(l.costo_unitario)) * l.cantidad;
      });
    });
    const prevUnidades = prevEntregas.reduce((s, e) => s + Number(e.cantidad), 0);

    const compEl = document.getElementById('anal-comparison');
    if (compEl && prevVendido > 0) {
      const pctVentas = ((totalVendido - prevVendido) / prevVendido * 100).toFixed(0);
      const pctGanancia = prevGanancia > 0 ? ((totalGanancia - prevGanancia) / prevGanancia * 100).toFixed(0) : '—';
      const pctUnidades = prevUnidades > 0 ? ((totalUnidades - prevUnidades) / prevUnidades * 100).toFixed(0) : '—';
      compEl.innerHTML = `
        <div class="comparison-chip">Ventas <span class="${pctVentas >= 0 ? 'positive' : 'negative'}">${pctVentas >= 0 ? '+' : ''}${pctVentas}%</span></div>
        <div class="comparison-chip">Ganancia <span class="${pctGanancia >= 0 ? 'positive' : 'negative'}">${pctGanancia >= 0 ? '+' : ''}${pctGanancia}%</span></div>
        <div class="comparison-chip">Uds <span class="${pctUnidades >= 0 ? 'positive' : 'negative'}">${pctUnidades >= 0 ? '+' : ''}${pctUnidades}%</span></div>
      `;
    } else if (compEl) {
      compEl.innerHTML = '<p class="text-xs text-muted">Sin datos del período anterior para comparar</p>';
    }

    const tipoMap = {};
    entregas.forEach(e => {
      (e.entrega_lineas || []).forEach(l => {
        const key = l.tipo_alfajor_id;
        if (!tipoMap[key]) tipoMap[key] = { nombre: l.tipos_alfajor?.nombre || '?', cantidad: 0, venta: 0, ganancia: 0 };
        tipoMap[key].cantidad += l.cantidad;
        tipoMap[key].venta += l.cantidad * Number(l.precio_unitario);
        tipoMap[key].ganancia += l.cantidad * (Number(l.precio_unitario) - Number(l.costo_unitario));
      });
    });
    const tipoRank = Object.values(tipoMap).sort((a, b) => b.venta - a.venta);

    const tiposEl = document.getElementById('anal-tipos');
    if (tiposEl) {
      if (tipoRank.length === 0) {
        tiposEl.innerHTML = '<p class="text-sm text-muted">Sin datos</p>';
      } else {
        tiposEl.innerHTML = tipoRank.map(t => `
          <div class="type-breakdown-item">
            <span class="type-name">${esc(t.nombre)}</span>
            <span class="type-stat">${t.cantidad} uds</span>
            <span class="type-stat">${fmtMoney(t.venta)}</span>
            <span class="type-stat" style="color:var(--green)">${fmtMoney(t.ganancia)}</span>
          </div>
        `).join('');
      }
    }

    const puntoMap = {};
    entregas.forEach(e => {
      const key = e.punto_entrega_id || '__temp__';
      const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
      if (!puntoMap[key]) puntoMap[key] = { id: key, nombre, cantidad: 0, total: 0, deuda: 0 };
      puntoMap[key].cantidad += Number(e.cantidad);
      puntoMap[key].total += Number(e.monto_total);
      puntoMap[key].deuda += Number(e.monto_total) - Number(e.monto_pagado);
    });
    const puntoRank = Object.values(puntoMap).sort((a, b) => b.total - a.total);

    const rankingEl = document.getElementById('anal-ranking');
    if (rankingEl) {
      if (puntoRank.length === 0) {
        rankingEl.innerHTML = '<p class="text-sm text-muted">Sin datos</p>';
      } else {
        rankingEl.innerHTML = puntoRank.map(p => `
          <div class="list-item" ${p.id !== '__temp__' && p.deuda > 0 ? `onclick="Pagos.showDeudorModal('${p.id}', '${esc(p.nombre)}')"` : ''}>
            <div class="list-item-content">
              <div class="list-item-title">${esc(p.nombre)}</div>
              <div class="list-item-subtitle">${p.cantidad} uds</div>
            </div>
            <div class="list-item-right">
              <div class="list-item-amount">${fmtMoney(p.total)}</div>
              ${p.deuda > 0 ? `<span class="text-xs text-red">Debe ${fmtMoney(p.deuda)}</span>` : ''}
            </div>
          </div>
        `).join('');
      }
    }

    const repMap = {};
    entregas.forEach(e => {
      const key = e.repartidor_id;
      const nombre = e.usuarios?.nombre || 'Desconocido';
      if (!repMap[key]) repMap[key] = { nombre, entregas: 0, total: 0, cobrado: 0, ganancia: 0 };
      repMap[key].entregas++;
      repMap[key].total += Number(e.monto_total);
      repMap[key].cobrado += Number(e.monto_pagado);
      (e.entrega_lineas || []).forEach(l => {
        repMap[key].ganancia += l.cantidad * (Number(l.precio_unitario) - Number(l.costo_unitario));
      });
    });
    const repRank = Object.values(repMap).sort((a, b) => b.total - a.total);

    const repEl = document.getElementById('anal-repartidores');
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
              <span class="text-xs" style="color:var(--green)">+${fmtMoney(r.ganancia)}</span>
            </div>
          </div>
        `).join('');
      }
    }

    const { data: allE } = await db.from('entregas')
      .select('punto_entrega_id, monto_total, monto_pagado, puntos_entrega(nombre)');
    const deudaMap = {};
    (allE || []).forEach(e => {
      if (!e.punto_entrega_id) return;
      const key = e.punto_entrega_id;
      if (!deudaMap[key]) deudaMap[key] = { id: key, nombre: e.puntos_entrega?.nombre || '?', total: 0, pagado: 0, entregas: 0 };
      deudaMap[key].total += Number(e.monto_total);
      deudaMap[key].pagado += Number(e.monto_pagado);
      if (Number(e.monto_pagado) < Number(e.monto_total)) deudaMap[key].entregas++;
    });
    const deudores = Object.values(deudaMap)
      .map(d => ({ ...d, saldo: d.total - d.pagado }))
      .filter(d => d.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);

    const deudoresEl = document.getElementById('anal-deudores');
    if (deudoresEl) {
      if (deudores.length === 0) {
        deudoresEl.innerHTML = '<p class="text-sm text-muted">Sin deudas pendientes</p>';
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

    Analisis._data = { entregas, from, to };
  },

  _data: null,

  showExportModal() {
    ExcelExport.showModal();
  }
};
