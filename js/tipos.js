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

  /**
   * Cost to prefill in the entrega form for a type.
   * The cost configured by the admin (costo_default) wins over the per-device
   * lastCosto, so a change in Configuración reaches every phone. The stored
   * value is only a fallback for types with no configured cost.
   */
  getCostoInicial(tipo) {
    if (!tipo) return '';
    return parseFloat(tipo.costo_default) || Tipos.getLastCosto(tipo.id) || '';
  },

  /** Save last used price/cost for a type */
  saveLast(tipoId, precio, costo) {
    if (precio) localStorage.setItem('lastPrecio_' + tipoId, precio);
    if (costo) localStorage.setItem('lastCosto_' + tipoId, costo);
  }
};
