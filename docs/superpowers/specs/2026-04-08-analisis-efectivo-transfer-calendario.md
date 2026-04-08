# Desglose Efectivo/Transferencia + Calendario en Analisis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cash vs transfer payment breakdown to Analisis metrics and Excel exports, and add a visual calendar date picker to Analisis.

**Context:** Emiliano (admin) needs to differentiate cash and transfer collections for end-of-day/week manual reconciliation. He also wants to pick specific dates visually instead of only using preset period filters.

---

## Feature 1: Desglose Efectivo / Transferencia

### 1.1 Analisis Metrics

**Current state:** The metrics grid shows 6 cards: Vendido, Cobrado, Ganancia, Unidades, Pendiente, Entregas.

**Change:** Add 2 new metric cards after "Cobrado": **"Efectivo"** and **"Transfer."**, making the grid 8 cards total.

**Data source:** Query the `pagos` table, filtering by `entrega_id` in the current date range, and sum `monto` grouped by `forma_pago`. This is more accurate than using `entregas.forma_pago` because:
- Payments can be partial and registered at different times
- A single entrega can have multiple payments with different methods
- The `pagos` table already stores `monto` and `forma_pago` per payment record

**Implementation:**
- In `Analisis.loadData()`, after fetching entregas, also fetch pagos for those entregas
- Query: `db.from('pagos').select('monto, forma_pago').in('entrega_id', entregaIds)`
- Sum `monto` where `forma_pago === 'efectivo'` and where `forma_pago === 'transferencia'`
- Render two new metric cards with these totals
- Card styling: "Efectivo" value in default color, "Transfer." value in default color (both are sub-breakdowns of "Cobrado")

**Grid layout:** Currently `metrics-grid-6` uses `repeat(3, 1fr)` (3 columns, 2 rows). Change to `repeat(4, 1fr)` for 8 cards (4 columns, 2 rows on desktop). Add a mobile media query to fall back to `repeat(2, 1fr)` (2 columns, 4 rows) so cards stay readable on small screens.

**Edge case:** If there are no entregas in the period, both cards show $0. If entrega_ids list is empty, skip the pagos query.

### 1.2 Excel Export — Reporte Emi (Hoja "Ingresos y Ganancias")

**Current columns:** Fecha, Cliente, [Cant+Precio per tipo], Costo Total, Total Venta, Ganancia, Vendedor, Semana

**Change:** Add 3 columns after Ganancia: **"Pagado Efectivo"**, **"Pagado Transfer."**, **"Forma Pago"**

**Data source:** For each entrega, query its related pagos and sum by method. Since `ExcelExport._fetchData()` fetches all entregas, we also need to fetch all pagos in one query and group them by `entrega_id`.

**Implementation:**
- Before building rows, fetch all pagos: `db.from('pagos').select('entrega_id, monto, forma_pago')`
- Build a map: `pagosByEntrega[entrega_id] = { efectivo: sum, transferencia: sum }`
- For each row, look up the map and add the 3 new columns

### 1.3 Excel Export — Datos Crudos

**Current columns:** Include "Forma Pago" already.

**Change:** Add 2 columns after "Forma Pago": **"Monto Efectivo"** and **"Monto Transferencia"**

**Implementation:** Same pagos map as above, look up per entrega.

---

## Feature 2: Calendario Visual

### 2.1 Calendar Component

A custom vanilla JS monthly calendar rendered as part of the Analisis view.

**Location:** At the top of the Analisis section, between the header and the period filter chips.

**Visual design:**
- Month/year header with left/right navigation arrows (`<` `>`)
- 7-column grid: L M M J V S D (Spanish day abbreviations)
- Days of the month as clickable cells
- Today's date: subtle border or background highlight
- Selected date: accent color background
- Days outside current month: dimmed text
- Dark theme consistent with the app's existing style (`--bg-card`, `--text`, `--accent` CSS variables)

**Dimensions:** Full width of the container, compact row height so it doesn't dominate the screen. Each day cell ~40px height on mobile.

### 2.2 Interaction with Period Filters

**Calendar click:**
- Sets `Analisis.periodo = 'dia'` and `Analisis.selectedDate = <clicked date>`
- Deselects all period chip buttons (removes `.active` class)
- Calls `Analisis.loadData()`
- `_dateRange()` handles `periodo === 'dia'`: returns from = start of day, to = end of day

**Period chip click:**
- Existing behavior plus: clears `Analisis.selectedDate`
- Calendar visually deselects any selected day (removes highlight)
- Both are mutually exclusive

**Month navigation:**
- Clicking `<` or `>` changes the displayed month
- Does NOT automatically filter data — only clicking a specific day filters
- If a selected date is in the visible month, it stays highlighted

### 2.3 State

New state on `Analisis` object:
- `selectedDate: null` — Date object or null, set when user clicks a calendar day
- `calendarMonth: null` — tracks which month is displayed (defaults to current month)

### 2.4 No External Dependencies

The calendar is built entirely with vanilla JS and CSS. No libraries. The HTML is generated as a string (consistent with all other components in this app) and injected into the DOM.

---

## Files to Modify

| File | Changes |
|------|---------|
| `js/analisis.js` | Add pagos query in `loadData()`, render 2 new metric cards, add calendar rendering/state/interaction, add `'dia'` to `_dateRange()` |
| `js/excel.js` | Fetch pagos, add efectivo/transfer columns to both export formats |
| `css/styles.css` | Calendar styles, update metrics grid for 8 cards |
| `sw.js` | Bump cache version |

## No Database Changes

All data already exists in the `pagos` table. No migrations needed.

## Performance

- The extra `pagos` query is lightweight — small table, indexed by `entrega_id`
- Supabase Free Plan usage is minimal (0.027 GB, 10 MAU) — no concerns
- Calendar is pure DOM rendering, no performance impact
