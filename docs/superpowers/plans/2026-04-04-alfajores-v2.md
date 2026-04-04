# Alfajores Tracker v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the alfajores tracker to support 4 alfajor types with independent pricing/costs, payment management for fiado entries, a full analytics module with Excel export, and an admin configuration panel.

**Architecture:** Vanilla JS PWA with Supabase backend. New tables (`tipos_alfajor`, `entrega_lineas`, `pagos`) extend the existing schema. The `entregas` table keeps its aggregated fields for backward compatibility. New JS modules (`analisis.js`, `config.js`, `tipos.js`) follow the same global-object pattern as existing modules. SheetJS generates Excel files client-side.

**Tech Stack:** Vanilla JS, Supabase (PostgreSQL + Auth + RLS), SheetJS (xlsx) via CDN, CSS custom properties, PWA Service Worker.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `sql/migration-v2.sql` | Create | DDL for new tables, seed data, RLS policies, data migration |
| `js/tipos.js` | Create | Fetch and cache `tipos_alfajor`, helper for rendering type rows |
| `js/pagos.js` | Create | Payment registration logic, payment history rendering, debtor modal |
| `js/analisis.js` | Create | Full analytics module replacing resumenes |
| `js/config.js` | Create | Admin panel: manage types and users |
| `js/excel.js` | Create | Excel export logic (both formats) |
| `js/entregas.js` | Rewrite | Multi-type line form with per-type quantity/price/cost |
| `js/historial.js` | Modify | Detail modal with type breakdown and payment registration |
| `js/dashboard.js` | Modify | Interactive debtors, updated metrics |
| `js/app.js` | Modify | Add routes for `/config`, rename `/resumenes` → `/analisis` |
| `css/styles.css` | Modify | Add styles for type lines, payment forms, config panel, badge-yellow |
| `index.html` | Modify | Add new script tags, SheetJS CDN, update nav label |
| `sw.js` | Modify | Bump cache version, update asset list |

---

### Task 1: SQL Migration Script

**Files:**
- Create: `sql/migration-v2.sql`

This script is executed manually in the Supabase SQL Editor. It creates the 3 new tables, seeds the 4 alfajor types, migrates existing entregas into entrega_lineas, and sets up RLS policies.

- [ ] **Step 1: Write the migration SQL**

Create `sql/migration-v2.sql` with this content:

```sql
-- =============================================
-- MIGRACIÓN V2: Tipos de alfajor, líneas y pagos
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- =============================================

-- 1. Tabla tipos_alfajor
CREATE TABLE IF NOT EXISTS tipos_alfajor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  es_reventa boolean DEFAULT false,
  activo boolean DEFAULT true,
  orden int DEFAULT 0,
  costo_default numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tipos_alfajor ENABLE ROW LEVEL SECURITY;

-- 2. Seed: 4 tipos iniciales
INSERT INTO tipos_alfajor (nombre, es_reventa, orden) VALUES
  ('Glaseado Premium', false, 1),
  ('Glaseado Común', false, 2),
  ('Maicena', true, 3),
  ('Miel', true, 4);

-- 3. Tabla entrega_lineas
CREATE TABLE IF NOT EXISTS entrega_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  tipo_alfajor_id uuid NOT NULL REFERENCES tipos_alfajor(id),
  cantidad int NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  UNIQUE(entrega_id, tipo_alfajor_id)
);

ALTER TABLE entrega_lineas ENABLE ROW LEVEL SECURITY;

-- 4. Tabla pagos
CREATE TABLE IF NOT EXISTS pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  monto numeric NOT NULL CHECK (monto > 0),
  forma_pago text NOT NULL CHECK (forma_pago IN ('efectivo', 'transferencia')),
  fecha timestamptz NOT NULL DEFAULT now(),
  registrado_por uuid REFERENCES usuarios(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;

-- 5. Migrar entregas existentes → entrega_lineas
-- Asigna todas las entregas existentes al primer tipo (Glaseado Premium)
INSERT INTO entrega_lineas (entrega_id, tipo_alfajor_id, cantidad, precio_unitario, costo_unitario)
SELECT
  e.id,
  (SELECT id FROM tipos_alfajor WHERE nombre = 'Glaseado Premium' LIMIT 1),
  e.cantidad,
  e.precio_unitario,
  0
FROM entregas e
WHERE e.cantidad > 0
  AND NOT EXISTS (SELECT 1 FROM entrega_lineas el WHERE el.entrega_id = e.id);

-- 6. RLS: tipos_alfajor
CREATE POLICY "tipos_select" ON tipos_alfajor
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "tipos_insert" ON tipos_alfajor
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "tipos_update" ON tipos_alfajor
  FOR UPDATE USING (is_admin());

CREATE POLICY "tipos_delete" ON tipos_alfajor
  FOR DELETE USING (is_admin());

-- 7. RLS: entrega_lineas (same access as parent entrega)
CREATE POLICY "lineas_select" ON entrega_lineas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "lineas_insert" ON entrega_lineas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "lineas_delete" ON entrega_lineas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = entrega_lineas.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

-- 8. RLS: pagos
CREATE POLICY "pagos_select" ON pagos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entregas
      WHERE entregas.id = pagos.entrega_id
        AND (entregas.repartidor_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "pagos_insert" ON pagos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "pagos_delete" ON pagos
  FOR DELETE USING (is_admin());
```

- [ ] **Step 2: Verify SQL syntax**

Read through the SQL and confirm:
- `is_admin()` function already exists from `sql/rls-produccion.sql`
- The `entregas` table has columns `id`, `cantidad`, `precio_unitario`
- The `usuarios` table has column `id`

- [ ] **Step 3: Commit**

```bash
git add sql/migration-v2.sql
git commit -m "feat: add v2 migration script for tipos_alfajor, entrega_lineas, pagos"
```

---

### Task 2: CSS Additions

**Files:**
- Modify: `css/styles.css` (append at end)

Add all new styles needed for v2 features: type line rows in the entrega form, payment form, badge-yellow for partial payments, config panel, analytics grid with 6 cards, and the export modal.

- [ ] **Step 1: Add new CSS rules**

Append the following to the end of `css/styles.css`:

