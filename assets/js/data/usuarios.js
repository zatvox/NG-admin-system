/* =====================================================================
 * data/usuarios.js — Perfil propio + panel de administración de cuentas
 * (solo Dirección). Dos cosas distintas que comparten tabla:
 *   - actualizarPerfil(): cualquiera edita SU PROPIA fila (usuarios_
 *     update_propio ya lo permitía por RLS, solo faltaba la UI).
 *   - listarTodos()/actualizarUsuarioAdmin(): Dirección ve/edita
 *     CUALQUIER fila (misma política, la cláusula fn_es_direccion()).
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  async function actualizarPerfil(payload) {
    if (!db) { global.NG_TOAST && global.NG_TOAST.show("Esto requiere Supabase conectado.", "info"); return null; }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("usuarios").update({
      nombre: payload.nombre,
      telefono: payload.telefono || null
    }).eq("id", userData.user.id);
    if (error) throw error;
  }

  async function listarTodos() {
    if (!db) return [];
    var { data, error } = await db.from("usuarios").select("*").order("nombre");
    if (error) throw error;
    return data || [];
  }

  // payload = { estado?, esDireccion? } — se manda solo lo que cambió,
  // para no pisar el otro campo con un update innecesario.
  async function actualizarUsuarioAdmin(usuarioId, payload) {
    if (!db) return null;
    var cambios = {};
    if (typeof payload.esDireccion === "boolean") cambios.es_direccion = payload.esDireccion;
    if (payload.estado) cambios.estado = payload.estado;
    var { error } = await db.from("usuarios").update(cambios).eq("id", usuarioId);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.usuarios = {
    actualizarPerfil: actualizarPerfil,
    listarTodos: listarTodos,
    actualizarUsuarioAdmin: actualizarUsuarioAdmin
  };
})(window);
