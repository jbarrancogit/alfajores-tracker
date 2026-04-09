const Analisis = {
  periodo: 'semana',
  customFrom: null,
  customTo: null,
  vendedorId: '',
  selectedDate: null,
  calendarMonth: null,

  render() {
    if (!Auth.isAdmin()) {
      return '<div class="empty-state"><p>Solo el administrador puede ver análisis</p></div>';
    }
    Analisis._initRender();
    return `
      <div class="app-header">
        <h1>Análisis</h1>
        <button class="btn-icon" onclick="Analisis.showExportModal()" title="Exportar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      <div id="anal-calendar"></div>
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
      <select class="form-select mb-8" id="anal-vendedor" onchange="Analisis.onVendedorChange()" style="font-size:0.85rem">
        <option value="">Todos los vendedores</option>
      </select>
      <div id="anal-metrics" class="metrics-grid">
        ${Array(6).fill('<div class="metric-card"><div class="metric-value">-</div><div class="metric-label">...</div></div>').join('')}
      </div>
      <div class="section-title">Desglose de cobro</div>
      <div id="anal-desglose" class="metrics-grid" style="grid-template-columns:1fr 1fr 1fr"></div>
      <div id="anal-comparison" class="comparison-row"></div>
      <div class="section-title">Por tipo de alfajor</div>
      <div id="anal-tipos"><div class="spinner mt-8"></div></div>
      <div class="section-title">Ranking clientes</div>
      <div id="anal-ranking"><div class="spinner mt-8"></div></div>
      <div class="section-title">Por repartidor</div>
      <div id="anal-repartidores"><div class="spinner mt-8"></div></div>
      <div class="section-title">Deudores</div>
      <div id="anal-deudores"><div class="spinner mt-8"></div></div>
      <div class="section-title">Liquidación</div>
      <div id="anal-liquidacion"><div class="spinner mt-8"></div></div>
    `;
  },

  async _initRender() {
    const { data: usuarios } = await db.from('usuarios').select('id, nombre').order('nombre');
    const sel = document.getElementById('anal-vendedor');
    if (sel && usuarios) {
      const opts = usuarios.map(u =>
        `<option value="${u.id}" ${u.id === Analisis.vendedorId ? 'selected' : ''}>${esc(u.nombre)}</option>`
      ).join('');
      sel.innerHTML = `<option value="">Todos los vendedores</option>${opts}`;
    }
    // Reset calendar to current month on each visit
    Analisis.calendarMonth = null;
    Analisis.selectedDate = null;
    Analisis._updateCalendar();
    Analisis.loadData();
  },

  _renderCalendar() {
    const now = new Date();
    if (!Analisis.calendarMonth) Analisis.calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const cm = Analisis.calendarMonth;
    const year = cm.getFullYear();
    const m = cm.getMonth();
    const firstDay = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    // Monday-based: convert JS getDay (0=Sun) to 0=Mon
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const selectedStr = Analisis.selectedDate
      ? `${Analisis.selectedDate.getFullYear()}-${pad(Analisis.selectedDate.getMonth() + 1)}-${pad(Analisis.selectedDate.getDate())}`
      : '';

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    let cells = '';
    // Previous month filler days
    const prevMonth = new Date(year, m, 0);
    for (let i = 0; i < startDow; i++) {
      const d = prevMonth.getDate() - startDow + i + 1;
      cells += `<div class="cal-day cal-day-outside">${d}</div>`;
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let cls = 'cal-day';
      if (dateStr === todayStr) cls += ' cal-day-today';
      if (dateStr === selectedStr) cls += ' cal-day-selected';
      cells += `<div class="${cls}" onclick="Analisis.selectDay('${dateStr}')">${d}</div>`;
    }
    // Next month filler days
    const totalCells = startDow + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      cells += `<div class="cal-day cal-day-outside">${i}</div>`;
    }

    return `
      <div class="calendar">
        <div class="cal-header">
          <button class="btn-icon cal-nav" onclick="Analisis.prevMonth()">&lsaquo;</button>
          <span class="cal-title">${monthNames[m]} ${year}</span>
          <button class="btn-icon cal-nav" onclick="Analisis.nextMonth()">&rsaquo;</button>
        </div>
        <div class="cal-grid">
          <div class="cal-dow">L</div><div class="cal-dow">M</div><div class="cal-dow">M</div>
          <div class="cal-dow">J</div><div class="cal-dow">V</div><div class="cal-dow">S</div><div class="cal-dow">D</div>
          ${cells}
        </div>
      </div>
    `;
  },

  _updateCalendar() {
    const el = document.getElementById('anal-calendar');
    if (el) el.innerHTML = Analisis._renderCalendar();
  },

  selectDay(dateStr) {
    Analisis.selectedDate = new Date(dateStr + 'T00:00:00');
    Analisis.periodo = 'dia';
    // Deselect all period chips
    document.querySelectorAll('#anal-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    // Hide custom range if visible
    const customRange = document.getElementById('anal-custom-range');
    if (customRange) customRange.classList.add('hidden');
    Analisis._updateCalendar();
    Analisis.loadData();
  },

  prevMonth() {
    const cm = Analisis.calendarMonth || new Date();
    Analisis.calendarMonth = new Date(cm.getFullYear(), cm.getMonth() - 1, 1);
    Analisis._updateCalendar();
  },

  nextMonth() {
    const cm = Analisis.calendarMonth || new Date();
    Analisis.calendarMonth = new Date(cm.getFullYear(), cm.getMonth() + 1, 1);
    Analisis._updateCalendar();
  },

  onVendedorChange() {
    Analisis.vendedorId = document.getElementById('anal-vendedor')?.value || '';
    Analisis.loadData();
  },

  setPeriod(chip, periodo) {
    document.querySelectorAll('#anal-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Analisis.periodo = periodo;
    Analisis.selectedDate = null;
    Analisis._updateCalendar();
    const customRange = document.getElementById('anal-custom-range');
    if (customRange) customRange.classList.toggle('hidden', periodo !== 'custom');
    if (periodo !== 'custom') Analisis.loadData();
  },

  _dateRange(periodo) {
    const now = new Date();
    let from = null;
    let to = now;

    if (periodo === 'dia' && Analisis.selectedDate) {
      from = new Date(Analisis.selectedDate);
      from.setHours(0, 0, 0, 0);
      to = new Date(Analisis.selectedDate);
      to.setHours(23, 59, 59, 999);
    } else if (periodo === 'hoy') {
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
      if (from >= to) { const tmp = from; from = to; to = tmp; }
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
   try {
    await Tipos.fetchAll();
    const { data: usuariosData } = await db.from('usuarios').select('id, nombre, comision_pct');
    const usuariosMap = {};
    (usuariosData || []).forEach(u => { usuariosMap[u.id] = u; });
    const { from, to } = Analisis._dateRange(Analisis.periodo);

    let query = db.from('entregas')
      .select('*, entrega_lineas(*, tipos_alfajor(nombre)), puntos_entrega(nombre), usuarios(nombre)');
    if (from) query = query.gte('fecha_hora', from.toISOString());
    query = query.lte('fecha_hora', to.toISOString());
    if (Analisis.vendedorId) query = query.eq('repartidor_id', Analisis.vendedorId);
    const { data } = await query;
    const entregas = data || [];

    // Fetch pagos breakdown for these entregas (batched to avoid URL limits)
    let cobradoEfectivo = 0, cobradoTransfer = 0, cobradoMauri = 0;
    const entregaIds = entregas.map(e => e.id);
    const pagosData = await batchIn('pagos', 'monto, forma_pago, entrega_id', 'entrega_id', entregaIds);

    // Build per-entrega pagos sum (single source of truth for ALL sections)
    const _pagosSum = {};
    pagosData.forEach(p => {
      if (!_pagosSum[p.entrega_id]) _pagosSum[p.entrega_id] = 0;
      _pagosSum[p.entrega_id] += Number(p.monto);
      if (p.forma_pago === 'efectivo') cobradoEfectivo += Number(p.monto);
      else if (p.forma_pago === 'transferencia') cobradoTransfer += Number(p.monto);
      else if (p.forma_pago === 'transferencia_mauri') cobradoMauri += Number(p.monto);
    });
    const pagado = (eId) => _pagosSum[eId] || 0;

    const _pagosMauri = {};
    pagosData.forEach(p => {
      if (p.forma_pago === 'transferencia_mauri') {
        _pagosMauri[p.entrega_id] = (_pagosMauri[p.entrega_id] || 0) + Number(p.monto);
      }
    });
    const pagadoMauri = (eId) => _pagosMauri[eId] || 0;

    let prevEntregas = [];
    if (from) {
      const prev = Analisis._prevRange(from, to);
      let prevQ = db.from('entregas')
        .select('*, entrega_lineas(cantidad, precio_unitario, costo_unitario)');
      prevQ = prevQ.gte('fecha_hora', prev.from.toISOString()).lt('fecha_hora', prev.to.toISOString());
      const { data: prevData } = await prevQ;
      prevEntregas = prevData || [];
    }

    const totalVendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);
    const totalCobrado = cobradoEfectivo + cobradoTransfer + cobradoMauri;
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

    const desgloseEl = document.getElementById('anal-desglose');
    if (desgloseEl) {
      desgloseEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${fmtMoney(cobradoEfectivo)}</div><div class="metric-label">Efectivo</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(cobradoTransfer)}</div><div class="metric-label">Transfer.</div></div>
        <div class="metric-card"><div class="metric-value" style="color:#a855f7">${fmtMoney(cobradoMauri)}</div><div class="metric-label">T. Mauri</div></div>
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
    if (compEl && (prevVendido > 0 || prevGanancia > 0 || prevUnidades > 0)) {
      const pctVentas = prevVendido > 0 ? Math.round((totalVendido - prevVendido) / prevVendido * 100) : null;
      const pctGanancia = prevGanancia > 0 ? Math.round((totalGanancia - prevGanancia) / prevGanancia * 100) : null;
      const pctUnidades = prevUnidades > 0 ? Math.round((totalUnidades - prevUnidades) / prevUnidades * 100) : null;
      const fmtPct = v => v === null ? '—' : `${v >= 0 ? '+' : ''}${v}%`;
      const clsPct = v => v === null ? '' : (v >= 0 ? 'positive' : 'negative');
      compEl.innerHTML = `
        <div class="comparison-chip">Ventas <span class="${clsPct(pctVentas)}">${fmtPct(pctVentas)}</span></div>
        <div class="comparison-chip">Ganancia <span class="${clsPct(pctGanancia)}">${fmtPct(pctGanancia)}</span></div>
        <div class="comparison-chip">Uds <span class="${clsPct(pctUnidades)}">${fmtPct(pctUnidades)}</span></div>
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
      puntoMap[key].deuda += Number(e.monto_total) - pagado(e.id);
    });
    const puntoRank = Object.values(puntoMap).sort((a, b) => b.total - a.total);

    const rankingEl = document.getElementById('anal-ranking');
    if (rankingEl) {
      if (puntoRank.length === 0) {
        rankingEl.innerHTML = '<p class="text-sm text-muted">Sin datos</p>';
      } else {
        rankingEl.innerHTML = puntoRank.map(p => `
          <div class="list-item" ${p.id !== '__temp__' && p.deuda > 0 ? `onclick="Pagos.showDeudorModal('${p.id}', '${escJs(p.nombre)}')"` : ''}>
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
      repMap[key].cobrado += pagado(e.id);
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

    // Reuse already-fetched entregas + pagos sum (no separate query needed)
    const deudaMap = {};
    entregas.forEach(e => {
      if (!e.punto_entrega_id) return;
      const key = e.punto_entrega_id;
      const nombre = e.puntos_entrega?.nombre || '?';
      if (!deudaMap[key]) deudaMap[key] = { id: key, nombre, total: 0, pagado: 0, entregas: 0 };
      deudaMap[key].total += Number(e.monto_total);
      deudaMap[key].pagado += pagado(e.id);
      if (pagado(e.id) < Number(e.monto_total)) deudaMap[key].entregas++;
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
          <div class="list-item" onclick="Pagos.showDeudorModal('${d.id}', '${escJs(d.nombre)}')">
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

    // Liquidación
    const liqMap = {};
    entregas.forEach(e => {
      const key = e.repartidor_id;
      if (!liqMap[key]) {
        const u = usuariosMap[key] || {};
        liqMap[key] = { nombre: u.nombre || e.usuarios?.nombre || '?', entregas: 0, vendido: 0, cobrado: 0, mauri: 0, pct: Number(u.comision_pct) || 0 };
      }
      liqMap[key].entregas++;
      liqMap[key].vendido += Number(e.monto_total);
      liqMap[key].cobrado += pagado(e.id);
      liqMap[key].mauri = (liqMap[key].mauri || 0) + pagadoMauri(e.id);
    });
    const liqRank = Object.values(liqMap).sort((a, b) => b.vendido - a.vendido);

    const liqEl = document.getElementById('anal-liquidacion');
    if (liqEl) {
      if (liqRank.length === 0) {
        liqEl.innerHTML = '<p class="text-sm text-muted">Sin datos</p>';
      } else {
        liqEl.innerHTML = `
          <div class="liq-table">
            <div class="liq-header">
              <span>Repartidor</span><span>Vendido</span><span>Cobrado</span><span>T.Mauri</span><span>%</span><span>A rendir</span>
            </div>
            ${liqRank.map(r => {
              const cobradoSinMauri = r.cobrado - r.mauri;
              const comision = r.vendido * r.pct / 100;
              const aRendir = cobradoSinMauri - comision;
              return `
                <div class="liq-row">
                  <span>${esc(r.nombre)}</span>
                  <span>${fmtMoney(r.vendido)}</span>
                  <span>${fmtMoney(r.cobrado)}</span>
                  <span style="color:#a855f7">${fmtMoney(r.mauri)}</span>
                  <span>${r.pct}%</span>
                  <span style="color:var(--accent);font-weight:600">${fmtMoney(aRendir)}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }

    Analisis._data = { entregas, from, to, usuariosMap };
   } catch (err) {
    console.error('Analisis.loadData error:', err);
    showToast('Error cargando datos');
    const content = document.getElementById('anal-metrics');
    if (content) content.innerHTML = '<p class="text-sm text-red">Error al cargar datos</p>';
    ['anal-tipos','anal-ranking','anal-repartidores','anal-deudores','anal-liquidacion'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
   }
  },

  _data: null,

  showExportModal() {
    ExcelExport.showModal();
  }
};
