/* =====================================================================
 * data/resultados.js — Entrega de resultados (tabla result_deliveries,
 * migración 0013). Cualquier miembro activo sube SU propia entrega
 * (evidence_ref: por ahora un texto/URL, no un archivo — igual criterio
 * simple que otros campos de referencia del sistema); Dirección o quien
 * organiza el evento la valida o rechaza. Validar dispara el trigger
 * fn_acreditar_resultado.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  function mapEntrega(d) {
    return {
      deliveryId: d.delivery_id, eventoId: d.evento_id, usuarioId: d.usuario_id,
      evidenceRef: d.evidence_ref, status: d.status, validatedBy: d.validated_by,
      validatedAt: d.validated_at, motivoRechazo: d.motivo_rechazo, createdAt: d.created_at,
      eventoTitulo: d.eventos ? d.eventos.titulo : null,
      usuarioNombre: d.usuarios ? d.usuarios.nombre : null
    };
  }

  // Todas las entregas visibles para mí (RLS ya filtra: las mías, o las de
  // eventos que organizo, o todas si soy Dirección).
  async function listarEntregas() {
    if (!db) return [];
    // usuarios(nombre) es ambiguo aquí: result_deliveries tiene DOS FK a
    // usuarios (usuario_id y validated_by) — hay que decirle a PostgREST
    // cuál seguir con el nombre exacto de la constraint.
    var { data, error } = await db.from("result_deliveries")
      .select("*, eventos(titulo), usuarios!result_deliveries_usuario_id_fkey(nombre)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapEntrega);
  }

  async function crearEntrega(eventoId, evidenceRef) {
    if (!db) return null;
    var { data: sessionData } = await db.auth.getSession();
    var { error } = await db.from("result_deliveries").insert({
      evento_id: eventoId,
      usuario_id: sessionData.session ? sessionData.session.user.id : null,
      evidence_ref: evidenceRef
    });
    if (error) throw error;
  }

  async function validarEntrega(deliveryId) {
    if (!db) return;
    var { data: sessionData } = await db.auth.getSession();
    var { error } = await db.from("result_deliveries").update({
      status: "VALIDADO", validated_by: sessionData.session ? sessionData.session.user.id : null, validated_at: new Date().toISOString()
    }).eq("delivery_id", deliveryId);
    if (error) throw error;
  }

  async function rechazarEntrega(deliveryId, motivo) {
    if (!db) return;
    var { data: sessionData } = await db.auth.getSession();
    var { error } = await db.from("result_deliveries").update({
      status: "RECHAZADO", validated_by: sessionData.session ? sessionData.session.user.id : null, validated_at: new Date().toISOString(), motivo_rechazo: motivo || null
    }).eq("delivery_id", deliveryId);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.resultados = { listar: listarEntregas, crear: crearEntrega, validar: validarEntrega, rechazar: rechazarEntrega };
})(window);
