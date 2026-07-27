/* =====================================================================
 * data/enlaces.js — Biblioteca de recursos compartidos entre comisiones.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;
  var MOCK = global.NG_MOCK;

  function mapEnlace(l) {
    return { id: l.id, nombre: l.nombre, url: l.url, descripcion: l.descripcion, comisionId: l.comision_id, fecha: (l.created_at || "").slice(0, 10) };
  }

  async function listarEnlaces() {
    if (!db) return MOCK.ENLACES;
    var { data, error } = await db.from("enlaces").select("*, usuarios(nombre)").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(function (l) {
      var m = mapEnlace(l);
      m.autor = l.usuarios ? l.usuarios.nombre : "—";
      return m;
    });
  }

  async function crearEnlace(payload) {
    if (!db) return null;
    var { data: sessionData } = await db.auth.getSession();
    var { data, error } = await db.from("enlaces").insert({
      nombre: payload.nombre,
      url: payload.url,
      descripcion: payload.descripcion || null,
      comision_id: payload.alcance || null,
      autor_id: sessionData.session ? sessionData.session.user.id : null
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function actualizarEnlace(id, payload) {
    if (!db) return null;
    var { error } = await db.from("enlaces").update({
      nombre: payload.nombre,
      url: payload.url,
      descripcion: payload.descripcion || null,
      comision_id: payload.alcance || null
    }).eq("id", id);
    if (error) throw error;
  }

  async function eliminarEnlace(id) {
    if (!db) return null;
    var { error } = await db.from("enlaces").delete().eq("id", id);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.enlaces = { listar: listarEnlaces, crear: crearEnlace, actualizar: actualizarEnlace, eliminar: eliminarEnlace };
})(window);
