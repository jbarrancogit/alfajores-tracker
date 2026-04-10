# Alfajores Tracker

PWA para el control de entregas, pagos y rutas de un negocio familiar de venta de alfajores. Pensada para uso diario en el celular, con soporte offline, exportación a Excel y portal del cliente.

## Características

- **Registro de entregas** con 4 tipos de alfajor (glaseado premium, glaseado común, maicena y miel), cantidades y precios independientes por tipo.
- **Historial completo** con filtros por cliente, fecha y vendedor.
- **Rutas en mapa** con Leaflet para visualizar puntos de entrega.
- **Análisis y dashboard** con métricas de ventas, ganancia y ciclos de 4 semanas.
- **Gestión de pagos** con múltiples métodos (efectivo, transferencia, transferencia Mauri, etc.).
- **Portal del cliente** para consultar entregas y pagos pendientes.
- **Exportación a Excel** de entregas e historial.
- **Multi-vendedor**: cuentas separadas para cada integrante de la familia.
- **PWA instalable** con service worker y funcionamiento offline.
- **Interfaz 100% en español**, optimizada para mobile y con foco en accesibilidad.

## Stack tecnológico

- **Frontend**: HTML + CSS + JavaScript vanilla (sin frameworks).
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS).
- **Mapas**: [Leaflet](https://leafletjs.com/).
- **Excel**: [SheetJS (xlsx)](https://sheetjs.com/).
- **PWA**: Service Worker propio (`sw.js`) + `manifest.json`.
- **Tests**: [Vitest](https://vitest.dev/) + jsdom.

## Estructura del proyecto

```
alfajores-tracker/
├── index.html           # Entry point de la PWA
├── manifest.json        # Manifest PWA
├── sw.js                # Service Worker
├── css/
│   └── styles.css
├── js/
│   ├── app.js           # Router y bootstrap
│   ├── auth.js          # Autenticación con Supabase
│   ├── supabase.js      # Cliente Supabase
│   ├── entregas.js      # Alta y edición de entregas
│   ├── historial.js     # Vista de historial
│   ├── ruta.js          # Mapa y rutas
│   ├── analisis.js      # Métricas y reportes
│   ├── dashboard.js     # Resumen principal
│   ├── pagos.js         # Gestión de pagos
│   ├── puntos.js        # Puntos de entrega
│   ├── tipos.js         # Tipos de alfajor
│   ├── excel.js         # Exportación Excel
│   ├── portal.js        # Portal del cliente
│   └── config.js
├── sql/                 # Migraciones SQL de Supabase
├── tests/               # Tests con Vitest
├── docs/                # Documentación y contratos
└── assets/              # Íconos PWA
```

## Puesta en marcha

### Requisitos

- Node.js (para correr los tests).
- Un proyecto de Supabase con las tablas creadas a partir de los scripts en `sql/`.

### Configuración

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/jbarrancogit/alfajores-tracker.git
   cd alfajores-tracker
   ```

2. Configurar las credenciales de Supabase en `js/supabase.js` (URL y anon key del proyecto).

3. Ejecutar las migraciones SQL del directorio `sql/` en tu proyecto de Supabase, en orden.

4. Servir los archivos estáticos con cualquier servidor HTTP local, por ejemplo:
   ```bash
   npx serve .
   ```

5. Abrir la app en el navegador e instalarla como PWA desde el menú del navegador.

### Tests

```bash
npm install
npm test          # corrida única
npm run test:watch  # modo watch
```

## Modelo de negocio

El negocio trabaja con ciclos de 4 semanas (no meses calendario). Al cierre de cada ciclo se calculan ventas totales y sueldos. Cada tipo de alfajor tiene su propio precio de venta y costo unitario, y los márgenes se calculan por tipo.

Los tipos "maicena" y "miel" son reventa (no producción propia) y se venden con un margen diferente al de los glaseados.

## Licencia

ISC — proyecto de uso familiar.
