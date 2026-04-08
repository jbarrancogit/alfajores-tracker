# Efectivo/Transfer Breakdown + Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cash vs transfer breakdown metrics in Analisis (+ Excel exports) and a visual calendar date picker.

**Architecture:** Query the `pagos` table to get payment amounts grouped by `forma_pago` (efectivo/transferencia). Build a custom vanilla JS calendar component that renders inline in the Analisis view. Calendar selection and period chip filters are mutually exclusive.

**Tech Stack:** Vanilla JS, Supabase JS v2, CSS Grid, SheetJS (XLSX)

---

## File Structure

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `css/styles.css` | Metrics grid 8-card layout, calendar component styles | Modify |
| `js/analisis.js` | Pagos query, 2 new metric cards, calendar state/render/interaction | Modify |
| `js/excel.js` | Pagos fetch + efectivo/transfer columns in both exports | Modify |
| `sw.js` | Cache version bump | Modify |

---

### Task 1: CSS — Metrics grid for 8 cards + calendar styles

**Files:**
- Modify: `css/styles.css:660-666` (metrics-grid-6 → metrics-grid-8)
- Modify: `css/styles.css` (append calendar styles at end)

- [ ] **Step 1: Replace `.metrics-grid-6` with `.metrics-grid-8`**

In `css/styles.css`, find lines 660-666:

```css
/* ── Metrics grid: 6 cards (2 rows × 3) ── */
.metrics-grid-6 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
```

Replace with:

```css
/* ── Metrics grid: 8 cards (2 rows × 4 desktop, 4 rows × 2 mobile) ── */
.metrics-grid-8 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
@media (max-width: 480px) {
  .metrics-grid-8 {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 2: Add calendar styles at the end of `css/styles.css`**

Append after line 937 (after `.punto-option-new .punto-option-name`):

```css

