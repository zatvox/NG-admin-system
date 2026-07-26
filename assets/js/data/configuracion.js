/* =====================================================================
 * data/configuracion.js — Backend del módulo "Configuración" (solo
 * Dirección). Clave/valor en jsonb: agregar un parámetro nuevo NO
 * requiere migración de esquema, solo un INSERT en configuracion.
 * En modo demo, los cambios quedan en memoria (se pierden al recargar)
 * y se avisa con un toast — igual filosofía que el resto de la demo.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;
  var cfg = global.NG_CONFIG;

  // Copia local editable en modo demo, arranca con los defaults de config.js.
  var demoValores = Object.assign({}, cfg.APP_DEFAULTS);

  async function obtenerConfiguracion() {
    if (!db) return demoValores;
    var { data, error } = await db.from("configuracion").select("clave, valor");
    if (error) throw error;
    var out = Object.assign({}, cfg.APP_DEFAULTS);
    (data || []).forEach(function (row) { out[row.clave] = row.valor; });
    return out;
  }

  async function guardarValor(clave, valor, descripcion) {
    if (!db) {
      demoValores[clave] = valor;
      return;
    }
    var { data: sessionData } = await db.auth.getSession();
    var { error } = await db.from("configuracion").upsert({
      clave: clave,
      valor: valor,
      descripcion: descripcion || null,
      actualizado_por: sessionData.session ? sessionData.session.user.id : null,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.configuracion = { obtener: obtenerConfiguracion, guardar: guardarValor };
})(window);
