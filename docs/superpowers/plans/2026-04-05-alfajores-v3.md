# Alfajores Tracker v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add commission/payroll calculation per repartidor, delivery route map with GPS, and a read-only client portal for account statements.

**Architecture:** Three independent features sharing a single SQL migration. Each touches different parts of the existing vanilla JS SPA + Supabase backend. Leaflet (CDN) for maps, Web Geolocation API for GPS, Web Share API for link sharing. Portal uses a custom Supabase header (`x-client-token`) to bypass auth via RLS.

**Tech Stack:** Vanilla JS, Supabase (PostgreSQL + Auth + RLS), Leaflet 1.9 + OpenStreetMap, Web Geolocation API, Web Share API, SheetJS (existing).

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `sql/migration-v3.sql` | Create | DDL for new columns + RLS portal policies |
| `js/ruta.js` | Create | Map module — render Leaflet map with day's deliveries |
| `js/portal.js` | Create | Client portal — read-only account statement |
| `js/config.js` | Modify | Add comision_pct field to user edit/invite |
| `js/analisis.js` | Modify | Add Liquidación section at bottom |
| `js/excel.js` | Modify | Add Liquidación sheet to Emi export |
| `js/entregas.js` | Modify | Capture GPS after saving if punto lacks coords |
| `js/pagos.js` | Modify | Add "Compartir cuenta" button in debtor modal |
| `js/app.js` | Modify | Add routes `/ruta`, `/cliente/:token`; portal auth bypass |
| `js/supabase.js` | Modify | Add `createPortalClient(token)` helper |
| `index.html` | Modify | Leaflet CDN, new script tags, "Ruta" nav tab |
| `css/styles.css` | Modify | Map, portal, liquidación, FAB styles |
| `sw.js` | Modify | Cache bump, new JS files, exclude Leaflet CDN |

---

### Task 1: SQL Migration

**Files:**
- Create: `sql/migration-v3.sql`

- [ ] **Step 1: Create migration file**

```sql
-- =============================================
-- MIGRACIÓN V3: Comisiones, GPS, Portal cliente
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================

-- 1. Comisiones: campo en usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_pct numeric DEFAULT 0;

-- 2. Ruta: coordenadas en puntos_entrega
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS lng numeric;

-- 3. Portal: token en puntos_entrega
ALTER TABLE puntos_entrega ADD COLUMN IF NOT EXISTS client_token uuid DEFAULT gen_random_uuid();
UPDATE puntos_entrega SET client_token = gen_random_uuid() WHERE client_token IS NULL;
ALTER TABLE puntos_entrega ADD CONSTRAINT puntos_client_token_unique UNIQUE (client_token);

-- 4. RLS portal: entregas
CREATE POLICY "portal_entregas_select" ON entregas
  FOR SELECT USING (
    punto_entrega_id IN (
      SELECT id FROM puntos_entrega
      WHERE client_token::text = coalesce(
        current_setting('request.headers', true)::json->>'x-client-token', ''
      )
    )
  );

-- 5. RLS portal: entrega_lineas
CREATE POLICY "portal_lineas_select" ON entrega_lineas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND entregas.punto_entrega_id IN (
          SELECT id FROM puntos_entrega
          WHERE client_token::text = coalesce(
            current_setting('request.headers', true)::json->>'x-client-token', ''
          )
        )
    )
  );

-- 6. RLS portal: pagos
CREATE POLICY "portal_pagos_select" ON pagos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = pagos.entrega_id
        AND entregas.punto_entrega_id IN (
          SELECT id FROM puntos_entrega
          WHERE client_token::text = coalesce(
            current_setting('request.headers', true)::json->>'x-client-token', ''
          )
        )
    )
  );

-- 7. RLS portal: puntos_entrega (leer su propio punto)
CREATE POLICY "portal_puntos_select" ON puntos_entrega
  FOR SELECT USING (
    client_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-client-token', ''
    )
  );
```

- [ ] **Step 2: Commit**

```bash
git add sql/migration-v3.sql
git commit -m "feat: add v3 SQL migration (comisiones, GPS, portal)"
```

---

### Task 2: Comisiones — Config panel

**Files:**
- Modify: `js/config.js`

- [ ] **Step 1: Show comision_pct in user list**

In `Config.loadData()`, replace the usuarios list rendering (the `${(usuarios || []).map(u =>` block) with:

