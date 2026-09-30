/* =====================================================================
 * data/eventos.js — Calendario compartido. Desde la migración 0013,
 * cada evento puede llevar tipo_actividad + comando_id (nivel_
 * organizador se deriva solo en la base de datos) para alimentar el
 * motor de puntaje (ATTENDANCE_VALIDATED / RESULTS_DELIVERED).
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;
  var MOCK = global.NG_MOCK;

  function mapEvento(e) {
    return {
      id: e.id, titulo: e.titulo, fecha: e.fecha, alcance: e.alcance, comisionId: e.comision_id,
      comandoId: e.comando_id || null,
      tipoActividad: e.tipo_actividad || null,
      nivelOrganizador: e.nivel_organizador || null,
      cancelado: !!e.cancelado,
      // (2026-09-30) Migración 0015 — inscripción pública (link + QR).
      flyerId: e.flyer_id || null,
      inscripcionPublica: !!e.inscripcion_publica,
      codigoPublico: e.codigo_publico || null
    };
  }

  async function listarEventos() {
    if (!db) return MOCK.EVENTOS;
    var { data, error } = await db.from("eventos").select("*").order("fecha");
    if (error) throw error;
    return (data || []).map(mapEvento);
  }

  // Solo eventos clasificados con tipo_actividad (los únicos que el motor
  // de puntaje puede acreditar) — usado por las pantallas de Asistencia y
  // Entrega de resultados.
  async function listarEventosAcreditables() {
    var todos = await listarEventos();
    return todos.filter(function (e) { return e.tipoActividad && !e.cancelado; });
  }

  function payloadComun(payload) {
    // payload.comando viene codificado "comandoId|comisionId" desde el
    // <select> del modal (ver comandoSelectOptions en modal-openers.js) —
    // solo se manda comando_id si esa comisión coincide con "alcance"; si
    // eligieron General o una comisión distinta, se ignora.
    var comandoId = null;
    if (payload.comando) {
      var partes = String(payload.comando).split("|");
      if (partes[1] === payload.alcance) comandoId = partes[0];
    }
    return {
      titulo: payload.titulo,
      fecha: payload.fecha,
      alcance: payload.alcance ? "comision" : "general",
      comision_id: payload.alcance || null,
      comando_id: comandoId,
      tipo_actividad: payload.tipoActividad || null,
      // (2026-09-30) Flyer para la página pública de inscripción — opcional,
      // se elige entre los flyers ya publicados (módulo Flyers).
      flyer_id: payload.flyerId || null
    };
  }

  // Código corto y único para el link público (inscripcion.html?e=<codigo>).
  // No hace falta lógica de reintento ante colisión: el espacio de 10
  // caracteres alfanuméricos hace la probabilidad de choque despreciable,
  // y el unique de la columna igual lo bloquearía si pasara.
  function generarCodigoPublico() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 10);
  }

  async function crearEvento(payload) {
    if (!db) return null; // demo: el modal ya avisa que falta conectar BD
    var { data, error } = await db.from("eventos").insert(payloadComun(payload)).select().single();
    if (error) throw error;
    return data;
  }

  async function actualizarEvento(id, payload) {
    if (!db) return null;
    var { error } = await db.from("eventos").update(payloadComun(payload)).eq("id", id);
    if (error) throw error;
  }

  async function eliminarEvento(id) {
    if (!db) return null;
    var { error } = await db.from("eventos").delete().eq("id", id);
    if (error) throw error;
  }

  // (2026-09-30) Inscripción pública — módulo Eventos (views/eventos.js).
  async function activarInscripcionPublica(eventoId) {
    if (!db) return null;
    var codigo = generarCodigoPublico();
    var { data, error } = await db.from("eventos")
      .update({ inscripcion_publica: true, codigo_publico: codigo })
      .eq("id", eventoId).select().single();
    if (error) throw error;
    return mapEvento(data);
  }

  // Se conserva codigo_publico a propósito: si se reactiva más tarde, el
  // mismo link/QR ya impreso/compartido sigue funcionando sin reimprimir nada.
  async function desactivarInscripcionPublica(eventoId) {
    if (!db) return null;
    var { error } = await db.from("eventos").update({ inscripcion_publica: false }).eq("id", eventoId);
    if (error) throw error;
  }

  // Usado por inscripcion.html (requiere sesión, pero de cualquier cuenta
  // autenticada — ver rls-policies.sql, rama pública de eventos_select).
  async function obtenerEventoPorCodigoPublico(codigo) {
    if (!db || !codigo) return null;
    var { data, error } = await db.from("eventos").select("*")
      .eq("codigo_publico", codigo).eq("inscripcion_publica", true).eq("cancelado", false)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEvento(data) : null;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.eventos = {
    listar: listarEventos,
    listarAcreditables: listarEventosAcreditables,
    crear: crearEvento,
    actualizar: actualizarEvento,
    eliminar: eliminarEvento,
    activarInscripcionPublica: activarInscripcionPublica,
    desactivarInscripcionPublica: desactivarInscripcionPublica,
    obtenerPorCodigoPublico: obtenerEventoPorCodigoPublico
  };
})(window);
