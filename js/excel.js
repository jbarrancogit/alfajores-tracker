const ExcelExport = {
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

  _semana(fecha) {
    const d = new Date(fecha);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return ((weekNum - 1) % 4) + 1;
  },

  async _fetchData() {
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
    const pagosMap = await ExcelExport._fetchPagosMap();

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

    const header2 = ['Fecha', 'Cliente'];
    tipos.forEach(t => {
      header2.push('Cant ' + t.nombre, 'Precio ' + t.nombre);
    });
    header2.push('Costo Total', 'Total Venta', 'Ganancia', 'Pagado Efectivo', 'Pagado Transfer.', 'Forma Pago', 'Vendedor', 'Semana');

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

      const ep = pagosMap[e.id] || { efectivo: 0, transferencia: 0 };
      row.push(costoTotal, ventaTotal, ventaTotal - costoTotal, ep.efectivo, ep.transferencia, e.forma_pago || '');
      row.push(e.usuarios?.nombre || '', ExcelExport._semana(e.fecha_hora));
      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1]);
    const ws2 = XLSX.utils.aoa_to_sheet([header2, ...rows2]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Cantidades');
    XLSX.utils.book_append_sheet(wb, ws2, 'Ingresos y Ganancias');

    // Hoja 3: Liquidación
    const liqMap = {};
    let usuariosMap = Analisis._data?.usuariosMap || {};
    if (Object.keys(usuariosMap).length === 0) {
      const { data: uData } = await db.from('usuarios').select('id, nombre, comision_pct');
      (uData || []).forEach(u => { usuariosMap[u.id] = u; });
    }
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

    XLSX.writeFile(wb, 'alfajores-reporte.xlsx');

    document.querySelector('.modal-overlay')?.remove();
    showToast('Reporte descargado');
  },

  async exportCrudo() {
    showToast('Generando datos...');
    const entregas = await ExcelExport._fetchData();
    const pagosMap = await ExcelExport._fetchPagosMap();

    const header = ['Fecha', 'Punto', 'Dirección', 'Recibió', 'Tipo Alfajor', 'Cantidad',
                    'Precio Venta', 'Costo', 'Subtotal Venta', 'Ganancia', 'Pagado', 'Debe',
                    'Forma Pago', 'Monto Efectivo', 'Monto Transfer.', 'Vendedor', 'Notas'];

    const rows = [];
    entregas.forEach(e => {
      const lineas = e.entrega_lineas || [];
      const ep = pagosMap[e.id] || { efectivo: 0, transferencia: 0 };
      if (lineas.length === 0) {
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
          ep.efectivo,
          ep.transferencia,
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
            ep.efectivo,
            ep.transferencia,
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