```javascript
          ${(usuarios || []).map(u => `
            <div class="config-item">
              <div class="config-item-info">
                <div class="config-item-name">${esc(u.nombre)}</div>
                <div class="config-item-detail">${esc(u.email || '')} · ${u.rol} · ${Number(u.comision_pct) || 0}% comisión</div>
              </div>
              <div class="config-item-actions">
                <button class="btn-icon" style="width:32px;height:32px" title="Editar"
                        onclick="Config.editUsuario('${u.id}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            </div>
          `).join('')}
```

- [ ] **Step 2: Add editUsuario method**

Add this method to the `Config` object, after `saveNewTipo()`:

```javascript
  editUsuario(id) {
    const slot = document.getElementById('config-invite-slot');
    if (!slot) return;
    db.from('usuarios').select('*').eq('id', id).single().then(({ data: u }) => {
      if (!u) return;
      slot.innerHTML = `
        <div class="card mt-8">
          <h3 class="mb-8">${esc(u.nombre)}</h3>
          <div class="form-group">
            <label class="form-label">Comisión %</label>
            <input class="form-input" id="edit-user-comision" type="number" min="0" max="100" step="0.5"
                   value="${Number(u.comision_pct) || 0}" inputmode="decimal">
          </div>
          <div class="form-group">
            <label class="form-label">Rol</label>
            <div class="toggle-group">
              <button type="button" class="toggle-btn ${u.rol === 'repartidor' ? 'active' : ''}"
                      onclick="Config.setInviteRol(this, 'repartidor')">Repartidor</button>
              <button type="button" class="toggle-btn ${u.rol === 'admin' ? 'active' : ''}"
                      onclick="Config.setInviteRol(this, 'admin')">Admin</button>
            </div>
            <input type="hidden" id="invite-rol" value="${u.rol}">
          </div>
          <button class="btn btn-primary btn-block" onclick="Config.saveUsuario('${u.id}')">Guardar</button>
        </div>
      `;
    });
  },

  async saveUsuario(id) {
    const comision = parseFloat(document.getElementById('edit-user-comision').value) || 0;
    const rol = document.getElementById('invite-rol').value;
    const { error } = await db.from('usuarios').update({ comision_pct: comision, rol }).eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Usuario actualizado');
    document.getElementById('config-invite-slot').innerHTML = '';
    Config.loadData();
  },
```

- [ ] **Step 3: Add comision field to invite form**

In `Config.showInviteForm()`, add this form group after the Rol toggle group and before the submit button:

```html
        <div class="form-group">
          <label class="form-label">Comisión %</label>
          <input class="form-input" id="invite-comision" type="number" min="0" max="100" step="0.5"
                 value="0" inputmode="decimal">
        </div>
```

- [ ] **Step 4: Save comision in sendInvite**

In `Config.sendInvite()`, after the line `rol: rol` in the `db.from('usuarios').insert({...})` call, add:

```javascript
          comision_pct: parseFloat(document.getElementById('invite-comision').value) || 0
```

- [ ] **Step 5: Commit**

```bash
git add js/config.js
git commit -m "feat: add comision_pct to user config panel"
```

---

### Task 3: Comisiones — Liquidación in Análisis

**Files:**
- Modify: `js/analisis.js`

- [ ] **Step 1: Add Liquidación section to render HTML**

In `Analisis.render()`, after the line `<div id="anal-deudores"><div class="spinner mt-8"></div></div>`, add:

```html
      <div class="section-title">Liquidación</div>
      <div id="anal-liquidacion"><div class="spinner mt-8"></div></div>
```

- [ ] **Step 2: Fetch usuarios with comision_pct in loadData**

In `Analisis.loadData()`, after the line `await Tipos.fetchAll();`, add:

```javascript
    const { data: usuariosData } = await db.from('usuarios').select('id, nombre, comision_pct');
    const usuariosMap = {};
    (usuariosData || []).forEach(u => { usuariosMap[u.id] = u; });
```

- [ ] **Step 3: Render liquidación table**

At the end of `Analisis.loadData()`, before the line `Analisis._data = { entregas, from, to };`, add:

