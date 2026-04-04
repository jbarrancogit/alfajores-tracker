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
