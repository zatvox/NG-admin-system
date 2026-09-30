/* =====================================================================
 * data/inscripciones.js — Inscripción pública a eventos (migración 0015).
 * Tabla event_inscripciones: autoservicio, cualquier cuenta autenticada
 * inserta SU PROPIA fila desde inscripcion.html (ver rls-policies.sql).
 * No toca el motor de puntaje — el organizador decide, desde el módulo
 * Eventos, cuándo "cargar" los confirmados a la lista de Asistencia real
 * (attendance_entries, data/asistencia.js), que es la que sí acredita.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  // Usado por inscripcion.html: ¿YO ya confirmé mi asistencia a este evento?
  async function obtenerMia(eventoId) {
    if (!db) return null;
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { data, error } = await db.from("event_inscripciones").select("*")
      .eq("evento_id", eventoId).eq("usuario_id", userData.user.id).maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, estado: data.estado, createdAt: data.created_at } : null;
  }

  // upsert: si ya existe (por ejemplo, había cancelado antes) la vuelve a
  // dejar en 'confirmado' en vez de fallar por el unique(evento_id, usuario_id).
  async function confirmar(eventoId) {
    if (!db) { global.NG_TOAST && global.NG_TOAST.show("Esto requiere Supabase conectado.", "info"); return null; }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("event_inscripciones")
      .upsert({ evento_id: eventoId, usuario_id: userData.user.id, estado: "confirmado" }, { onConflict: "evento_id,usuario_id" });
    if (error) throw error;
  }

  async function cancelar(eventoId) {
    if (!db) return null;
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("event_inscripciones").update({ estado: "cancelado" })
      .eq("evento_id", eventoId).eq("usuario_id", userData.user.id);
    if (error) throw error;
  }

  // Admin — módulo Eventos: lista completa con nombre + ubicación, para el
  // resumen de inscritos y para saber a quién "cargar" a Asistencia.
  async function listarDeEvento(eventoId) {
    if (!db) return [];
    var { data, error } = await db.from("event_inscripciones")
      .select("id, usuario_id, estado, created_at, usuarios(nombre, distrito, provincia, pais)")
      .eq("evento_id", eventoId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(function (r) {
      return {
        id: r.id, usuarioId: r.usuario_id, estado: r.estado, createdAt: r.created_at,
        nombre: r.usuarios ? r.usuarios.nombre : "—",
        distrito: r.usuarios ? r.usuarios.distrito : null,
        provincia: r.usuarios ? r.usuarios.provincia : null,
        pais: r.usuarios ? r.usuarios.pais : null
      };
    });
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.inscripciones = {
    obtenerMia: obtenerMia,
    confirmar: confirmar,
    cancelar: cancelar,
    listarDeEvento: listarDeEvento
  };
})(window);
