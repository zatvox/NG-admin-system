/* =====================================================================
 * data/eventos.js — Calendario compartido.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;
  var MOCK = global.NG_MOCK;

  function mapEvento(e) {
    return { id: e.id, titulo: e.titulo, fecha: e.fecha, alcance: e.alcance, comisionId: e.comision_id };
  }

  async function listarEventos() {
    if (!db) return MOCK.EVENTOS;
    var { data, error } = await db.from("eventos").select("*").order("fecha");
    if (error) throw error;
    return (data || []).map(mapEvento);
  }

  async function crearEvento(payload) {
    if (!db) return null; // demo: el modal ya avisa que falta conectar BD
    var { data, error } = await db.from("eventos").insert({
      titulo: payload.titulo,
      fecha: payload.fecha,
      alcance: payload.alcance ? "comision" : "general",
      comision_id: payload.alcance || null
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function actualizarEvento(id, payload) {
    if (!db) return null;
    var { error } = await db.from("eventos").update({
      titulo: payload.titulo,
      fecha: payload.fecha,
      alcance: payload.alcance ? "comision" : "general",
      comision_id: payload.alcance || null
    }).eq("id", id);
    if (error) throw error;
  }

  async function eliminarEvento(id) {
    if (!db) return null;
    var { error } = await db.from("eventos").delete().eq("id", id);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.eventos = { listar: listarEventos, crear: crearEvento, actualizar: actualizarEvento, eliminar: eliminarEvento };
})(window);
