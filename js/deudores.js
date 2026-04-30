const Deudores = {
  filters: { orden: 'saldo', search: '', repartidorId: '' },
  _data: [],
  _unpaidEntregas: [],
  _fetchId: 0,

  _aggregate(entregas, pagos) {
    const pagadoPorEntrega = {};
    (pagos || []).forEach(p => {
      pagadoPorEntrega[p.entrega_id] = (pagadoPorEntrega[p.entrega_id] || 0) + Number(p.monto);
    });

    const unpaidEntregas = [];
    const porPuntoMap = {};

    (entregas || []).forEach(e => {
      if (!e.punto_entrega_id) return;
      const pagado = pagadoPorEntrega[e.id] || 0;
      const saldo = Number(e.monto_total) - pagado;
      if (saldo <= 0) return;

      const nombre = e.puntos_entrega?.nombre || '?';
      unpaidEntregas.push({
        id: e.id,
        puntoId: e.punto_entrega_id,
        nombre,
        fecha_hora: e.fecha_hora,
        monto_total: Number(e.monto_total),
        pagado,
        saldo,
        entrega_lineas: e.entrega_lineas || []
      });

      const key = e.punto_entrega_id;
      if (!porPuntoMap[key]) {
        porPuntoMap[key] = {
          puntoId: key, nombre,
          saldo: 0, entregasPendientes: 0,
          primeraFechaPendiente: e.fecha_hora,
          ultimaFechaPendiente: e.fecha_hora
        };
      }
      const p = porPuntoMap[key];
      p.saldo += saldo;
      p.entregasPendientes++;
      if (e.fecha_hora < p.primeraFechaPendiente) p.primeraFechaPendiente = e.fecha_hora;
      if (e.fecha_hora > p.ultimaFechaPendiente) p.ultimaFechaPendiente = e.fecha_hora;
    });

    return {
      porPunto: Object.values(porPuntoMap),
      unpaidEntregas
    };
  },

  _filter(data, search) {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(d => (d.nombre || '').toLowerCase().includes(q));
  },

  _sort(data, orden) {
    const arr = [...data];
    if (orden === 'saldo') {
      arr.sort((a, b) => b.saldo - a.saldo);
    } else if (orden === 'antiguedad') {
      arr.sort((a, b) => (a.primeraFechaPendiente || '').localeCompare(b.primeraFechaPendiente || ''));
    } else if (orden === 'alfabetico') {
      arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    }
    return arr;
  },

  render() {
    Deudores.loadData();
    const isAdmin = (typeof Auth !== 'undefined' && Auth.isAdmin && Auth.isAdmin());
    return `
      <div class="app-header">
        <h1>Deudores</h1>
      </div>
      <div class="form-group">
        <input class="form-input" id="deud-search" type="text"
               placeholder="Buscar cliente..." autocomplete="off"
               oninput="Deudores.onSearch()">
      </div>
      <div class="filter-bar" id="deud-orden-bar">
        <button class="filter-chip active" onclick="Deudores.setOrden(this, 'saldo')">Saldo</button>
        <button class="filter-chip" onclick="Deudores.setOrden(this, 'antiguedad')">Antigüedad</button>
        <button class="filter-chip" onclick="Deudores.setOrden(this, 'alfabetico')">A–Z</button>
      </div>
      ${isAdmin ? `
      <select class="form-select mb-8" id="deud-repartidor"
              onchange="Deudores.onRepartidorChange()" style="font-size:0.85rem">
        <option value="">Todos los repartidores</option>
      </select>
      ` : ''}
      <div id="deud-header"></div>
      <div id="deud-list"><div class="spinner mt-8"></div></div>
    `;
  },

  async loadData() {
    try {
      Deudores._fetchId++;
      const myFetchId = Deudores._fetchId;
      const isAdmin = Auth.isAdmin();

      let q = db.from('entregas')
        .select('id, punto_entrega_id, fecha_hora, monto_total, repartidor_id, puntos_entrega(nombre), entrega_lineas(cantidad, tipos_alfajor(nombre))');
      if (!isAdmin) {
        q = q.eq('repartidor_id', Auth.currentUser.id);
      } else if (Deudores.filters.repartidorId) {
        q = q.eq('repartidor_id', Deudores.filters.repartidorId);
      }
      const { data: entregas } = await q;
      if (myFetchId !== Deudores._fetchId) return;

      const entregaIds = (entregas || []).map(e => e.id);
      const pagos = await batchIn('pagos', 'entrega_id, monto', 'entrega_id', entregaIds);
      if (myFetchId !== Deudores._fetchId) return;

      const { porPunto, unpaidEntregas } = Deudores._aggregate(entregas || [], pagos || []);
      Deudores._data = porPunto;
      Deudores._unpaidEntregas = unpaidEntregas;

      if (isAdmin) {
        const { data: usuarios } = await db.from('usuarios').select('id, nombre').order('nombre');
        const sel = document.getElementById('deud-repartidor');
        if (sel && usuarios) {
          const opts = usuarios.map(u =>
            `<option value="${u.id}" ${u.id === Deudores.filters.repartidorId ? 'selected' : ''}>${esc(u.nombre)}</option>`
          ).join('');
          sel.innerHTML = `<option value="">Todos los repartidores</option>${opts}`;
        }
      }

      Deudores.renderList();
    } catch (err) {
      console.error('Deudores.loadData error:', err);
      showToast('Error: ' + friendlyError(err));
      const list = document.getElementById('deud-list');
      if (list) list.innerHTML = '<p class="text-sm text-red">Error al cargar deudores</p>';
    }
  },

  setOrden(chip, orden) {
    document.querySelectorAll('#deud-orden-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Deudores.filters.orden = orden;
    Deudores.renderList();
  },

  onSearch() {
    const input = document.getElementById('deud-search');
    Deudores.filters.search = input ? input.value : '';
    Deudores.renderList();
  },

  onRepartidorChange() {
    const sel = document.getElementById('deud-repartidor');
    Deudores.filters.repartidorId = sel ? sel.value : '';
    Deudores.loadData();
  },

  renderList() {
    const list = document.getElementById('deud-list');
    const header = document.getElementById('deud-header');
    if (!list) return;

    const filtered = Deudores._sort(Deudores._filter(Deudores._data, Deudores.filters.search), Deudores.filters.orden);

    if (header) {
      const totalSaldo = filtered.reduce((s, d) => s + d.saldo, 0);
      const filteredEntregas = Deudores._filter(Deudores._unpaidEntregas, Deudores.filters.search);
      const showFlatBtn = Deudores.filters.search && filteredEntregas.length > 0;

      header.innerHTML = filtered.length === 0 ? '' : `
        <div class="metric-card" style="margin-bottom:8px">
          <div class="metric-label">${filtered.length} ${filtered.length === 1 ? 'cliente' : 'clientes'} · ${filteredEntregas.length} factura${filteredEntregas.length === 1 ? '' : 's'} pendiente${filteredEntregas.length === 1 ? '' : 's'}</div>
          <div class="metric-value text-red">${fmtMoney(totalSaldo)}</div>
          ${showFlatBtn ? `
          <button class="btn btn-secondary btn-block mt-8" onclick="Deudores.showFlatInvoicesModal('${escJs(Deudores.filters.search)}')">
            Ver todas las facturas pendientes
          </button>
          ` : ''}
        </div>
      `;
    }

    if (filtered.length === 0) {
      list.innerHTML = Deudores.filters.search
        ? '<div class="empty-state"><p>No hay deudores que coincidan con esa búsqueda</p></div>'
        : '<div class="empty-state"><p>Sin deudas pendientes</p></div>';
      return;
    }

    list.innerHTML = filtered.map(d => {
      const diasAtras = Math.floor((Date.now() - new Date(d.primeraFechaPendiente).getTime()) / 86400000);
      return `
        <div class="list-item" onclick="Pagos.showDeudorModal('${d.puntoId}', '${escJs(d.nombre)}')">
          <div class="list-item-content">
            <div class="list-item-title">${esc(d.nombre)}</div>
            <div class="list-item-subtitle">${d.entregasPendientes} pendiente${d.entregasPendientes === 1 ? '' : 's'} · más vieja hace ${diasAtras}d</div>
          </div>
          <div class="list-item-right">
            <div class="list-item-amount text-red">${fmtMoney(d.saldo)}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  showFlatInvoicesModal(searchText) {
    const matches = Deudores._filter(Deudores._unpaidEntregas, searchText)
      .sort((a, b) => (a.fecha_hora || '').localeCompare(b.fecha_hora || ''));
    const totalSaldo = matches.reduce((s, e) => s + e.saldo, 0);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

    const body = matches.length === 0
      ? '<p class="text-sm text-muted">Sin facturas pendientes para esta búsqueda</p>'
      : matches.map(e => {
          const lineas = (e.entrega_lineas || []).map(l =>
            `${esc(l.tipos_alfajor?.nombre || '?')}: ${l.cantidad}`
          ).join(', ');
          return `
            <div class="deudor-entrega">
              <div class="deudor-entrega-header">
                <span class="text-sm"><strong>${esc(e.nombre)}</strong> · ${fmtDateTime(e.fecha_hora)}</span>
                <span class="text-red" style="font-weight:600">${fmtMoney(e.saldo)}</span>
              </div>
              <div class="deudor-entrega-detail">${lineas || ''}</div>
              <div class="deudor-entrega-detail">Total: ${fmtMoney(e.monto_total)} · Pagado: ${fmtMoney(e.pagado)}</div>
              <div id="flat-pago-slot-${e.id}" style="margin-top:8px">
                <button class="btn btn-secondary btn-block" style="min-height:36px;font-size:0.8rem"
                        onclick="this.parentElement.innerHTML = Pagos.renderFormInline('${e.id}', ${e.saldo})">
                  Registrar pago
                </button>
              </div>
            </div>
          `;
        }).join('');

    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Facturas pendientes${searchText ? ' · "' + esc(searchText) + '"' : ''}</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="flex-between mb-16">
          <span class="text-sm text-muted">${matches.length} factura${matches.length === 1 ? '' : 's'}</span>
          <span class="text-red" style="font-weight:700">${fmtMoney(totalSaldo)}</span>
        </div>
        ${body}
      </div>
    `;
    document.body.appendChild(overlay);
  },
};
