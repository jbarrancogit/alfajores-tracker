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
    // Implemented in Task 6
  },
};