/* ── Calendar ── */
.calendar {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 12px;
}
.cal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.cal-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}
.cal-nav {
  font-size: 1.4rem;
  min-height: 32px;
  min-width: 32px;
  padding: 0;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.cal-dow {
  text-align: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  padding: 4px 0;
  text-transform: uppercase;
}
.cal-day {
  text-align: center;
  padding: 8px 0;
  font-size: 0.85rem;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background var(--transition);
  color: var(--text-primary);
}
.cal-day:hover {
  background: var(--bg-card-hover);
}
.cal-day-outside {
  color: var(--text-muted);
  opacity: 0.4;
  cursor: default;
}
.cal-day-outside:hover {
  background: none;
}
.cal-day-today {
  border: 1px solid var(--accent);
}
.cal-day-selected {
  background: var(--accent);
  color: var(--bg-primary);
  font-weight: 700;
}
.cal-day-selected:hover {
  background: var(--accent-light);
}
```

- [ ] **Step 3: Verify in browser**

Open the app, navigate to Analisis. The metrics grid should still render (even though the class name changed — this will be fixed in Task 2). The calendar styles are ready but not used yet.

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "style: add metrics-grid-8 layout and calendar component styles"
```

---

### Task 2: Analisis — Pagos query and efectivo/transfer metric cards

**Files:**
- Modify: `js/analisis.js:1-6` (add state properties)
- Modify: `js/analisis.js:35-36` (change metrics grid class)
- Modify: `js/analisis.js:109-153` (add pagos query and new cards in loadData)

- [ ] **Step 1: Update the metrics grid class in `render()`**

In `js/analisis.js`, find line 35:

```javascript
      <div id="anal-metrics" class="metrics-grid-6">
```

Replace with:

```javascript
      <div id="anal-metrics" class="metrics-grid-8">
```

- [ ] **Step 2: Add pagos query inside `loadData()` after the entregas fetch**

In `js/analisis.js`, find lines 121-122 (after the entregas query):

```javascript
    const { data } = await query;
    const entregas = data || [];
```

Insert immediately after those two lines:

```javascript

    // Fetch pagos breakdown for these entregas
    let cobradoEfectivo = 0, cobradoTransfer = 0;
    const entregaIds = entregas.map(e => e.id);
    if (entregaIds.length > 0) {
      const { data: pagosData } = await db.from('pagos')
        .select('monto, forma_pago')
        .in('entrega_id', entregaIds);
      (pagosData || []).forEach(p => {
        if (p.forma_pago === 'efectivo') cobradoEfectivo += Number(p.monto);
        else if (p.forma_pago === 'transferencia') cobradoTransfer += Number(p.monto);
      });
    }
```

- [ ] **Step 3: Add the 2 new metric cards to the metrics HTML**

In `js/analisis.js`, find the metrics rendering block (the `metricsEl.innerHTML` assignment). The current 6 cards are:

```javascript
      metricsEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalVendido)}</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalCobrado)}</div><div class="metric-label">Cobrado</div></div>
        <div class="metric-card"><div class="metric-value" style="color:var(--green)">${fmtMoney(totalGanancia)}</div><div class="metric-label">Ganancia</div></div>
        <div class="metric-card"><div class="metric-value">${totalUnidades}</div><div class="metric-label">Unidades</div></div>
        <div class="metric-card"><div class="metric-value" style="color:${totalPendiente > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(totalPendiente)}</div><div class="metric-label">Pendiente</div></div>
        <div class="metric-card"><div class="metric-value">${entregas.length}</div><div class="metric-label">Entregas</div></div>
      `;
```

Replace with (8 cards — 2 new ones after "Cobrado"):

```javascript
      metricsEl.innerHTML = `
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalVendido)}</div><div class="metric-label">Vendido</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(totalCobrado)}</div><div class="metric-label">Cobrado</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(cobradoEfectivo)}</div><div class="metric-label">Efectivo</div></div>
        <div class="metric-card"><div class="metric-value">${fmtMoney(cobradoTransfer)}</div><div class="metric-label">Transfer.</div></div>
        <div class="metric-card"><div class="metric-value" style="color:var(--green)">${fmtMoney(totalGanancia)}</div><div class="metric-label">Ganancia</div></div>
        <div class="metric-card"><div class="metric-value">${totalUnidades}</div><div class="metric-label">Unidades</div></div>
        <div class="metric-card"><div class="metric-value" style="color:${totalPendiente > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(totalPendiente)}</div><div class="metric-label">Pendiente</div></div>
        <div class="metric-card"><div class="metric-value">${entregas.length}</div><div class="metric-label">Entregas</div></div>
      `;
```

- [ ] **Step 4: Verify in browser**

Open Analisis. Confirm:
- 8 metric cards displayed in a 4×2 grid on desktop
- 2×4 grid on mobile (use devtools responsive mode)
- "Efectivo" and "Transfer." cards show correct amounts
- If you registered a payment with a known method, the amount appears in the corresponding card

- [ ] **Step 5: Commit**

```bash
git add js/analisis.js
git commit -m "feat: add efectivo/transferencia breakdown cards to Analisis metrics"
```

---

### Task 3: Analisis — Calendar component

**Files:**
- Modify: `js/analisis.js:1-5` (add new state properties)
- Modify: `js/analisis.js` render() (add calendar HTML)
- Modify: `js/analisis.js` (add calendar methods, update _dateRange and setPeriod)

- [ ] **Step 1: Add state properties to the Analisis object**

In `js/analisis.js`, find lines 1-5:

```javascript
const Analisis = {
  periodo: 'semana',
  customFrom: null,
  customTo: null,
  vendedorId: '',
```

Replace with:

```javascript
const Analisis = {
  periodo: 'semana',
  customFrom: null,
  customTo: null,
  vendedorId: '',
  selectedDate: null,
  calendarMonth: null,
```

- [ ] **Step 2: Add calendar HTML to `render()`, between the header and the filter bar**

In `js/analisis.js`, find inside `render()` the line:

```javascript
      <div class="filter-bar" id="anal-period-bar">
```

Insert immediately before that line:

```javascript
      <div id="anal-calendar"></div>
```

- [ ] **Step 3: Update `_initRender()` to render the calendar after loading**

In `js/analisis.js`, find the end of `_initRender()`:

```javascript
    Analisis.loadData();
  },
```

Replace with:

```javascript
    Analisis._updateCalendar();
    Analisis.loadData();
  },
```

- [ ] **Step 4: Add the `_renderCalendar()` method**

Add the following method to the `Analisis` object, right after `_initRender()` (after its closing `},`):

```javascript
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

    const todayStr = now.toISOString().slice(0, 10);
    const selectedStr = Analisis.selectedDate
      ? Analisis.selectedDate.toISOString().slice(0, 10) : '';

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
```

- [ ] **Step 5: Add `selectDay()`, `prevMonth()`, `nextMonth()` methods**

Add right after the `_updateCalendar` method:

```javascript
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
```

- [ ] **Step 6: Add `'dia'` case to `_dateRange()`**

In `js/analisis.js`, find the `_dateRange()` method. At the top of the if/else chain, find:

```javascript
    if (periodo === 'hoy') {
```

Insert before that line:

```javascript
    if (periodo === 'dia' && Analisis.selectedDate) {
      from = new Date(Analisis.selectedDate);
      from.setHours(0, 0, 0, 0);
      to = new Date(Analisis.selectedDate);
      to.setHours(23, 59, 59, 999);
    } else if (periodo === 'hoy') {
```

And remove the original `if` keyword from the `hoy` line so the chain becomes `} else if (periodo === 'hoy')`. The full block should read:

```javascript
    if (periodo === 'dia' && Analisis.selectedDate) {
      from = new Date(Analisis.selectedDate);
      from.setHours(0, 0, 0, 0);
      to = new Date(Analisis.selectedDate);
      to.setHours(23, 59, 59, 999);
    } else if (periodo === 'hoy') {
      from = new Date(now); from.setHours(0, 0, 0, 0);
    } else if (periodo === 'semana') {
```

- [ ] **Step 7: Update `setPeriod()` to clear calendar selection**

In `js/analisis.js`, find the `setPeriod()` method:

```javascript
  setPeriod(chip, periodo) {
    document.querySelectorAll('#anal-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Analisis.periodo = periodo;
```

Replace with:

```javascript
  setPeriod(chip, periodo) {
    document.querySelectorAll('#anal-period-bar .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    Analisis.periodo = periodo;
    Analisis.selectedDate = null;
    Analisis._updateCalendar();
```

- [ ] **Step 8: Verify in browser**

Open Analisis. Confirm:
- Calendar renders above the period chips, showing current month
- Day abbreviations are L M M J V S D
- Today's date has an accent border
- Clicking a day highlights it in amber and loads that day's data
- Period chips deselect when a day is clicked
- Clicking a period chip (e.g., "Semana") deselects the calendar day
- Month navigation arrows (`<` `>`) change the displayed month without loading data
- Clicking a day in April, then navigating to March, then back to April — the selected day is still highlighted

- [ ] **Step 9: Commit**

```bash
git add js/analisis.js
git commit -m "feat: add visual calendar date picker to Analisis"
```

---

### Task 4: Excel — Efectivo/transfer columns in both exports

**Files:**
- Modify: `js/excel.js:42-134` (exportEmi — add pagos fetch and columns)
- Modify: `js/excel.js:138-200` (exportCrudo — add pagos fetch and columns)

- [ ] **Step 1: Add pagos fetch helper at the top of ExcelExport**

In `js/excel.js`, find lines 1-2:

```javascript
const ExcelExport = {
  showModal() {
```

Insert between them (after line 1, before `showModal`):

```javascript
  async _fetchPagosMap() {
    const { data } = await db.from('pagos').select('entrega_id, monto, forma_pago');
    const map = {};
    (data || []).forEach(p => {
      if (!map[p.entrega_id]) map[p.entrega_id] = { efectivo: 0, transferencia: 0 };
      if (p.forma_pago === 'efectivo') map[p.entrega_id].efectivo += Number(p.monto);
      else if (p.forma_pago === 'transferencia') map[p.entrega_id].transferencia += Number(p.monto);
    });
    return map;
  },

```

- [ ] **Step 2: Modify `exportEmi()` — fetch pagos and add columns to Hoja 2**

In `js/excel.js`, find inside `exportEmi()` right after:

```javascript
    const entregas = await ExcelExport._fetchData();
    const tipos = Tipos.activos();
    const tipoNames = tipos.map(t => t.nombre);
```

Insert after those lines:

```javascript
    const pagosMap = await ExcelExport._fetchPagosMap();
```

Find the `header2` definition:

```javascript
    const header2 = ['Fecha', 'Cliente'];
    tipos.forEach(t => {
      header2.push('Cant ' + t.nombre, 'Precio ' + t.nombre);
    });
    header2.push('Costo Total', 'Total Venta', 'Ganancia', 'Vendedor', 'Semana');
```

Replace the last line of that block with:

```javascript
    header2.push('Costo Total', 'Total Venta', 'Ganancia', 'Pagado Efectivo', 'Pagado Transfer.', 'Forma Pago', 'Vendedor', 'Semana');
```

Find in the `rows2` builder, the lines at the end of each row where the 3 columns are pushed:

```javascript
      row.push(costoTotal, ventaTotal, ventaTotal - costoTotal);
      row.push(e.usuarios?.nombre || '', ExcelExport._semana(e.fecha_hora));
```

Replace with:

```javascript
      const ep = pagosMap[e.id] || { efectivo: 0, transferencia: 0 };
      row.push(costoTotal, ventaTotal, ventaTotal - costoTotal, ep.efectivo, ep.transferencia, e.forma_pago || '');
      row.push(e.usuarios?.nombre || '', ExcelExport._semana(e.fecha_hora));
```

- [ ] **Step 3: Modify `exportCrudo()` — add pagos columns**

In `js/excel.js`, find inside `exportCrudo()` the header definition:

```javascript
    const header = ['Fecha', 'Punto', 'Dirección', 'Recibió', 'Tipo Alfajor', 'Cantidad',
                    'Precio Venta', 'Costo', 'Subtotal Venta', 'Ganancia', 'Pagado', 'Debe',
                    'Forma Pago', 'Vendedor', 'Notas'];
```

Replace with:

```javascript
    const header = ['Fecha', 'Punto', 'Dirección', 'Recibió', 'Tipo Alfajor', 'Cantidad',
                    'Precio Venta', 'Costo', 'Subtotal Venta', 'Ganancia', 'Pagado', 'Debe',
                    'Forma Pago', 'Monto Efectivo', 'Monto Transfer.', 'Vendedor', 'Notas'];
```

Find right after:

```javascript
    const entregas = await ExcelExport._fetchData();
```

Insert after that line:

```javascript
    const pagosMap = await ExcelExport._fetchPagosMap();
```

In the rows builder, inside the `entregas.forEach(e => {` callback, find the line:

```javascript
      const lineas = e.entrega_lineas || [];
```

Insert after it:

```javascript
      const ep = pagosMap[e.id] || { efectivo: 0, transferencia: 0 };
```

Then in the `if (lineas.length === 0)` branch, the current row ends with:

```javascript
          e.forma_pago,
          e.usuarios?.nombre || '',
          e.notas || ''
```

Replace with:

```javascript
          e.forma_pago,
          ep.efectivo,
          ep.transferencia,
          e.usuarios?.nombre || '',
          e.notas || ''
```

Find the same pattern in the `lineas.forEach` branch. The current row ends with:

```javascript
            e.forma_pago,
            e.usuarios?.nombre || '',
            e.notas || ''
```

Replace with:

```javascript
            e.forma_pago,
            ep.efectivo,
            ep.transferencia,
            e.usuarios?.nombre || '',
            e.notas || ''
```

- [ ] **Step 4: Verify in browser**

Open Analisis, click the export button. Download both reports:
- "Reporte estilo Emi": Open the Excel, check the "Ingresos y Ganancias" sheet — confirm columns "Pagado Efectivo", "Pagado Transfer.", and "Forma Pago" appear after "Ganancia"
- "Datos crudos": Open the Excel, confirm columns "Monto Efectivo" and "Monto Transfer." appear after "Forma Pago"
- Verify that the amounts in each row match what was registered via pagos

- [ ] **Step 5: Commit**

```bash
git add js/excel.js
git commit -m "feat: add efectivo/transferencia columns to Excel exports"
```

---

### Task 5: Bump service worker cache version

**Files:**
- Modify: `sw.js:1`

- [ ] **Step 1: Bump cache version**

In `sw.js`, find line 1:

```javascript
const CACHE_NAME = 'alfajores-v10';
```

Replace with:

```javascript
const CACHE_NAME = 'alfajores-v11';
```

- [ ] **Step 2: Commit**

```bash
git add sw.js
git commit -m "chore: bump SW cache to v11"
```
