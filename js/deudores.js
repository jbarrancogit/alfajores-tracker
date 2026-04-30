const Deudores = {
  filters: { orden: 'saldo', search: '', repartidorId: '' },
  _data: [],
  _unpaidEntregas: [],
  _fetchId: 0,

  render() {
    return `
      <div class="app-header">
        <h1>Deudores</h1>
      </div>
      <div id="deud-list"><div class="spinner mt-8"></div></div>
    `;
  }
};
