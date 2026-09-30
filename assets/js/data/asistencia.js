/* =====================================================================
 * data/asistencia.js — Listas de asistencia (tablas attendance_lists /
 * attendance_entries, migración 0013). Cargar → agregar asistentes →
 * auditar (0-100%) → validar. Validar dispara el trigger fn_acreditar_
 * asistencia en la base de datos — este archivo NUNCA calcula puntos,
 * solo mueve datos (ver ARCHITECTURE.md, "nada de lógica crítica en el
 * cliente").
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  function mapLista(l) {
    return {
      listId: l.list_id, eventoId: l.evento_id, uploadedBy: l.uploaded_by,
      auditedPct: Number(l.audited_pct), validatedAt: l.validated_at, validatedBy: l.validated_by,
      createdAt: l.created_at
    };
  }

  // Una lista por evento (o null si todavía no se creó ninguna).
  async function obtenerListaDeEvento(eventoId) {
    if (!db) return null;
    var { data, error } = await db.from("attendance_lists").select("*").eq("evento_id", eventoId).maybeSingle();
    if (error) throw error;
    return data ? mapLista(data) : null;
  }

  async function crearLista(eventoId) {
    if (!db) return null;
    var { data: sessionData } = await db.auth.getSession();
    var { data, error } = await db.from("attendance_lists").insert({
      evento_id: eventoId,
      uploaded_by: sessionData.session ? sessionData.session.user.id : null
    }).select().single();
    if (error) throw error;
    return mapLista(data);
  }

  async function listarAsistentes(listId) {
    if (!db) return [];
    var { data, error } = await db.from("attendance_entries").select("entry_id, usuario_id, resolved_at, usuarios(nombre)").eq("list_id", listId);
    if (error) throw error;
    return (data || []).map(function (e) {
      return { entryId: e.entry_id, usuarioId: e.usuario_id, nombre: e.usuarios ? e.usuarios.nombre : "—", resolvedAt: e.resolved_at };
    });
  }

  // usuarioIds: array. Ignora duplicados (unique(list_id, usuario_id)).
  async function agregarAsistentes(listId, usuarioIds) {
    if (!db || !usuarioIds || !usuarioIds.length) return;
    var filas = usuarioIds.map(function (uid) { return { list_id: listId, usuario_id: uid }; });
    var { error } = await db.from("attendance_entries").insert(filas).select();
    // Ignora el 23505 (duplicado): puede pasar si alguien ya estaba en la lista.
    if (error && error.code !== "23505") throw error;
  }

  async function quitarAsistente(entryId) {
    if (!db) return;
    var { error } = await db.from("attendance_entries").delete().eq("entry_id", entryId);
    if (error) throw error;
  }

  async function actualizarAuditoria(listId, pct) {
    if (!db) return;
    var { error } = await db.from("attendance_lists").update({ audited_pct: pct }).eq("list_id", listId);
    if (error) throw error;
  }

  // Dispara fn_acreditar_asistencia (trigger) si audited_pct ya es 100.
  async function validarLista(listId) {
    if (!db) return;
    var { data: sessionData } = await db.auth.getSession();
    var { error } = await db.from("attendance_lists").update({
      validated_at: new Date().toISOString(),
      validated_by: sessionData.session ? sessionData.session.user.id : null
    }).eq("list_id", listId);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.asistencia = {
    obtenerListaDeEvento: obtenerListaDeEvento,
    crearLista: crearLista,
    listarAsistentes: listarAsistentes,
    agregarAsistentes: agregarAsistentes,
    quitarAsistente: quitarAsistente,
    actualizarAuditoria: actualizarAuditoria,
    validarLista: validarLista
  };
})(window);