```css
/* ══════════════════════════════════════
   V2 ADDITIONS
   ══════════════════════════════════════ */

/* ── Badge: partial payment ── */
.badge-yellow { background: rgba(234, 179, 8, 0.12); color: #eab308; }

/* ── Type line rows (entrega form) ── */
.type-line {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 8px;
}
.type-line-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.type-line-name .reventa-tag {
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-input);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
.type-line-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}
.type-line-fields .form-input {
  min-height: 40px;
  padding: 8px 10px;
  font-size: 0.9rem;
}
.type-line-fields label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3px;
  display: block;
}

/* ── Payment form (inline in modal) ── */
.pago-form {
  background: var(--accent-bg);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-top: 12px;
}
.pago-form .form-group { margin-bottom: 10px; }
.pago-form .form-label { font-size: 0.7rem; }

.pago-historial {
  margin-top: 12px;
}
.pago-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
.pago-item:last-child { border-bottom: none; }
.pago-item-date { color: var(--text-muted); font-size: 0.75rem; }

/* ── Deudor modal ── */
.deudor-entrega {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 8px;
}
.deudor-entrega-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.deudor-entrega-detail {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* ── Metrics grid: 6 cards (2 rows × 3) ── */
.metrics-grid-6 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

/* ── Type breakdown list ── */
.type-breakdown-item {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  font-size: 0.85rem;
}
.type-breakdown-item .type-name { font-weight: 500; }
.type-breakdown-item .type-stat {
  text-align: right;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* ── Comparison chips ── */
.comparison-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.comparison-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 0.8rem;
}
.comparison-chip .positive { color: var(--green); }
.comparison-chip .negative { color: var(--red); }

/* ── Config panel ── */
.config-section {
  margin-bottom: 24px;
}
.config-section-title {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
}
.config-item-info { flex: 1; min-width: 0; }
.config-item-name { font-weight: 500; font-size: 0.9rem; }
.config-item-detail { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.config-item-actions { display: flex; gap: 6px; flex-shrink: 0; }

.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--transition);
}
.toggle-switch.on { background: var(--green); border-color: var(--green); }
.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--text-primary);
  border-radius: 50%;
  transition: transform var(--transition);
}
.toggle-switch.on::after { transform: translateX(20px); }

/* ── Export modal ── */
.export-option {
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all var(--transition);
}
.export-option:active { background: var(--bg-card-hover); border-color: var(--accent); }
.export-option-title { font-weight: 600; margin-bottom: 4px; }
.export-option-desc { font-size: 0.8rem; color: var(--text-muted); }

/* ── Date range picker ── */
.date-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.date-range .form-input {
  min-height: 36px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

/* ── Detail modal: line breakdown ── */
.detail-lines {
  margin: 8px 0;
}
.detail-line {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.detail-line-type { font-weight: 500; color: var(--text-primary); }
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat: add v2 CSS for type lines, payments, analytics, config panel"
```

---

### Task 3: Tipos Module

**Files:**
- Create: `js/tipos.js`

A small helper module (like `Puntos`) that fetches and caches `tipos_alfajor` from Supabase. Used by entregas form, analytics, excel export, and config panel.

- [ ] **Step 1: Create the Tipos module**

Create `js/tipos.js`:

```javascript
const Tipos = {
  cache: [],

  async fetchAll() {
    const { data, error } = await db
      .from('tipos_alfajor')
      .select('*')
      .order('orden');
    if (error) console.error('Error cargando tipos:', error);
    Tipos.cache = data || [];
    return Tipos.cache;
  },

  activos() {
    return Tipos.cache.filter(t => t.activo);
  },

  nombre(id) {
    const t = Tipos.cache.find(t => t.id === id);
    return t ? t.nombre : '?';
  },

  /** Get last used price for a type from localStorage */
  getLastPrecio(tipoId) {
    return parseFloat(localStorage.getItem('lastPrecio_' + tipoId)) || '';
  },

  /** Get last used cost for a type from localStorage */
  getLastCosto(tipoId) {
    return parseFloat(localStorage.getItem('lastCosto_' + tipoId)) || '';
  },

  /** Save last used price/cost for a type */
  saveLast(tipoId, precio, costo) {
    if (precio) localStorage.setItem('lastPrecio_' + tipoId, precio);
    if (costo) localStorage.setItem('lastCosto_' + tipoId, costo);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add js/tipos.js
git commit -m "feat: add Tipos module for alfajor type management"
```

---

### Task 4: Pagos Module

**Files:**
- Create: `js/pagos.js`

Shared module for payment registration and debtor management. Used by historial (detail modal), dashboard (debtors section), and analytics.

- [ ] **Step 1: Create the Pagos module**

Create `js/pagos.js`:

