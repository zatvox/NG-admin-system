/* =====================================================================
 * data/flyers.js — Piezas gráficas de la landing pública (index.html).
 * Publicar es exclusivo de Dirección (ver rls-policies.sql). No hay
 * dataset de ejemplo en modo demo — como el Foro, esto solo tiene sentido
 * con Supabase conectado.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  function mapFlyer(f) {
    return {
      id: f.id, titulo: f.titulo, descripcion: f.descripcion,
      imagenUrl: f.imagen_url, orden: f.orden, activo: f.activo
    };
  }

  async function listar() {
    if (!db) return [];
    var { data, error } = await db.from("flyers").select("*").order("orden", { ascending: true });
    if (error) throw error;
    return (data || []).map(mapFlyer);
  }

  async function crear(payload) {
    if (!db) { global.NG_TOAST && global.NG_TOAST.show("Esto requiere Supabase conectado.", "info"); return null; }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("flyers").insert({
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      imagen_url: payload.imagenUrl,
      orden: payload.orden ? Number(payload.orden) : 0,
      activo: payload.activo !== false,
      created_by: userData.user.id
    });
    if (error) throw error;
  }

  async function actualizar(id, payload) {
    if (!db) return null;
    var { error } = await db.from("flyers").update({
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      imagen_url: payload.imagenUrl,
      orden: payload.orden ? Number(payload.orden) : 0,
      activo: payload.activo !== false
    }).eq("id", id);
    if (error) throw error;
  }

  async function eliminar(id) {
    if (!db) return null;
    var { error } = await db.from("flyers").delete().eq("id", id);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.flyers = { listar: listar, crear: crear, actualizar: actualizar, eliminar: eliminar };
})(window);
