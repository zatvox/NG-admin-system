/* =====================================================================
 * data/comunicados.js — Feed de anuncios (general o por comisión).
 * Publicar está limitado a Dirección/Líder — se valida también server-
 * side vía RLS (comunicados_insert en rls-policies.sql).
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;
  var MOCK = global.NG_MOCK;

  function mapComunicado(c) {
    return {
      id: c.id, titulo: c.titulo, cuerpo: c.cuerpo, alcance: c.alcance,
      comisionId: c.comision_id, autor: c.autor_id, fecha: (c.created_at || "").slice(0, 10)
    };
  }

  async function listarComunicados() {
    if (!db) return MOCK.COMUNICADOS;
    var { data, error } = await db.from("comunicados").select("*, usuarios(nombre)").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(function (c) {
      var m = mapComunicado(c);
      m.autor = c.usuarios ? c.usuarios.nombre : "—";
      return m;
    });
  }

  async function crearComunicado(payload) {
    if (!db) return null;
    var { data: sessionData } = await db.auth.getSession();
    var { data, error } = await db.from("comunicados").insert({
      titulo: payload.titulo,
      cuerpo: payload.cuerpo,
      alcance: payload.alcance ? "comision" : "general",
      comision_id: payload.alcance || null,
      autor_id: sessionData.session ? sessionData.session.user.id : null
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function actualizarComunicado(id, payload) {
    if (!db) return null;
    var { error } = await db.from("comunicados").update({
      titulo: payload.titulo,
      cuerpo: payload.cuerpo,
      alcance: payload.alcance ? "comision" : "general",
      comision_id: payload.alcance || null
    }).eq("id", id);
    if (error) throw error;
  }

  async function eliminarComunicado(id) {
    if (!db) return null;
    var { error } = await db.from("comunicados").delete().eq("id", id);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.comunicados = { listar: listarComunicados, crear: crearComunicado, actualizar: actualizarComunicado, eliminar: eliminarComunicado };
})(window);
