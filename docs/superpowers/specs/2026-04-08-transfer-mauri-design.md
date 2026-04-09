---
title: "Tercer método de pago: Transferencia a Mauri"
date: 2026-04-08
status: approved
---

# Tercer método de pago: Transferencia a Mauri

## Contexto

Los alfajores de Maicena y Miel son de reventa (proveedor: Mauri). Algunos clientes transfieren el pago directo a Mauri para evitar límites tributarios de Mercado Pago en la cuenta de Fabián. Se necesita un tercer método de pago que registre estas transferencias por separado.

## Decisiones de diseño

- **Disponible para todos los roles** (admin y repartidor). El que lo necesita lo elige, el que no lo ignora.
- **Aplica a cualquier entrega**, independiente del tipo de alfajor.
- **No es una métrica principal** — se muestra en una sección "Desglose de cobro" debajo de las métricas principales en Análisis.
- **Descuenta de la liquidación** — Transfer Mauri no pasa por el repartidor, así que no se incluye en "A rendir".
- **Escalable** — es simplemente un nuevo valor de `forma_pago`. No requiere migración DB (el campo es text libre).
- **Color distintivo** — botón con hover/accent en púrpura (#a855f7) para marcar novedad.

## Dato nuevo

Nuevo valor de `forma_pago`: `"transferencia_mauri"`

Valores existentes: `efectivo`, `transferencia`, `fiado`, `mixto`

`mixto` se deriva automáticamente cuando hay pagos con métodos distintos en la misma entrega.

## Archivos afectados

### Formularios de pago
- **entregas.js** — Sección "Pago": agregar campo `ent-pago-mauri` (tercer input numérico) junto a Efectivo y Transferencia. Actualizar `calcPagado()` y `_detectFormaPago()` para incluir el nuevo método.
- **pagos.js** — `renderFormInline()`: tercer botón en toggle group. Modal deudor `showDeudorModal()`: tercer botón en "pagar todo". `pagarTodo()`: leer nueva forma seleccionada.

### Métricas y Análisis
- **analisis.js** — Extraer `cobradoMauri` de pagosData. Reducir grilla principal de 8 a 6 tarjetas (quitar Efectivo/Transfer de la grilla). Nueva sección "Desglose de cobro" con 3 sub-métricas (Efectivo, Transfer, Transfer Mauri). Liquidación: "A rendir" = efectivo + transfer regular cobrado - comisión. Transfer Mauri se muestra aparte como referencia.
- **dashboard.js** — Sin cambios (solo muestra Cobrado total).

### Exportaciones Excel
- **excel.js** — exportEmi: nueva columna "Pagado T. Mauri". exportCrudo: nueva columna. exportAudit: incluir en desglose por repartidor y por entrega.

### Display
- **historial.js** — `showDetail()`: mostrar "Transfer. Mauri" cuando aplique.
- **portal.js** — mostrar en portal cliente cuando aplique.

### Estilos
- **css/styles.css** — Clase `.toggle-btn-mauri` con hover púrpura (#a855f7) para el botón nuevo.

### Tests
- **tests/unit.test.js** — Actualizar `deriveFormaPago()` tests para incluir `transferencia_mauri`.
- **tests/flows.test.js** — Tests de invariante Cobrado = Efectivo + Transfer + Transfer Mauri. Tests de liquidación con descuento Mauri.

### DB
- Sin migración necesaria — `forma_pago` es text libre sin CHECK constraint.
- El trigger `sync_entrega_after_pago_upsert` ya maneja cualquier valor de forma_pago.

### Service Worker
- **sw.js** — Bump cache version a v19.

## UX: Métricas en Análisis

```
┌──────────┐ ┌──────────┐
│ Vendido  │ │ Cobrado  │
├──────────┤ ├──────────┤
│ Ganancia │ │ Unidades │
├──────────┤ ├──────────┤
│Pendiente │ │ Entregas │
└──────────┘ └──────────┘

Desglose de cobro
┌──────────┬──────────┬──────────┐
│ Efectivo │ Transfer │ T. Mauri │
└──────────┴──────────┴──────────┘
```

## UX: Formulario de pago (entrega nueva)

```
Pago
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Efectivo   │ │Transferencia│ │  T. Mauri   │
│     $0      │ │     $0      │ │     $0      │
└─────────────┘ └─────────────┘ └─────────────┘
```

## UX: Toggle de forma de pago (pago posterior)

```
┌──────────┬──────────┬────────────┐
│ Efectivo │ Transfer │  T. Mauri  │  ← púrpura hover
└──────────┴──────────┴────────────┘
```

## UX: Liquidación

```
Repartidor │ Vendido │ Cobrado │ T.Mauri │ % │ Comisión │ A rendir
Fabian     │ 500.000 │ 350.000 │  80.000 │20%│  100.000 │  250.000
```

A rendir = Cobrado (efectivo + transfer regular) - Comisión.
Transfer Mauri se muestra como columna informativa.
