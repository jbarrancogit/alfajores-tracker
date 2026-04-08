const ExcelExport = {
  async _fetchPagosMap(entregaIds) {
    const data = await batchIn('pagos', 'entrega_id, monto, forma_pago', 'entrega_id', entregaIds || []);
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
        <div class="export-option" onclick="ExcelExport.exportAudit()" style="border:1px solid var(--red)">
          <div class="export-option-title" style="color:var(--red)">Auditoría completa</div>
          <div class="export-option-desc">Todos los datos de TODA la historia, por repartidor, con detección de discrepancias y pagos duplicados</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  },

  _semana(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return ((weekNum - 1) % 4) + 1;
  },

  async _fetchData() {
    if (Analisis._data && Analisis._data.entregas) {
      return Analisis._data.entregas;
    }
    const { from, to } = Analisis._dateRange(Analisis.periodo);
    let query = db.from('entregas')
      .select('*, entrega_lineas(*, tipos_alfajor(nombre)), puntos_entrega(nombre, direccion), usuarios(nombre)');
    if (from) query = query.gte('fecha_hora', from.toISOString());
    query = query.lte('fecha_hora', to.toISOString());
    query = query.order('fecha_hora', { ascending: true });
    const { data } = await query;
    return data || [];
  },

  async exportEmi() {
    showToast('Generando reporte...');
    const entregas = await ExcelExport._fetchData();
    const tipos = Tipos.activos();
    const tipoNames = tipos.map(t => t.nombre);
    const pagosMap = await ExcelExport._fetchPagosMap(entregas.map(e => e.id));

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
      const _ep = pagosMap[e.id] || { efectivo: 0, transferencia: 0 };
      liqMap[key].cobrado += _ep.efectivo + _ep.transferencia;
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
    const pagosMap = await ExcelExport._fetchPagosMap(entregas.map(e => e.id));

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
          ep.efectivo + ep.transferencia,
          Number(e.monto_total) - (ep.efectivo + ep.transferencia),
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
            ep.efectivo + ep.transferencia,
            Number(e.monto_total) - (ep.efectivo + ep.transferencia),
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
  },

  /** Full audit export — all data, all time, per user, with discrepancy detection */
  async exportAudit() {
    showToast('Generando auditoría completa...');
    const btn = document.querySelector('.modal-overlay .export-option:last-child');
    if (btn) btn.style.opacity = '0.5';

    try {
      // Fetch ALL entregas (no date filter)
      const { data: allEntregas } = await db.from('entregas')
        .select('*, entrega_lineas(*, tipos_alfajor(nombre)), puntos_entrega(nombre), usuarios(nombre)')
        .order('fecha_hora', { ascending: true });
      const entregas = allEntregas || [];

      // Fetch ALL pagos
      const { data: allPagos } = await db.from('pagos')
        .select('*, usuarios(nombre)')
        .order('fecha', { ascending: true });
      const pagos = allPagos || [];

      // Fetch usuarios
      const { data: usuarios } = await db.from('usuarios').select('id, nombre, rol, comision_pct');
      const userMap = {};
      (usuarios || []).forEach(u => { userMap[u.id] = u; });

      // Build pagos-per-entrega map
      const pagosPerEntrega = {};
      pagos.forEach(p => {
        if (!pagosPerEntrega[p.entrega_id]) pagosPerEntrega[p.entrega_id] = [];
        pagosPerEntrega[p.entrega_id].push(p);
      });

      // ========== HOJA 1: Resumen por Repartidor ==========
      const resMap = {};
      entregas.forEach(e => {
        const uid = e.repartidor_id;
        const u = userMap[uid] || {};
        if (!resMap[uid]) resMap[uid] = {
          nombre: u.nombre || e.usuarios?.nombre || '?', rol: u.rol || '?',
          entregas: 0, uds: 0, vendido: 0, cobrado_tabla: 0, cobrado_pagos: 0,
          efectivo: 0, transfer: 0, pendiente: 0
        };
        const r = resMap[uid];
        r.entregas++;
        r.uds += Number(e.cantidad);
        r.vendido += Number(e.monto_total);
        r.cobrado_tabla += Number(e.monto_pagado);
        const ep = pagosPerEntrega[e.id] || [];
        ep.forEach(p => {
          if (p.forma_pago === 'efectivo') r.efectivo += Number(p.monto);
          else if (p.forma_pago === 'transferencia') r.transfer += Number(p.monto);
        });
        r.cobrado_pagos = r.efectivo + r.transfer;
        r.pendiente = r.vendido - r.cobrado_pagos;
      });
      const resHeader = ['Repartidor', 'Rol', 'Entregas', 'Unidades', 'Vendido',
        'Cobrado (tabla entregas)', 'Cobrado (tabla pagos)', 'Diferencia',
        'Efectivo', 'Transferencia', 'Pendiente'];
      const resRows = Object.values(resMap).map(r => [
        r.nombre, r.rol, r.entregas, r.uds, r.vendido,
        r.cobrado_tabla, r.cobrado_pagos,
        r.cobrado_tabla - r.cobrado_pagos,
        r.efectivo, r.transfer, r.pendiente
      ]);

      // ========== HOJA 2: Todas las Entregas ==========
      const entHeader = ['Fecha', 'Repartidor', 'Cliente', 'Recibió', 'Unidades', 'Detalle',
        'Total Venta', 'Pagado (entregas)', 'Pagado (pagos)', 'Diferencia',
        'Efectivo', 'Transferencia', 'Pendiente', 'Forma Pago', 'Estado', 'Notas'];
      const entRows = entregas.map(e => {
        const ep = pagosPerEntrega[e.id] || [];
        let ef = 0, tr = 0;
        ep.forEach(p => {
          if (p.forma_pago === 'efectivo') ef += Number(p.monto);
          else if (p.forma_pago === 'transferencia') tr += Number(p.monto);
        });
        const cobradoPagos = ef + tr;
        const cobradoTabla = Number(e.monto_pagado);
        const total = Number(e.monto_total);
        const diff = cobradoTabla - cobradoPagos;
        const detalle = (e.entrega_lineas || []).map(l =>
          `${l.cantidad} ${l.tipos_alfajor?.nombre || '?'}`).join(', ');
        let estado = 'Fiado';
        if (cobradoPagos >= total && total > 0) estado = 'Pagado';
        else if (cobradoPagos > 0) estado = 'Parcial';
        return [
          fmtDateTime(e.fecha_hora),
          e.usuarios?.nombre || '?',
          e.puntos_entrega?.nombre || e.punto_nombre_temp || '?',
          e.recibio || '',
          e.cantidad,
          detalle,
          total, cobradoTabla, cobradoPagos,
          Math.abs(diff) > 0.01 ? diff : 0,
          ef, tr,
          total - cobradoPagos,
          e.forma_pago || '',
          estado,
          e.notas || ''
        ];
      });

      // ========== HOJA 3: Todos los Pagos ==========
      const pagHeader = ['Fecha Pago', 'Entrega Fecha', 'Cliente', 'Repartidor',
        'Monto', 'Forma', 'Registrado Por'];
      const pagRows = pagos.map(p => {
        const e = entregas.find(x => x.id === p.entrega_id);
        return [
          fmtDateTime(p.fecha),
          e ? fmtDateTime(e.fecha_hora) : '?',
          e ? (e.puntos_entrega?.nombre || e.punto_nombre_temp || '?') : '?',
          e ? (e.usuarios?.nombre || '?') : '?',
          Number(p.monto),
          p.forma_pago,
          p.usuarios?.nombre || '?'
        ];
      });

      // ========== HOJA 4: Discrepancias ==========
      const discHeader = ['Tipo', 'Fecha', 'Cliente', 'Repartidor', 'Detalle', 'Valor 1', 'Valor 2'];
      const discRows = [];

      // Discrepancias monto_pagado vs pagos
      entregas.forEach(e => {
        const ep = pagosPerEntrega[e.id] || [];
        let sumPagos = 0;
        ep.forEach(p => { sumPagos += Number(p.monto); });
        const diff = Number(e.monto_pagado) - sumPagos;
        if (Math.abs(diff) > 0.01) {
          discRows.push([
            'DESYNC monto_pagado',
            fmtDateTime(e.fecha_hora),
            e.puntos_entrega?.nombre || '?',
            e.usuarios?.nombre || '?',
            `entregas.monto_pagado=${e.monto_pagado}, sum(pagos)=${sumPagos}`,
            Number(e.monto_pagado), sumPagos
          ]);
        }
      });

      // Posibles duplicados (pagos < 5 seg diferencia, mismo monto y forma)
      const sorted = [...pagos].sort((a, b) => a.entrega_id.localeCompare(b.entrega_id) || new Date(a.fecha) - new Date(b.fecha));
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1], b = sorted[i];
        if (a.entrega_id === b.entrega_id && a.monto === b.monto && a.forma_pago === b.forma_pago) {
          const diffSec = Math.abs(new Date(b.fecha) - new Date(a.fecha)) / 1000;
          if (diffSec < 10) {
            const e = entregas.find(x => x.id === a.entrega_id);
            discRows.push([
              'POSIBLE DUPLICADO',
              fmtDateTime(b.fecha),
              e ? (e.puntos_entrega?.nombre || '?') : '?',
              e ? (e.usuarios?.nombre || '?') : '?',
              `$${a.monto} ${a.forma_pago} x2, ${diffSec.toFixed(0)}s diferencia`,
              Number(a.monto), Number(b.monto)
            ]);
          }
        }
      }

      // Entregas sin líneas
      entregas.forEach(e => {
        if (!e.entrega_lineas || e.entrega_lineas.length === 0) {
          discRows.push([
            'SIN LINEAS',
            fmtDateTime(e.fecha_hora),
            e.puntos_entrega?.nombre || '?',
            e.usuarios?.nombre || '?',
            `Entrega sin detalle de alfajores`,
            Number(e.monto_total), 0
          ]);
        }
      });

      // Entregas con cobrado > vendido (overpayment)
      entregas.forEach(e => {
        const ep = pagosPerEntrega[e.id] || [];
        let sumPagos = 0;
        ep.forEach(p => { sumPagos += Number(p.monto); });
        if (sumPagos > Number(e.monto_total) + 0.01) {
          discRows.push([
            'SOBREPAGO',
            fmtDateTime(e.fecha_hora),
            e.puntos_entrega?.nombre || '?',
            e.usuarios?.nombre || '?',
            `Cobrado $${sumPagos} > Total $${e.monto_total}`,
            sumPagos, Number(e.monto_total)
          ]);
        }
      });

      if (discRows.length === 0) {
        discRows.push(['OK', '', '', '', 'No se encontraron discrepancias', 0, 0]);
      }

      // ========== Generar Excel ==========
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet([resHeader, ...resRows]);
      const ws2 = XLSX.utils.aoa_to_sheet([entHeader, ...entRows]);
      const ws3 = XLSX.utils.aoa_to_sheet([pagHeader, ...pagRows]);
      const ws4 = XLSX.utils.aoa_to_sheet([discHeader, ...discRows]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por Repartidor');
      XLSX.utils.book_append_sheet(wb, ws2, 'Todas las Entregas');
      XLSX.utils.book_append_sheet(wb, ws3, 'Todos los Pagos');
      XLSX.utils.book_append_sheet(wb, ws4, 'Discrepancias');
      XLSX.writeFile(wb, 'alfajores-auditoria-completa.xlsx');

      document.querySelector('.modal-overlay')?.remove();
      showToast('Auditoría descargada');
    } catch (err) {
      console.error('Error exportando auditoría:', err);
      showToast('Error: ' + (err.message || err));
    }
  }
};
