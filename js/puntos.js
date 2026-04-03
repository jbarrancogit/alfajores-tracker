const Puntos = {
  cache: [],

  async fetchAll() {
    const { data, error } = await db
      .from('puntos_entrega')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    if (error) console.error('Error cargando puntos:', error);
    Puntos.cache = data || [];
    return Puntos.cache;
  },

  async create(punto) {
    const { data, error } = await db
      .from('puntos_entrega')
      .insert({
        nombre: punto.nombre,
        direccion: punto.direccion || '',
        contacto: punto.contacto || '',
        telefono: punto.telefono || '',
        notas: punto.notas || ''
      })
      .select()
      .single();
    if (error) throw error;
    Puntos.cache.push(data);
    return data;
  },

  renderSelector(selectedId) {
    const options = Puntos.cache.map(p =>
      `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.nombre)}</option>`
    ).join('');
    return `
      <select class="form-select" id="ent-punto" onchange="Entregas.onPuntoChange()">
        <option value="">Seleccionar punto...</option>
        ${options}
        <option value="__nuevo__">+ Nuevo punto</option>
      </select>
    `;
  }
};
