const Pagos = {
  /** Register a payment for an entrega */
  async registrar(entregaId, monto, formaPago) {
    // Validate entrega exists before inserting
    const { data: entrega } = await db.from('entregas')
      .select('id')
      .eq('id', entregaId)
      .single();
    if (!entrega) throw new Error('Entrega no encontrada');

    const { error: pagoErr } = await db.from('pagos').insert({
      entrega_id: entregaId,
      monto: monto,
      forma_pago: formaPago,
      registrado_por: Auth.currentUser.id
    });
    if (pagoErr) throw pagoErr;

    // Re-derive monto_pagado by summing ALL pagos for this entrega
    const { data: allPagos } = await db.from('pagos')
      .select('monto, forma_pago')
      .eq('entrega_id', entregaId);
    const nuevoMontoPagado = (allPagos || []).reduce((sum, p) => sum + Number(p.monto), 0);

    // Derive forma_pago from all pagos for this entrega
    const methods = new Set((allPagos || []).map(p => p.forma_pago));
    let formaActual = 'fiado';
    if (methods.size === 1) formaActual = [...methods][0];
    else if (methods.size > 1) formaActual = 'mixto';

    const { error: updateErr } = await db.from('entregas')
      .update({ monto_pagado: nuevoMontoPagado, forma_pago: formaActual })
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
                 min="1" max="${deudaRestante}" step="1" value="${deudaRestante}" inputmode="numeric">
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

    // Prevent overpayment
    const { data: entregaCheck } = await db.from('entregas')
      .select('monto_total, monto_pagado')
      .eq('id', entregaId)
      .single();
    if (entregaCheck) {
      const maxPago = Number(entregaCheck.monto_total) - Number(entregaCheck.monto_pagado);
      if (monto > maxPago) {
        showToast(`Monto máximo: ${fmtMoney(maxPago)}`);
        return;
      }
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
        <div class="form-group mb-8">
          <label class="form-label">Forma de pago (pagar todo)</label>
          <div class="toggle-group">
            <button type="button" class="toggle-btn active"
                    onclick="Pagos.setFormaPagoTodo(this, 'efectivo')">Efectivo</button>
            <button type="button" class="toggle-btn"
                    onclick="Pagos.setFormaPagoTodo(this, 'transferencia')">Transfer.</button>
          </div>
          <input type="hidden" id="pago-todo-forma" value="efectivo">
        </div>
        <button class="btn btn-primary btn-block mb-16"
                onclick="Pagos.pagarTodo('${puntoId}', this)">Pagar todo (${fmtMoney(totalDeuda)})</button>
        <button class="btn btn-secondary btn-block mb-16"
                onclick="Pagos.sharePortal('${puntoId}')">Compartir cuenta</button>
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
  },

  setFormaPagoTodo(btn, valor) {
    btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('pago-todo-forma').value = valor;
  },

  /** Pay all unpaid entregas for a punto */
  async pagarTodo(puntoId, btn) {
    btn.disabled = true;
    btn.textContent = 'Procesando...';

    const formaPago = document.getElementById('pago-todo-forma').value;

    try {
      const { data } = await db.from('entregas')
        .select('id, monto_total, monto_pagado')
        .eq('punto_entrega_id', puntoId);

      const impagas = (data || []).filter(e => Number(e.monto_pagado) < Number(e.monto_total));

      for (const e of impagas) {
        const deuda = Number(e.monto_total) - Number(e.monto_pagado);
        await Pagos.registrar(e.id, deuda, formaPago);
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