```javascript
const Pagos = {
  /** Register a payment for an entrega */
  async registrar(entregaId, monto, formaPago) {
    const { error: pagoErr } = await db.from('pagos').insert({
      entrega_id: entregaId,
      monto: monto,
      forma_pago: formaPago,
      registrado_por: Auth.currentUser.id
    });
    if (pagoErr) throw pagoErr;

    // Update monto_pagado on the entrega
    const { data: entrega } = await db.from('entregas')
      .select('monto_pagado')
      .eq('id', entregaId)
      .single();

    const nuevoMontoPagado = Number(entrega.monto_pagado) + monto;
    const { error: updateErr } = await db.from('entregas')
      .update({ monto_pagado: nuevoMontoPagado })
      .eq('id', entregaId);
    if (updateErr) throw updateErr;

    return nuevoMontoPagado;
  },

  /** Fetch payment history for an entrega */
  async historial(entregaId) {
    const { data, error } = await db.from('pagos')
      .select('*, usuarios(nombre)')
      .eq('entrega_id', entregaId)
      .order('fecha', { ascending: false });
    if (error) console.error('Error cargando pagos:', error);
    return data || [];
  },

  /** Render the payment registration form (inline HTML) */
  renderFormInline(entregaId, deudaRestante) {
    return `
      <div class="pago-form" id="pago-form-${entregaId}">
        <div class="form-group">
          <label class="form-label">Monto a pagar</label>
          <input class="form-input" id="pago-monto-${entregaId}" type="number"
                 min="1" step="1" value="${deudaRestante}" inputmode="numeric">
        </div>
        <div class="form-group">
          <label class="form-label">Forma de pago</label>
          <div class="toggle-group">
            <button type="button" class="toggle-btn active"
                    onclick="Pagos.setFormaPago('${entregaId}', this, 'efectivo')">Efectivo</button>
            <button type="button" class="toggle-btn"
                    onclick="Pagos.setFormaPago('${entregaId}', this, 'transferencia')">Transfer.</button>
          </div>
          <input type="hidden" id="pago-forma-${entregaId}" value="efectivo">
        </div>
        <button class="btn btn-primary btn-block"
                onclick="Pagos.confirmar('${entregaId}')">Confirmar pago</button>
      </div>
    `;
  },

  setFormaPago(entregaId, btn, valor) {
    const container = document.getElementById('pago-form-' + entregaId);
    container.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('pago-forma-' + entregaId).value = valor;
  },

  async confirmar(entregaId) {
    const monto = parseFloat(document.getElementById('pago-monto-' + entregaId).value);
    const forma = document.getElementById('pago-forma-' + entregaId).value;

    if (!monto || monto <= 0) {
      showToast('Ingresá un monto válido');
      return;
    }

    try {
      await Pagos.registrar(entregaId, monto, forma);
      showToast('Pago registrado');
      // Close any modal and refresh the current view
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      if (App.currentRoute === '/historial') Historial.fetchEntregas();
      else if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
    } catch (err) {
      console.error('Error registrando pago:', err);
      showToast('Error: ' + (err.message || err));
    }
  },

  /** Render payment history list */
  renderHistorial(pagos) {
    if (!pagos || pagos.length === 0) {
      return '<p class="text-sm text-muted" style="padding:4px 0">Sin pagos registrados</p>';
    }
    return '<div class="pago-historial">' + pagos.map(p => `
      <div class="pago-item">
        <div>
          <span>${fmtMoney(p.monto)}</span>
          <span class="text-muted text-xs" style="margin-left:6px">${esc(p.forma_pago)}</span>
        </div>
        <div>
          <span class="pago-item-date">${fmtDateTime(p.fecha)}</span>
          <span class="text-xs text-muted" style="margin-left:4px">${esc(p.usuarios?.nombre || '')}</span>
        </div>
      </div>
    `).join('') + '</div>';
  },

  /** Get payment status badge HTML */
  badge(montoPagado, montoTotal) {
    const pagado = Number(montoPagado);
    const total = Number(montoTotal);
    if (pagado >= total) return '<span class="badge badge-green">Pagado</span>';
    if (pagado > 0) return '<span class="badge badge-yellow">Parcial</span>';
    return '<span class="badge badge-red">Debe</span>';
  },

  /** Show debtor modal with all unpaid entregas for a punto */
  async showDeudorModal(puntoId, puntoNombre) {
    const { data } = await db.from('entregas')
      .select('*, entrega_lineas(*, tipos_alfajor(nombre))')
      .eq('punto_entrega_id', puntoId)
      .order('fecha_hora', { ascending: false });

    const impagas = (data || []).filter(e => Number(e.monto_pagado) < Number(e.monto_total));

    if (impagas.length === 0) {
      showToast('Sin deudas pendientes');
      return;
    }

    const totalDeuda = impagas.reduce((s, e) => s + Number(e.monto_total) - Number(e.monto_pagado), 0);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>${esc(puntoNombre)}</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="flex-between mb-16">
          <span class="text-sm text-muted">${impagas.length} entregas pendientes</span>
          <span class="text-red" style="font-weight:700">${fmtMoney(totalDeuda)}</span>
        </div>
        <button class="btn btn-primary btn-block mb-16"
                onclick="Pagos.pagarTodo('${puntoId}', this)">Pagar todo (${fmtMoney(totalDeuda)})</button>
        ${impagas.map(e => {
          const deuda = Number(e.monto_total) - Number(e.monto_pagado);
          const lineas = (e.entrega_lineas || []).map(l =>
            `${esc(l.tipos_alfajor?.nombre || '?')}: ${l.cantidad}`
          ).join(', ');
          return `
            <div class="deudor-entrega">
              <div class="deudor-entrega-header">
                <span class="text-sm">${fmtDateTime(e.fecha_hora)}</span>
                <span class="text-red" style="font-weight:600">${fmtMoney(deuda)}</span>
              </div>
              <div class="deudor-entrega-detail">${lineas || e.cantidad + ' uds'}</div>
              <div class="deudor-entrega-detail">Total: ${fmtMoney(e.monto_total)} · Pagado: ${fmtMoney(e.monto_pagado)}</div>
              <div id="pago-slot-${e.id}" style="margin-top:8px">
                <button class="btn btn-secondary btn-block" style="min-height:36px;font-size:0.8rem"
                        onclick="this.parentElement.innerHTML = Pagos.renderFormInline('${e.id}', ${deuda})">
                  Registrar pago
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    document.body.appendChild(overlay);
  },

  /** Pay all unpaid entregas for a punto */
  async pagarTodo(puntoId, btn) {
    btn.disabled = true;
    btn.textContent = 'Procesando...';

    try {
      const { data } = await db.from('entregas')
        .select('id, monto_total, monto_pagado')
        .eq('punto_entrega_id', puntoId);

      const impagas = (data || []).filter(e => Number(e.monto_pagado) < Number(e.monto_total));

      for (const e of impagas) {
        const deuda = Number(e.monto_total) - Number(e.monto_pagado);
        await Pagos.registrar(e.id, deuda, 'efectivo');
      }

      showToast('Todas las deudas saldadas');
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      if (App.currentRoute === '/') Dashboard.loadData();
      else if (App.currentRoute === '/analisis') Analisis.loadData();
    } catch (err) {
      console.error('Error pagando todo:', err);
      showToast('Error: ' + (err.message || err));
      btn.disabled = false;
      btn.textContent = 'Reintentar';
    }
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add js/pagos.js
git commit -m "feat: add Pagos module for payment registration and debtor management"
```

---

### Task 5: Rewrite Entregas Form

**Files:**
- Modify: `js/entregas.js` (full rewrite)

The form now shows one row per active alfajor type with fields for quantity, sale price, and cost. Total is calculated as the sum of all lines. When editing, existing `entrega_lineas` are loaded and pre-filled.

- [ ] **Step 1: Rewrite entregas.js**

Replace the entire content of `js/entregas.js` with:

```javascript
const Entregas = {
  renderForm(entrega) {
    const isEdit = !!entrega;
    const e = entrega || {};

    Promise.all([Puntos.fetchAll(), Tipos.fetchAll()]).then(async () => {
      let existingLineas = [];
      if (isEdit) {
        const { data } = await db.from('entrega_lineas')
          .select('*')
          .eq('entrega_id', e.id);
        existingLineas = data || [];
      }

      // Build a map of existing lines by tipo_alfajor_id
      const lineaMap = {};
      existingLineas.forEach(l => { lineaMap[l.tipo_alfajor_id] = l; });

      const now = new Date();
      const fechaDefault = e.fecha_hora
        ? new Date(e.fecha_hora).toISOString().slice(0, 16)
        : now.toISOString().slice(0, 16);

      const tipos = Tipos.activos();

      // Admin can assign to another repartidor
      let vendedorSelector = '';
      if (Auth.isAdmin()) {
        const { data: usuarios } = await db.from('usuarios').select('id, nombre');
        const opts = (usuarios || []).map(u =>
          `<option value="${u.id}" ${u.id === (e.repartidor_id || Auth.currentUser.id) ? 'selected' : ''}>${esc(u.nombre)}</option>`
        ).join('');
        vendedorSelector = `
          <div class="form-group">
            <label class="form-label">Vendedor</label>
            <select class="form-select" id="ent-vendedor">${opts}</select>
          </div>
        `;
      }

      App.setContent(`
        <div class="app-header">
          <h1>${isEdit ? 'Editar entrega' : 'Nueva entrega'}</h1>
          ${isEdit ? `<button class="btn-icon" onclick="window.location.hash='#/historial'">&times;</button>` : ''}
        </div>

        <form onsubmit="Entregas.handleSave(event, ${isEdit ? `'${e.id}'` : 'null'})">
          <div class="form-group">
            <label class="form-label">Punto de entrega</label>
            ${Puntos.renderSelector(e.punto_entrega_id)}
          </div>

          <div id="nuevo-punto-fields" class="hidden">
            <div class="form-group">
              <label class="form-label">Nombre del punto</label>
              <input class="form-input" id="ent-punto-nombre" placeholder="Ej: Kiosco Don Pedro">
            </div>
            <div class="form-group">
              <label class="form-label">Dirección</label>
              <input class="form-input" id="ent-punto-dir" placeholder="Calle y número">
            </div>
            <div class="form-group">
              <label class="form-label">Contacto</label>
              <input class="form-input" id="ent-punto-contacto" placeholder="Nombre de la persona">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">¿Quién recibió?</label>
            <input class="form-input" id="ent-recibio" value="${esc(e.recibio || '')}" placeholder="Nombre de quien recibió">
          </div>

          ${vendedorSelector}

          <div class="section-title">Alfajores</div>
          <div id="ent-lineas">
            ${tipos.map(t => {
              const linea = lineaMap[t.id];
              const cant = linea ? linea.cantidad : '';
              const precio = linea ? linea.precio_unitario : Tipos.getLastPrecio(t.id);
              const costo = linea ? linea.costo_unitario : (Tipos.getLastCosto(t.id) || t.costo_default || '');
              return `
                <div class="type-line" data-tipo-id="${t.id}">
                  <div class="type-line-name">
                    ${esc(t.nombre)}${t.es_reventa ? '<span class="reventa-tag">Reventa</span>' : ''}
                  </div>
                  <div class="type-line-fields">
                    <div>
                      <label>Cant.</label>
                      <input class="form-input ent-line-cant" type="number" min="0" step="1"
                             value="${cant}" placeholder="0" inputmode="numeric"
                             oninput="Entregas.calcTotal()">
                    </div>
                    <div>
                      <label>Precio</label>
                      <input class="form-input ent-line-precio" type="number" min="0" step="1"
                             value="${precio}" placeholder="$0" inputmode="numeric"
                             oninput="Entregas.calcTotal()">
                    </div>
                    <div>
                      <label>Costo</label>
                      <input class="form-input ent-line-costo" type="number" min="0" step="1"
                             value="${costo}" placeholder="$0" inputmode="numeric">
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="form-group">
            <label class="form-label">Total</label>
            <input class="form-input" id="ent-total" type="number" readonly
                   value="${e.monto_total || ''}" style="color:var(--accent);font-weight:700">
          </div>

          <div class="form-group">
            <label class="form-label">Monto pagado</label>
            <input class="form-input" id="ent-pagado" type="number" min="0" step="1"
                   value="${e.monto_pagado || ''}" placeholder="$0" inputmode="numeric">
          </div>

          <div class="form-group">
            <label class="form-label">Forma de pago</label>
            <div class="toggle-group">
              <button type="button" class="toggle-btn ${(e.forma_pago || 'efectivo') === 'efectivo' ? 'active' : ''}"
                      onclick="Entregas.setPago(this, 'efectivo')">Efectivo</button>
              <button type="button" class="toggle-btn ${e.forma_pago === 'transferencia' ? 'active' : ''}"
                      onclick="Entregas.setPago(this, 'transferencia')">Transfer.</button>
              <button type="button" class="toggle-btn ${e.forma_pago === 'fiado' ? 'active' : ''}"
                      onclick="Entregas.setPago(this, 'fiado')">Fiado</button>
            </div>
            <input type="hidden" id="ent-forma-pago" value="${e.forma_pago || 'efectivo'}">
          </div>

          <div class="form-group">
            <label class="form-label">Notas</label>
            <textarea class="form-textarea" id="ent-notas" placeholder="Observaciones (opcional)">${esc(e.notas || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Fecha y hora</label>
            <input class="form-input" id="ent-fecha" type="datetime-local" value="${fechaDefault}">
          </div>

          <button class="btn btn-primary btn-block btn-lg mt-16" type="submit" id="ent-submit">
            ${isEdit ? 'Actualizar' : 'Guardar entrega'}
          </button>
        </form>
      `);
    });

    return '<div class="loading-screen"><div class="spinner"></div></div>';
  },

  onPuntoChange() {
    const val = document.getElementById('ent-punto').value;
    const fields = document.getElementById('nuevo-punto-fields');
    fields.classList.toggle('hidden', val !== '__nuevo__');
  },

  calcTotal() {
    let total = 0;
    document.querySelectorAll('.type-line').forEach(line => {
      const cant = parseFloat(line.querySelector('.ent-line-cant').value) || 0;
      const precio = parseFloat(line.querySelector('.ent-line-precio').value) || 0;
      total += cant * precio;
    });
    document.getElementById('ent-total').value = total;
  },

  setPago(btn, value) {
    document.querySelectorAll('.toggle-group .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ent-forma-pago').value = value;
    if (value === 'fiado') {
      document.getElementById('ent-pagado').value = 0;
    }
  },

  /** Collect line data from the form */
  _collectLines() {
    const lines = [];
    document.querySelectorAll('.type-line').forEach(lineEl => {
      const tipoId = lineEl.dataset.tipoId;
      const cant = parseInt(lineEl.querySelector('.ent-line-cant').value) || 0;
      const precio = parseFloat(lineEl.querySelector('.ent-line-precio').value) || 0;
      const costo = parseFloat(lineEl.querySelector('.ent-line-costo').value) || 0;
      if (cant > 0) {
        lines.push({ tipo_alfajor_id: tipoId, cantidad: cant, precio_unitario: precio, costo_unitario: costo });
        Tipos.saveLast(tipoId, precio, costo);
      }
    });
    return lines;
  },

  async handleSave(ev, editId) {
    ev.preventDefault();
    const btn = document.getElementById('ent-submit');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      let puntoId = document.getElementById('ent-punto').value;

      // Create new punto if needed
      if (puntoId === '__nuevo__') {
        const nombre = document.getElementById('ent-punto-nombre').value.trim();
        if (!nombre) {
          showToast('Ingresá el nombre del punto');
          btn.disabled = false;
          btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
          return;
        }
        const punto = await Puntos.create({
          nombre,
          direccion: document.getElementById('ent-punto-dir').value.trim(),
          contacto: document.getElementById('ent-punto-contacto').value.trim()
        });
        puntoId = punto.id;
      }

      const lines = Entregas._collectLines();
      if (lines.length === 0) {
        showToast('Ingresá al menos un tipo de alfajor');
        btn.disabled = false;
        btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
        return;
      }

      // Calculate aggregates
      const cantidadTotal = lines.reduce((s, l) => s + l.cantidad, 0);
      const montoTotal = lines.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
      const precioPromedio = cantidadTotal > 0 ? montoTotal / cantidadTotal : 0;

      const fechaRaw = document.getElementById('ent-fecha').value;
      const fechaISO = new Date(fechaRaw).toISOString();

      const repartidorId = document.getElementById('ent-vendedor')
        ? document.getElementById('ent-vendedor').value
        : Auth.currentUser.id;

      const row = {
        fecha_hora: fechaISO,
        repartidor_id: repartidorId,
        punto_entrega_id: puntoId || null,
        punto_nombre_temp: puntoId ? '' : '',
        recibio: document.getElementById('ent-recibio').value.trim(),
        cantidad: cantidadTotal,
        precio_unitario: precioPromedio,
        monto_total: montoTotal,
        monto_pagado: parseFloat(document.getElementById('ent-pagado').value) || 0,
        forma_pago: document.getElementById('ent-forma-pago').value,
        notas: document.getElementById('ent-notas').value.trim()
      };

      let entregaId = editId;

      if (editId) {
        const { error } = await db.from('entregas').update(row).eq('id', editId);
        if (error) throw error;
        // Delete old lines, insert new ones
        await db.from('entrega_lineas').delete().eq('entrega_id', editId);
      } else {
        const { data, error } = await db.from('entregas').insert(row).select().single();
        if (error) throw error;
        entregaId = data.id;
      }

      // Insert lines
      const lineRows = lines.map(l => ({ ...l, entrega_id: entregaId }));
      const { error: lineErr } = await db.from('entrega_lineas').insert(lineRows);
      if (lineErr) throw lineErr;

      // If initial payment and not edit, register in pagos table
      if (!editId && row.monto_pagado > 0 && row.forma_pago !== 'fiado') {
        await db.from('pagos').insert({
          entrega_id: entregaId,
          monto: row.monto_pagado,
          forma_pago: row.forma_pago,
          registrado_por: Auth.currentUser.id
        });
      }

      showToast(editId ? 'Entrega actualizada' : 'Entrega guardada');
      window.location.hash = '#/';
    } catch (err) {
      console.error('Error guardando entrega:', err);
      showToast('Error: ' + (err.message || err));
      btn.disabled = false;
      btn.textContent = editId ? 'Actualizar' : 'Guardar entrega';
    }
  }
};
```

- [ ] **Step 2: Verify the form renders correctly**

Open the app in a browser, log in, and navigate to "Nueva entrega". Confirm:
- 4 type rows appear (Glaseado Premium, Glaseado Común, Maicena, Miel)
- Each has Cant/Precio/Costo fields
- Total auto-calculates when typing quantities and prices
- Fiado sets monto_pagado to 0

- [ ] **Step 3: Commit**

```bash
git add js/entregas.js
git commit -m "feat: rewrite entregas form with multi-type alfajor lines"
```

---

### Task 6: Update Historial with Type Breakdown and Payments

**Files:**
- Modify: `js/historial.js`

The detail modal now shows a per-type breakdown of the entrega (from `entrega_lineas`), payment history, and a "Registrar pago" button for unpaid entregas. The list view uses the new `Pagos.badge()` for partial payment indicators.

- [ ] **Step 1: Rewrite historial.js**

Replace the entire content of `js/historial.js`:

```javascript
const Historial = {
  filters: { periodo: 'semana', puntoId: '', repartidorId: '' },

  render() {
    Historial.loadData();
    return `
      <div class="app-header">
        <h1>Historial</h1>
      </div>
      <div class="filter-bar" id="hist-period-bar">
        <button class="filter-chip active" onclick="Historial.setPeriod(this, 'hoy')">Hoy</button>
        <button class="filter-chip" onclick="Historial.setPeriod(this, 'semana')">Semana</button>
        <button class="filter-chip" onclick="Historial.setPeriod(this, 'mes')">Mes</button>
        <button class="filter-chip" onclick="Historial.setPeriod(this, 'todo')">Todo</button>
      </div>
      <div id="hist-filters" class="mb-8" style="display:grid;grid-template-columns:1fr ${Auth.isAdmin() ? '1fr' : ''};gap:8px">
        <select class="form-select" id="hist-punto" onchange="Historial.onFilterChange()" style="min-height:40px;font-size:0.85rem">
          <option value="">Todos los puntos</option>
        </select>
        ${Auth.isAdmin() ? `
        <select class="form-select" id="hist-repartidor" onchange="Historial.onFilterChange()" style="min-height:40px;font-size:0.85rem">
          <option value="">Todos</option>
        </select>
        ` : ''}
      </div>
      <div id="hist-list"><div class="spinner mt-8"></div></div>
    `;
  },

  async loadData() {
    await Puntos.fetchAll();
    const puntoSel = document.getElementById('hist-punto');
    if (puntoSel) {
      const opts = Puntos.cache.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
      puntoSel.innerHTML = '<option value="">Todos los puntos</option>' + opts;
    }

    if (Auth.isAdmin()) {
      const { data: usuarios } = await db.from('usuarios').select('id, nombre');
      const repSel = document.getElementById('hist-repartidor');
      if (repSel && usuarios) {
        const opts = usuarios.map(u => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('');
        repSel.innerHTML = '<option value="">Todos</option>' + opts;
      }
    }

    const chips = document.querySelectorAll('#hist-period-bar .filter-chip');
    chips.forEach(c => c.classList.remove('active'));
    chips[1]?.classList.add('active');
    Historial.filters.periodo = 'semana';

    Historial.fetchEntregas();
  },

  setPeriod(chip, periodo) {
    document.querySelectorAll('#hist-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Historial.filters.periodo = periodo;
    Historial.fetchEntregas();
  },

  onFilterChange() {
    Historial.filters.puntoId = document.getElementById('hist-punto')?.value || '';
    const repEl = document.getElementById('hist-repartidor');
    Historial.filters.repartidorId = repEl ? repEl.value : '';
    Historial.fetchEntregas();
  },

  async fetchEntregas() {
    const listEl = document.getElementById('hist-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="spinner mt-8"></div>';

    let query = db.from('entregas')
      .select('*, puntos_entrega(nombre), entrega_lineas(*, tipos_alfajor(nombre))')
      .order('fecha_hora', { ascending: false });

    const now = new Date();
    if (Historial.filters.periodo === 'hoy') {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      query = query.gte('fecha_hora', today.toISOString());
    } else if (Historial.filters.periodo === 'semana') {
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('fecha_hora', weekAgo.toISOString());
    } else if (Historial.filters.periodo === 'mes') {
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
      query = query.gte('fecha_hora', monthAgo.toISOString());
    }

    if (Historial.filters.puntoId) {
      query = query.eq('punto_entrega_id', Historial.filters.puntoId);
    }

    if (Auth.isAdmin() && Historial.filters.repartidorId) {
      query = query.eq('repartidor_id', Historial.filters.repartidorId);
    } else if (!Auth.isAdmin()) {
      query = query.eq('repartidor_id', Auth.currentUser.id);
    }

    const { data } = await query.limit(100);

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><p>Sin entregas en este período</p></div>';
      return;
    }

    listEl.innerHTML = data.map(e => {
      const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
      const lineas = (e.entrega_lineas || []);
      const resumen = lineas.length > 0
        ? lineas.map(l => `${l.cantidad} ${l.tipos_alfajor?.nombre || '?'}`).join(', ')
        : e.cantidad + ' uds';
      return `
        <div class="list-item" onclick="Historial.showDetail('${e.id}')">
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

    Historial._data = data;
  },

  _data: [],

  async showDetail(id) {
    const e = Historial._data.find(x => x.id === id);
    if (!e) return;
    const nombre = e.puntos_entrega?.nombre || e.punto_nombre_temp || 'Sin punto';
    const saldo = Number(e.monto_total) - Number(e.monto_pagado);
    const lineas = e.entrega_lineas || [];

    // Fetch payment history
    const pagosHist = await Pagos.historial(e.id);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Detalle de entrega</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="card">
          <p><strong>Punto:</strong> ${esc(nombre)}</p>
          <p><strong>Recibió:</strong> ${esc(e.recibio || '-')}</p>
          <p><strong>Fecha:</strong> ${fmtDateTime(e.fecha_hora)}</p>

          ${lineas.length > 0 ? `
            <div class="detail-lines">
              ${lineas.map(l => `
                <div class="detail-line">
                  <span class="detail-line-type">${esc(l.tipos_alfajor?.nombre || '?')}</span>
                  <span>${l.cantidad} × ${fmtMoney(l.precio_unitario)} = ${fmtMoney(l.cantidad * l.precio_unitario)}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <p><strong>Cantidad:</strong> ${e.cantidad} unidades</p>
            <p><strong>Precio unitario:</strong> ${fmtMoney(e.precio_unitario)}</p>
          `}

          <p><strong>Total:</strong> ${fmtMoney(e.monto_total)}</p>
          <p><strong>Pagado:</strong> ${fmtMoney(e.monto_pagado)}</p>
          ${saldo > 0 ? `<p><strong>Debe:</strong> <span class="text-red">${fmtMoney(saldo)}</span></p>` : ''}
          <p><strong>Forma de pago:</strong> ${esc(e.forma_pago)}</p>
          ${e.notas ? `<p><strong>Notas:</strong> ${esc(e.notas)}</p>` : ''}
        </div>

        ${pagosHist.length > 0 ? `
          <div class="section-title">Historial de pagos</div>
          ${Pagos.renderHistorial(pagosHist)}
        ` : ''}

        <div class="flex gap-8 mt-16">
          <button class="btn btn-secondary w-full" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
          ${saldo > 0 ? `<button class="btn btn-primary w-full" id="detail-pagar-btn">Registrar pago</button>` : ''}
          <button class="btn btn-secondary w-full" id="edit-entrega-btn">Editar</button>
        </div>
        <div id="detail-pago-slot"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    if (saldo > 0) {
      document.getElementById('detail-pagar-btn').onclick = () => {
        document.getElementById('detail-pago-slot').innerHTML = Pagos.renderFormInline(e.id, saldo);
      };
    }

    document.getElementById('edit-entrega-btn').onclick = () => {
      overlay.remove();
      Entregas.renderForm(e);
    };
  }
};
```

- [ ] **Step 2: Verify in browser**

Open the app, go to Historial. Confirm:
- Entries show per-type breakdown in subtitle (e.g., "10 Glaseado Premium, 5 Maicena")
- Badge shows "Pagado", "Parcial", or "Debe" correctly
- Tapping an entry shows the detail modal with line breakdown
- "Registrar pago" button appears for unpaid entries and shows the payment form

- [ ] **Step 3: Commit**

```bash
git add js/historial.js
git commit -m "feat: update historial with type breakdown and payment registration"
```

---

### Task 7: Update Dashboard with Interactive Debtors

**Files:**
- Modify: `js/dashboard.js`

Debtors section becomes interactive — tapping a debtor opens the debtor modal from `Pagos`. Recent deliveries show the per-type summary and new badges.

- [ ] **Step 1: Rewrite dashboard.js**

Replace the entire content of `js/dashboard.js`:

```javascript
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

    // Top debtors (interactive)
    const { data: allEntregas } = await db.from('entregas')
      .select('punto_entrega_id, monto_total, monto_pagado, puntos_entrega(nombre)');
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

    // Recent deliveries (last 5)
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
  }
};
```

- [ ] **Step 2: Verify in browser**

Open the app dashboard. Confirm:
- Config gear icon appears for admin users
- Debtors are tappable and open the debtor modal with "Pagar todo" and individual payment options
- Recent deliveries show per-type summaries and colored badges

- [ ] **Step 3: Commit**

```bash
git add js/dashboard.js
git commit -m "feat: update dashboard with interactive debtors and type breakdown"
```

---

### Task 8: Analytics Module

**Files:**
- Create: `js/analisis.js`
- Delete: `js/resumenes.js` (replaced)

Full analytics module with 6 metric cards, type breakdown, client ranking, period comparison, repartidor breakdown (admin), and interactive debtors.

- [ ] **Step 1: Create analisis.js**

Create `js/analisis.js`:

```javascript
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

  /** Calculate the date range for a period */
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

  /** Calculate the previous period of equal duration for comparison */
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

    // Current period entregas with lines
    let query = db.from('entregas')
      .select('*, entrega_lineas(*, tipos_alfajor(nombre)), puntos_entrega(nombre), usuarios(nombre)');
    if (from) query = query.gte('fecha_hora', from.toISOString());
    query = query.lte('fecha_hora', to.toISOString());
    const { data } = await query;
    const entregas = data || [];

    // Previous period for comparison
    const prev = Analisis._prevRange(from, to);
    let prevQ = db.from('entregas')
      .select('*, entrega_lineas(cantidad, precio_unitario, costo_unitario)');
    prevQ = prevQ.gte('fecha_hora', prev.from.toISOString()).lt('fecha_hora', prev.to.toISOString());
    const { data: prevData } = await prevQ;
    const prevEntregas = prevData || [];

    // --- Metrics ---
    const totalVendido = entregas.reduce((s, e) => s + Number(e.monto_total), 0);
    const totalCobrado = entregas.reduce((s, e) => s + Number(e.monto_pagado), 0);
    const totalUnidades = entregas.reduce((s, e) => s + Number(e.cantidad), 0);
    const totalPendiente = totalVendido - totalCobrado;

    // Ganancia from lines
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

    // --- Comparison ---
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

    // --- By type ---
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

    // --- Client ranking ---
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

    // --- By repartidor ---
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

    // --- Debtors (interactive, reuse from dashboard logic) ---
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

    // Store data for export
    Analisis._data = { entregas, from, to };
  },

  _data: null,

  showExportModal() {
    ExcelExport.showModal();
  }
};
```

- [ ] **Step 2: Delete resumenes.js**

```bash
rm js/resumenes.js
```

- [ ] **Step 3: Verify in browser**

Navigate to the "Análisis" tab. Confirm:
- 6 metric cards display correctly
- Period comparison chips show percentage changes
- Type breakdown shows per-type stats
- Client ranking is tappable for debtors
- Repartidor breakdown includes ganancia

- [ ] **Step 4: Commit**

```bash
git add js/analisis.js
git rm js/resumenes.js
git commit -m "feat: add analytics module replacing resumenes"
```

---

### Task 9: Excel Export Module

**Files:**
- Create: `js/excel.js`

Two export formats: "Estilo Emi" (2-sheet workbook replicating the original Excel) and "Datos crudos" (flat table). Uses SheetJS loaded via CDN.

- [ ] **Step 1: Create excel.js**

Create `js/excel.js`:

```javascript
const ExcelExport = {
  showModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Exportar a Excel</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="export-option" onclick="ExcelExport.exportEmi()">
          <div class="export-option-title">Reporte estilo Emi</div>
          <div class="export-option-desc">2 hojas: Cantidades + Ingresos/Ganancias, como el Excel original</div>
        </div>
        <div class="export-option" onclick="ExcelExport.exportCrudo()">
          <div class="export-option-title">Datos crudos</div>
          <div class="export-option-desc">Todas las entregas en una tabla plana, una fila por tipo de alfajor</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  /** Calculate week number within 4-week cycle */
  _semana(fecha) {
    const d = new Date(fecha);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return ((weekNum - 1) % 4) + 1;
  },

  async _fetchData() {
    // Use analytics data if available, otherwise fetch all
    if (Analisis._data && Analisis._data.entregas) {
      return Analisis._data.entregas;
    }
    const { data } = await db.from('entregas')
      .select('*, entrega_lineas(*, tipos_alfajor(nombre)), puntos_entrega(nombre, direccion), usuarios(nombre)')
      .order('fecha_hora', { ascending: true });
    return data || [];
  },

  async exportEmi() {
    showToast('Generando reporte...');
    const entregas = await ExcelExport._fetchData();
    const tipos = Tipos.activos();
    const tipoNames = tipos.map(t => t.nombre);

    // Sheet 1: Cantidades
    const header1 = ['Fecha', 'Cliente', 'Zona', ...tipoNames, 'Vendedor', 'Semana'];
    const rows1 = entregas.map(e => {
      const lineas = e.entrega_lineas || [];
      const lineaMap = {};
      lineas.forEach(l => { lineaMap[l.tipo_alfajor_id] = l; });

      const cantidades = tipos.map(t => {
        const l = lineaMap[t.id];
        return l ? l.cantidad : 0;
      });

      return [
        fmtDate(e.fecha_hora),
        e.puntos_entrega?.nombre || e.punto_nombre_temp || '',
        e.puntos_entrega?.direccion || '',
        ...cantidades,
        e.usuarios?.nombre || '',
        ExcelExport._semana(e.fecha_hora)
      ];
    });

    // Sheet 2: Ingresos y Ganancias
    const header2 = ['Fecha', 'Cliente'];
    tipos.forEach(t => {
      header2.push('Cant ' + t.nombre, 'Precio ' + t.nombre);
    });
    header2.push('Costo Total', 'Total Venta', 'Ganancia', 'Vendedor', 'Semana');

    const rows2 = entregas.map(e => {
      const lineas = e.entrega_lineas || [];
      const lineaMap = {};
      lineas.forEach(l => { lineaMap[l.tipo_alfajor_id] = l; });

      const row = [
        fmtDate(e.fecha_hora),
        e.puntos_entrega?.nombre || e.punto_nombre_temp || ''
      ];

      let costoTotal = 0;
      let ventaTotal = 0;

      tipos.forEach(t => {
        const l = lineaMap[t.id];
        const cant = l ? l.cantidad : 0;
        const precio = l ? Number(l.precio_unitario) : 0;
        const costo = l ? Number(l.costo_unitario) : 0;
        row.push(cant, precio);
        costoTotal += cant * costo;
        ventaTotal += cant * precio;
      });

      row.push(costoTotal, ventaTotal, ventaTotal - costoTotal);
      row.push(e.usuarios?.nombre || '', ExcelExport._semana(e.fecha_hora));
      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1]);
    const ws2 = XLSX.utils.aoa_to_sheet([header2, ...rows2]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Cantidades');
    XLSX.utils.book_append_sheet(wb, ws2, 'Ingresos y Ganancias');
    XLSX.writeFile(wb, 'alfajores-reporte.xlsx');

    document.querySelector('.modal-overlay')?.remove();
    showToast('Reporte descargado');
  },

  async exportCrudo() {
    showToast('Generando datos...');
    const entregas = await ExcelExport._fetchData();

    const header = ['Fecha', 'Punto', 'Dirección', 'Recibió', 'Tipo Alfajor', 'Cantidad',
                    'Precio Venta', 'Costo', 'Subtotal Venta', 'Ganancia', 'Pagado', 'Debe',
                    'Forma Pago', 'Vendedor', 'Notas'];

    const rows = [];
    entregas.forEach(e => {
      const lineas = e.entrega_lineas || [];
      if (lineas.length === 0) {
        // Legacy entry without lines
        rows.push([
          fmtDate(e.fecha_hora),
          e.puntos_entrega?.nombre || e.punto_nombre_temp || '',
          e.puntos_entrega?.direccion || '',
          e.recibio || '',
          'Sin especificar',
          e.cantidad,
          Number(e.precio_unitario),
          0,
          Number(e.monto_total),
          0,
          Number(e.monto_pagado),
          Number(e.monto_total) - Number(e.monto_pagado),
          e.forma_pago,
          e.usuarios?.nombre || '',
          e.notas || ''
        ]);
      } else {
        lineas.forEach(l => {
          const subtotal = l.cantidad * Number(l.precio_unitario);
          const ganancia = l.cantidad * (Number(l.precio_unitario) - Number(l.costo_unitario));
          rows.push([
            fmtDate(e.fecha_hora),
            e.puntos_entrega?.nombre || e.punto_nombre_temp || '',
            e.puntos_entrega?.direccion || '',
            e.recibio || '',
            l.tipos_alfajor?.nombre || '?',
            l.cantidad,
            Number(l.precio_unitario),
            Number(l.costo_unitario),
            subtotal,
            ganancia,
            Number(e.monto_pagado),
            Number(e.monto_total) - Number(e.monto_pagado),
            e.forma_pago,
            e.usuarios?.nombre || '',
            e.notas || ''
          ]);
        });
      }
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, 'alfajores-datos.xlsx');

    document.querySelector('.modal-overlay')?.remove();
    showToast('Datos descargados');
  }
};
```

- [ ] **Step 2: Verify in browser**

From the Análisis tab, tap the export icon. Confirm:
- Modal shows two options
- "Reporte estilo Emi" downloads a .xlsx with 2 sheets (Cantidades, Ingresos y Ganancias)
- "Datos crudos" downloads a .xlsx with 1 sheet (flat data)

- [ ] **Step 3: Commit**

```bash
git add js/excel.js
git commit -m "feat: add Excel export with Emi-style report and raw data formats"
```

---

### Task 10: Config Panel

**Files:**
- Create: `js/config.js`

Admin-only configuration panel for managing alfajor types (add, edit, toggle active, reorder, set default cost) and users (list, invite, toggle active).

- [ ] **Step 1: Create config.js**

Create `js/config.js`:

```javascript
const Config = {
  render() {
    if (!Auth.isAdmin()) {
      window.location.hash = '#/';
      return '<div class="empty-state"><p>Acceso denegado</p></div>';
    }
    Config.loadData();
    return `
      <div class="app-header">
        <h1>Configuración</h1>
        <button class="btn-icon" onclick="window.location.hash='#/'">&times;</button>
      </div>
      <div id="config-content"><div class="spinner mt-8"></div></div>
    `;
  },

  async loadData() {
    await Tipos.fetchAll();
    const { data: usuarios } = await db.from('usuarios').select('*').order('nombre');

    const contentEl = document.getElementById('config-content');
    if (!contentEl) return;

    contentEl.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">Tipos de alfajor</div>
        <div id="config-tipos">
          ${Tipos.cache.map(t => `
            <div class="config-item" data-id="${t.id}">
              <div class="config-item-info">
                <div class="config-item-name">${esc(t.nombre)}</div>
                <div class="config-item-detail">
                  ${t.es_reventa ? 'Reventa' : 'Producción propia'}
                  · Orden: ${t.orden}
                  ${t.costo_default ? ' · Costo: ' + fmtMoney(t.costo_default) : ''}
                </div>
              </div>
              <div class="config-item-actions">
                <button class="btn-icon" style="width:32px;height:32px" title="Editar"
                        onclick="Config.editTipo('${t.id}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <div class="toggle-switch ${t.activo ? 'on' : ''}"
                     onclick="Config.toggleTipo('${t.id}', ${!t.activo})"></div>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-block mt-8" onclick="Config.addTipo()">+ Nuevo tipo</button>
      </div>

      <div class="config-section">
        <div class="config-section-title">Usuarios</div>
        <div id="config-usuarios">
          ${(usuarios || []).map(u => `
            <div class="config-item">
              <div class="config-item-info">
                <div class="config-item-name">${esc(u.nombre)}</div>
                <div class="config-item-detail">${esc(u.email || '')} · ${u.rol}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-block mt-8" onclick="Config.showInviteForm()">+ Invitar usuario</button>
        <div id="config-invite-slot"></div>
      </div>
    `;
  },

  async toggleTipo(id, newState) {
    const { error } = await db.from('tipos_alfajor').update({ activo: newState }).eq('id', id);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast(newState ? 'Tipo activado' : 'Tipo desactivado');
    Config.loadData();
  },

  editTipo(id) {
    const tipo = Tipos.cache.find(t => t.id === id);
    if (!tipo) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Editar tipo</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="edit-tipo-nombre" value="${esc(tipo.nombre)}">
        </div>
        <div class="form-group">
          <label class="form-label">Orden</label>
          <input class="form-input" id="edit-tipo-orden" type="number" value="${tipo.orden}">
        </div>
        <div class="form-group">
          <label class="form-label">Costo default</label>
          <input class="form-input" id="edit-tipo-costo" type="number" value="${tipo.costo_default || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="edit-tipo-reventa" ${tipo.es_reventa ? 'checked' : ''} style="margin-right:8px">
            Es reventa
          </label>
        </div>
        <button class="btn btn-primary btn-block" onclick="Config.saveTipo('${id}')">Guardar</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  async saveTipo(id) {
    const nombre = document.getElementById('edit-tipo-nombre').value.trim();
    const orden = parseInt(document.getElementById('edit-tipo-orden').value) || 0;
    const costoDefault = parseFloat(document.getElementById('edit-tipo-costo').value) || 0;
    const esReventa = document.getElementById('edit-tipo-reventa').checked;

    if (!nombre) { showToast('Ingresá un nombre'); return; }

    const { error } = await db.from('tipos_alfajor').update({
      nombre, orden, costo_default: costoDefault, es_reventa: esReventa
    }).eq('id', id);

    if (error) { showToast('Error: ' + error.message); return; }

    document.querySelector('.modal-overlay')?.remove();
    showToast('Tipo actualizado');
    Config.loadData();
  },

  addTipo() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="flex-between mb-16">
          <h2>Nuevo tipo</h2>
          <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="new-tipo-nombre" placeholder="Ej: Alfajor de dulce de leche">
        </div>
        <div class="form-group">
          <label class="form-label">Orden</label>
          <input class="form-input" id="new-tipo-orden" type="number" value="${Tipos.cache.length + 1}">
        </div>
        <div class="form-group">
          <label class="form-label">Costo default</label>
          <input class="form-input" id="new-tipo-costo" type="number" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">
            <input type="checkbox" id="new-tipo-reventa" style="margin-right:8px">
            Es reventa
          </label>
        </div>
        <button class="btn btn-primary btn-block" onclick="Config.saveNewTipo()">Crear</button>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  async saveNewTipo() {
    const nombre = document.getElementById('new-tipo-nombre').value.trim();
    const orden = parseInt(document.getElementById('new-tipo-orden').value) || 0;
    const costoDefault = parseFloat(document.getElementById('new-tipo-costo').value) || 0;
    const esReventa = document.getElementById('new-tipo-reventa').checked;

    if (!nombre) { showToast('Ingresá un nombre'); return; }

    const { error } = await db.from('tipos_alfajor').insert({
      nombre, orden, costo_default: costoDefault, es_reventa: esReventa
    });

    if (error) { showToast('Error: ' + error.message); return; }

    document.querySelector('.modal-overlay')?.remove();
    showToast('Tipo creado');
    Config.loadData();
  },

  showInviteForm() {
    const slot = document.getElementById('config-invite-slot');
    if (!slot) return;
    slot.innerHTML = `
      <div class="card mt-8">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="invite-email" type="email" placeholder="usuario@email.com">
        </div>
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input class="form-input" id="invite-nombre" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña inicial</label>
          <input class="form-input" id="invite-pass" type="text" placeholder="Contraseña temporal">
        </div>
        <div class="form-group">
          <label class="form-label">Rol</label>
          <div class="toggle-group">
            <button type="button" class="toggle-btn active" onclick="Config.setInviteRol(this, 'repartidor')">Repartidor</button>
            <button type="button" class="toggle-btn" onclick="Config.setInviteRol(this, 'admin')">Admin</button>
          </div>
          <input type="hidden" id="invite-rol" value="repartidor">
        </div>
        <button class="btn btn-primary btn-block" onclick="Config.sendInvite()">Crear usuario</button>
      </div>
    `;
  },

  setInviteRol(btn, rol) {
    const parent = btn.closest('.toggle-group');
    parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('invite-rol').value = rol;
  },

  async sendInvite() {
    const email = document.getElementById('invite-email').value.trim();
    const nombre = document.getElementById('invite-nombre').value.trim();
    const pass = document.getElementById('invite-pass').value;
    const rol = document.getElementById('invite-rol').value;

    if (!email || !nombre || !pass) {
      showToast('Completá todos los campos');
      return;
    }

    if (pass.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      // Sign up the new user via Supabase Auth
      const { data, error } = await db.auth.signUp({ email, password: pass });
      if (error) throw error;

      // Insert into usuarios table
      if (data.user) {
        await db.from('usuarios').insert({
          id: data.user.id,
          nombre: nombre,
          email: email,
          rol: rol
        });
      }

      showToast('Usuario creado');
      document.getElementById('config-invite-slot').innerHTML = '';
      Config.loadData();
    } catch (err) {
      console.error('Error invitando usuario:', err);
      showToast('Error: ' + (err.message || err));
    }
  }
};
```

- [ ] **Step 2: Verify in browser**

Navigate to `#/config` as admin. Confirm:
- List of 4 alfajor types with toggle switches
- Edit modal works (change name, order, cost, reventa)
- Toggle active/inactive works
- "Nuevo tipo" creates a new type
- Users section shows existing users
- "Invitar usuario" form appears and submits

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "feat: add admin config panel for types and users"
```

---

### Task 11: Wire Everything Together

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `sw.js`

Update the HTML to include new script tags and SheetJS CDN, rename the nav label from "Resúmenes" to "Análisis", add new routes to the SPA router, and bump the service worker cache.

- [ ] **Step 1: Update index.html**

In `index.html`, add the SheetJS CDN script and the new JS files. Change the nav label. The final `<body>` should look like this:

Replace the nav button for resumenes:

```html
<!-- OLD -->
    <button class="nav-btn" data-route="/resumenes">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      <span>Resúmenes</span>
    </button>
<!-- NEW -->
    <button class="nav-btn" data-route="/analisis">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      <span>Análisis</span>
    </button>
```

Replace the script section:

```html
<!-- OLD -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="js/supabase.js"></script>
  <script src="js/auth.js"></script>
  <script src="js/puntos.js"></script>
  <script src="js/entregas.js"></script>
  <script src="js/dashboard.js"></script>
  <script src="js/historial.js"></script>
  <script src="js/resumenes.js"></script>
  <script src="js/app.js"></script>
<!-- NEW -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
  <script src="js/supabase.js"></script>
  <script src="js/auth.js"></script>
  <script src="js/puntos.js"></script>
  <script src="js/tipos.js"></script>
  <script src="js/pagos.js"></script>
  <script src="js/entregas.js"></script>
  <script src="js/dashboard.js"></script>
  <script src="js/historial.js"></script>
  <script src="js/analisis.js"></script>
  <script src="js/excel.js"></script>
  <script src="js/config.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 2: Update app.js**

Replace the entire content of `js/app.js`:

```javascript
const App = {
  currentRoute: null,

  routes: {
    '/': () => Dashboard.render(),
    '/entrega': () => Entregas.renderForm(),
    '/historial': () => Historial.render(),
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
        document.getElementById('bottom-nav').hidden = true;
        Auth.renderLogin();
      }
    });
  },

  navigate() {
    const hash = window.location.hash.slice(1) || '/';
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

- [ ] **Step 3: Update sw.js**

Replace the entire content of `sw.js`:

```javascript
const CACHE_NAME = 'alfajores-v4';
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
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
```

- [ ] **Step 4: Verify full app in browser**

Open the app. Test the full flow:
1. Login as admin
2. Dashboard loads with gear icon, interactive debtors, per-type recent deliveries
3. Nueva entrega shows 4 type lines
4. Fill in a test delivery with 2+ types, save
5. Historial shows the delivery with type breakdown and correct badge
6. Detail modal shows line-by-line breakdown and payment registration
7. Análisis tab shows all 6 metrics, type breakdown, rankings, comparison
8. Export icon downloads Excel files (both formats)
9. Config panel shows types and users management

- [ ] **Step 5: Commit**

```bash
git add index.html js/app.js sw.js
git commit -m "feat: wire v2 modules — update routes, nav, scripts, and service worker"
```

---

### Task 12: Run SQL Migration

**Files:** None (manual step in Supabase)

- [ ] **Step 1: Execute migration in Supabase**

Open the Supabase dashboard → SQL Editor. Paste the contents of `sql/migration-v2.sql` and execute. Verify:
- `tipos_alfajor` table has 4 rows
- `entrega_lineas` table exists and has migrated rows from existing entregas
- `pagos` table exists (empty)
- RLS policies are active on all 3 new tables

- [ ] **Step 2: Test end-to-end in browser**

With the migration applied, open the app and confirm all features work against the real database. Create a test delivery with multiple types, verify it appears in historial with correct breakdown, check analytics metrics.
