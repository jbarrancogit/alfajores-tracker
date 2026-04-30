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
    return `
      <div class="app-header">
        <h1>Deudores</h1>
      </div>
      <div id="deud-list"><div class="spinner mt-8"></div></div>
    `;
  }
};
