const Ruta = {
  map: null,
  markers: [],

  render() {
    Ruta.loadMap();
    return `
      <div class="app-header">
        <h1>Ruta del día</h1>
      </div>
      <div id="ruta-map" style="height:calc(100vh - var(--header-height) - var(--nav-height) - 40px);border-radius:var(--radius-sm);overflow:hidden"></div>
      <div id="ruta-info"></div>
      <button class="fab-location" onclick="Ruta.centerOnMe()" title="Mi ubicación">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
      </button>
    `;
  },

  async loadMap() {
   try {
    const isAdmin = Auth.isAdmin();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let query = db.from('entregas')
      .select('*, puntos_entrega(id, nombre, lat, lng), entrega_lineas(cantidad, tipos_alfajor(nombre))')
      .gte('fecha_hora', today.toISOString());
    if (!isAdmin) query = query.eq('repartidor_id', Auth.currentUser.id);
    const { data } = await query;
    const entregas = data || [];

    const mapEl = document.getElementById('ruta-map');
    if (!mapEl) return;

    if (typeof L === 'undefined') {
      mapEl.innerHTML = '<div class="empty-state"><p>Cargando mapa...</p></div>';
      return;
    }

    if (Ruta.map) { Ruta.map.remove(); Ruta.map = null; }

    Ruta.map = L.map('ruta-map').setView([-34.6, -58.4], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(Ruta.map);

    Ruta.markers = [];
    let withCoords = 0;
    let withoutCoords = 0;

    entregas.forEach(e => {
      const p = e.puntos_entrega;
      if (!p || p.lat == null || p.lng == null) { withoutCoords++; return; }
      withCoords++;

      const pagado = Number(e.monto_pagado);
      const total = Number(e.monto_total);
      let color = '#22c55e';
      if (pagado <= 0) color = '#ef4444';
      else if (pagado < total) color = '#eab308';

      const icon = L.divIcon({
        className: 'ruta-marker',
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const lineas = (e.entrega_lineas || []).map(l =>
        `${l.cantidad} ${l.tipos_alfajor?.nombre || '?'}`
      ).join(', ');

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(Ruta.map);
      marker.bindPopup(`
        <strong>${esc(p.nombre)}</strong><br>
        ${lineas || e.cantidad + ' uds'}<br>
        ${fmtMoney(total)} · ${pagado >= total ? 'Pagado' : pagado > 0 ? 'Parcial' : 'Debe'}
      `);
      Ruta.markers.push(marker);
    });

    if (Ruta.markers.length > 0) {
      const group = L.featureGroup(Ruta.markers);
      Ruta.map.fitBounds(group.getBounds().pad(0.1));
    }

    const infoEl = document.getElementById('ruta-info');
    if (infoEl) {
      const parts = [`${entregas.length} entregas hoy`];
      if (withoutCoords > 0) parts.push(`${withoutCoords} sin ubicación`);
      infoEl.innerHTML = `<p class="text-sm text-muted" style="padding:8px 0;text-align:center">${parts.join(' · ')}</p>`;
    }

    Ruta.centerOnMe();
   } catch (err) {
    console.error('Ruta error:', err);
    showToast('Error cargando ruta');
   }
  },

  centerOnMe() {
    if (!navigator.geolocation || !Ruta.map) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        Ruta.map.setView([latitude, longitude], 14);
        if (Ruta._meMarker) Ruta.map.removeLayer(Ruta._meMarker);
        Ruta._meMarker = L.circleMarker([latitude, longitude], {
          radius: 8, fillColor: '#3b82f6', fillOpacity: 1, color: '#fff', weight: 2
        }).addTo(Ruta.map).bindPopup('Estás acá');
      },
      () => {}
    );
  }
};