```javascript
    // Liquidación
    const liqMap = {};
    entregas.forEach(e => {
      const key = e.repartidor_id;
      if (!liqMap[key]) {
        const u = usuariosMap[key] || {};
        liqMap[key] = { nombre: u.nombre || e.usuarios?.nombre || '?', entregas: 0, vendido: 0, cobrado: 0, pct: Number(u.comision_pct) || 0 };
      }
      liqMap[key].entregas++;
      liqMap[key].vendido += Number(e.monto_total);
      liqMap[key].cobrado += Number(e.monto_pagado);
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
              <span>Repartidor</span><span>Vendido</span><span>%</span><span>A pagar</span>
            </div>
            ${liqRank.map(r => `
              <div class="liq-row">
                <span>${esc(r.nombre)}</span>
                <span>${fmtMoney(r.vendido)}</span>
                <span>${r.pct}%</span>
                <span style="color:var(--accent);font-weight:600">${fmtMoney(r.vendido * r.pct / 100)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }
```

- [ ] **Step 4: Store usuariosMap in _data for Excel export**

Change the `Analisis._data` assignment to:

```javascript
    Analisis._data = { entregas, from, to, usuariosMap };
```

- [ ] **Step 5: Commit**

```bash
git add js/analisis.js
git commit -m "feat: add liquidación section to análisis module"
```

---

### Task 4: Comisiones — Excel export sheet

**Files:**
- Modify: `js/excel.js`

- [ ] **Step 1: Add Liquidación sheet to exportEmi**

In `ExcelExport.exportEmi()`, after the line `XLSX.utils.book_append_sheet(wb, ws2, 'Ingresos y Ganancias');` and before `XLSX.writeFile(...)`, add:

```javascript
    // Hoja 3: Liquidación
    const liqMap = {};
    const usuariosMap = Analisis._data?.usuariosMap || {};
    entregas.forEach(e => {
      const key = e.repartidor_id;
      if (!liqMap[key]) {
        const u = usuariosMap[key] || {};
        liqMap[key] = { nombre: u.nombre || e.usuarios?.nombre || '?', entregas: 0, vendido: 0, cobrado: 0, pct: Number(u.comision_pct) || 0 };
      }
      liqMap[key].entregas++;
      liqMap[key].vendido += Number(e.monto_total);
      liqMap[key].cobrado += Number(e.monto_pagado);
    });
    const liqRows = Object.values(liqMap).sort((a, b) => b.vendido - a.vendido);
    const liqHeader = ['Repartidor', 'Entregas', 'Vendido', 'Cobrado', 'Comisión %', 'A pagar'];
    const liqData = liqRows.map(r => [r.nombre, r.entregas, r.vendido, r.cobrado, r.pct, r.vendido * r.pct / 100]);
    const ws3 = XLSX.utils.aoa_to_sheet([liqHeader, ...liqData]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Liquidación');
```

- [ ] **Step 2: Commit**

```bash
git add js/excel.js
git commit -m "feat: add Liquidación sheet to Excel export"
```

---

### Task 5: Ruta — Map module

**Files:**
- Create: `js/ruta.js`

- [ ] **Step 1: Create ruta.js**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add js/ruta.js
git commit -m "feat: add Ruta map module with Leaflet"
```

---

### Task 6: Ruta — GPS capture on entrega save

**Files:**
- Modify: `js/entregas.js`

- [ ] **Step 1: Add GPS capture after successful save**

In `Entregas.handleSave()`, after the line `showToast(editId ? 'Entrega actualizada' : 'Entrega guardada');` and before `window.location.hash = '#/';`, add:

```javascript
      // Capture GPS for punto if missing coords
      if (puntoId && navigator.geolocation) {
        const punto = Puntos.cache.find(p => p.id === puntoId);
        if (punto && punto.lat == null) {
          navigator.geolocation.getCurrentPosition(async (pos) => {
            await db.from('puntos_entrega').update({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            }).eq('id', puntoId);
          }, () => {});
        }
      }
```

- [ ] **Step 2: Commit**

```bash
git add js/entregas.js
git commit -m "feat: capture GPS coordinates on first delivery to a punto"
```

---

### Task 7: Portal — Supabase portal client helper

**Files:**
- Modify: `js/supabase.js`

- [ ] **Step 1: Add createPortalClient function**

At the end of `js/supabase.js`, after the `showToast` function, add:

```javascript
/** Create a Supabase client with a portal token header for client access */
function createPortalClient(token) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { 'x-client-token': token }
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/supabase.js
git commit -m "feat: add createPortalClient helper for client portal"
```

---

### Task 8: Portal — Client portal module

**Files:**
- Create: `js/portal.js`

- [ ] **Step 1: Create portal.js**

```javascript
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
                      <div class="text-xs text-muted">Pago: ${fmtMoney(p.monto)} (${esc(p.forma_pago)}) — ${fmtDateTime(p.fecha)}</div>
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
```

- [ ] **Step 2: Commit**

```bash
git add js/portal.js
git commit -m "feat: add client portal module (read-only account view)"
```

---

### Task 9: Portal — Share button in debtor modal

**Files:**
- Modify: `js/pagos.js`

- [ ] **Step 1: Add Compartir cuenta button**

In `Pagos.showDeudorModal()`, after the "Pagar todo" button line (`<button class="btn btn-primary btn-block mb-16"` ... `>Pagar todo ...`), add:

```javascript
        <button class="btn btn-secondary btn-block mb-16"
                onclick="Pagos.sharePortal('${puntoId}')">Compartir cuenta</button>
```

- [ ] **Step 2: Add sharePortal method**

Add this method to the `Pagos` object, after the `pagarTodo` method:

```javascript
  async sharePortal(puntoId) {
    const { data } = await db.from('puntos_entrega').select('client_token').eq('id', puntoId).single();
    if (!data || !data.client_token) { showToast('Token no disponible'); return; }

    const url = window.location.origin + window.location.pathname + '#/cliente/' + data.client_token;

    if (navigator.share) {
      navigator.share({ title: 'Cuenta corriente', url }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showToast('Link copiado al portapapeles');
    } else {
      prompt('Copiá este link:', url);
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add js/pagos.js
git commit -m "feat: add share portal link button in debtor modal"
```

---

### Task 10: Wiring — Routes, nav, scripts, CDN, cache

**Files:**
- Modify: `js/app.js`
- Modify: `index.html`
- Modify: `sw.js`

- [ ] **Step 1: Update app.js routes and portal handling**

Replace the entire `js/app.js` content with:

```javascript
const App = {
  currentRoute: null,

  routes: {
    '/': () => Dashboard.render(),
    '/entrega': () => Entregas.renderForm(),
    '/historial': () => Historial.render(),
    '/ruta': () => Ruta.render(),
    '/analisis': () => Analisis.render(),
    '/config': () => Config.render(),
  },

  init() {
    window.addEventListener('hashchange', () => App.navigate());

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = '#' + btn.dataset.route;
      });
    });

    db.auth.onAuthStateChange((event, session) => {
      if (session) {
        Auth.onLogin(session).then(() => {
          document.getElementById('bottom-nav').hidden = false;
          App.navigate();
        });
      } else {
        Auth.currentUser = null;
        Auth.currentProfile = null;
        // Check if this is a portal route — no login needed
        const hash = window.location.hash.slice(1) || '/';
        if (hash.startsWith('/cliente/')) {
          App.navigate();
        } else {
          document.getElementById('bottom-nav').hidden = true;
          Auth.renderLogin();
        }
      }
    });
  },

  navigate() {
    const hash = window.location.hash.slice(1) || '/';

    // Portal route: /cliente/{token}
    if (hash.startsWith('/cliente/')) {
      const token = hash.replace('/cliente/', '');
      App.currentRoute = '/cliente';
      document.getElementById('bottom-nav').hidden = true;
      Portal.render(token);
      return;
    }

    // Regular routes require auth
    if (!Auth.currentUser) return;

    const route = App.routes[hash];
    if (!route) {
      window.location.hash = '#/';
      return;
    }
    App.currentRoute = hash;
    App.updateNav(hash);

    const appEl = document.getElementById('app');
    const html = route();
    if (typeof html === 'string') {
      appEl.innerHTML = '<div class="screen">' + html + '</div>';
    }
  },

  updateNav(hash) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const isActive = btn.dataset.route === hash;
      btn.classList.toggle('active', isActive);
    });
    // Hide Análisis tab for non-admin
    const analBtn = document.querySelector('[data-route="/analisis"]');
    if (analBtn && Auth.currentProfile) {
      analBtn.style.display = Auth.currentProfile.rol === 'admin' ? '' : 'none';
    }
  },

  setContent(html) {
    document.getElementById('app').innerHTML = '<div class="screen">' + html + '</div>';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
```

- [ ] **Step 2: Update index.html — add Leaflet CDN, scripts, Ruta nav tab**

In `<head>`, after the Inter font link, add:

```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css">
```

In the `<nav id="bottom-nav">`, after the Historial button and before the Análisis button, add:

```html
    <button class="nav-btn" data-route="/ruta">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      <span>Ruta</span>
    </button>
```

Before the closing `</body>`, after the Supabase CDN script and before `js/supabase.js`, add:

```html
  <script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"></script>
```

After the `js/config.js` script tag and before `js/app.js`, add:

```html
  <script src="js/ruta.js"></script>
  <script src="js/portal.js"></script>
```

- [ ] **Step 3: Update sw.js — bump cache, add files, exclude Leaflet**

Replace `sw.js` content with:

```javascript
const CACHE_NAME = 'alfajores-v9';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/supabase.js',
  './js/auth.js',
  './js/app.js',
  './js/puntos.js',
  './js/tipos.js',
  './js/pagos.js',
  './js/entregas.js',
  './js/dashboard.js',
  './js/historial.js',
  './js/analisis.js',
  './js/excel.js',
  './js/config.js',
  './js/ruta.js',
  './js/portal.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('cdn.sheetjs.com')) return;
  if (e.request.url.includes('cdn.jsdelivr.net')) return;
  if (e.request.url.includes('unpkg.com')) return;
  if (e.request.url.includes('tile.openstreetmap.org')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js index.html sw.js
git commit -m "feat: wire v3 routes, Leaflet CDN, Ruta nav tab, portal route"
```

---

### Task 11: CSS — Styles for map, portal, liquidación

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append v3 CSS**

At the end of `css/styles.css`, add:

```css
/* ══════════════════════════════════════
   V3 ADDITIONS
   ══════════════════════════════════════ */

/* ── Map ── */
.ruta-marker { background: none; border: none; }
.fab-location {
  position: fixed;
  bottom: calc(var(--nav-height) + 24px);
  right: 16px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: #000;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,.3);
  z-index: 1000;
  cursor: pointer;
}
.fab-location:active { transform: scale(0.92); }

/* Leaflet popup dark override */
.leaflet-popup-content-wrapper {
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border-radius: var(--radius-sm) !important;
  box-shadow: 0 2px 12px rgba(0,0,0,.4) !important;
}
.leaflet-popup-tip { background: var(--bg-secondary) !important; }
.leaflet-popup-content { margin: 10px 14px !important; font-size: 0.85rem; }

/* ── Liquidación table ── */
.liq-table { display: flex; flex-direction: column; gap: 2px; }
.liq-header, .liq-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 0.7fr 1.5fr;
  gap: 8px;
  padding: 8px 4px;
  align-items: center;
  font-size: 0.85rem;
}
.liq-header {
  color: var(--text-muted);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
}
.liq-row { border-bottom: 1px solid var(--border); }
.liq-row:last-child { border-bottom: none; }

/* ── Portal ── */
.portal-screen { padding-bottom: 40px; }
.portal-header {
  text-align: center;
  padding: 24px 0 16px;
}
.portal-logo {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  margin-bottom: 8px;
}
.portal-entrega {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 8px;
}
.portal-entrega-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 0.85rem;
}
.portal-entrega-detail {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.portal-pagos {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.portal-footer {
  text-align: center;
  padding: 32px 0 16px;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat: add v3 CSS for map, portal, and liquidación"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Comisiones: comision_pct field (Task 1 migration + Task 2 config), liquidación in análisis (Task 3), Excel sheet (Task 4)
- ✅ Ruta: lat/lng fields (Task 1), Leaflet map (Task 5), GPS capture (Task 6), nav tab + CDN (Task 10)
- ✅ Portal: client_token (Task 1), RLS policies (Task 1), portal client (Task 7), portal UI (Task 8), share button (Task 9), route (Task 10)

**2. Placeholder scan:** None found. All tasks have complete code.

**3. Type consistency:**
- `comision_pct` used consistently across migration, config, analisis, excel
- `lat`/`lng` used consistently in migration, entregas GPS capture, ruta map
- `client_token` used consistently in migration, portal, share button
- `createPortalClient(token)` defined in Task 7, used in Task 8
- `Portal.render(token)` defined in Task 8, called in Task 10 (app.js)
- `Ruta.render()` defined in Task 5, called in Task 10 (app.js routes)
