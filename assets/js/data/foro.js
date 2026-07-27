/* =====================================================================
 * data/foro.js — Foro de Ideas: temas de debate, comentarios y votos de
 * apoyo. Todavía no tiene dataset de ejemplo en modo demo (!db) porque
 * su gracia es el intercambio real entre personas — en demo se muestra
 * un aviso en vez de datos falsos (ver views/foro.js).
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  var ESTADOS_LABEL = {
    abierto: "Abierto a debate",
    en_debate: "En debate",
    con_conclusion: "Con conclusión",
    cerrado: "Cerrado"
  };

  function mapTema(t, totalComentarios, comisiones) {
    var c = t.comision_id ? (comisiones || []).filter(function (x) { return x.id === t.comision_id; })[0] : null;
    return {
      id: t.id, titulo: t.titulo, problema: t.problema, estado: t.estado,
      conclusion: t.conclusion, rutaAccion: t.ruta_accion,
      autorId: t.autor_id, autor: t.usuarios ? t.usuarios.nombre : "—",
      comisionId: t.comision_id, comisionNombre: c ? c.nombre : null, comisionColor: c ? c.color : null,
      fecha: (t.created_at || "").slice(0, 10),
      totalComentarios: totalComentarios || 0
    };
  }

  async function listarTemas(comisiones) {
    if (!db) return [];
    var [{ data: temas, error: e1 }, { data: conteos, error: e2 }] = await Promise.all([
      db.from("foro_temas").select("*, usuarios(nombre)").order("created_at", { ascending: false }),
      db.from("foro_comentarios").select("tema_id")
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    var conteoPorTema = {};
    (conteos || []).forEach(function (c) { conteoPorTema[c.tema_id] = (conteoPorTema[c.tema_id] || 0) + 1; });
    return (temas || []).map(function (t) { return mapTema(t, conteoPorTema[t.id], comisiones); });
  }

  async function obtenerTema(id, comisiones) {
    if (!db) return null;
    var { data, error } = await db.from("foro_temas").select("*, usuarios(nombre)").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapTema(data, 0, comisiones) : null;
  }

  async function listarComentarios(temaId) {
    if (!db) return [];
    var { data: userData } = await db.auth.getUser();
    var miId = userData && userData.user ? userData.user.id : null;
    var [{ data: comentarios, error: e1 }, { data: votos, error: e2 }] = await Promise.all([
      db.from("foro_comentarios").select("*, usuarios(nombre)").eq("tema_id", temaId).order("created_at", { ascending: true }),
      db.from("foro_votos").select("comentario_id, usuario_id")
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    var votosPorComentario = {};
    (votos || []).forEach(function (v) {
      if (!votosPorComentario[v.comentario_id]) votosPorComentario[v.comentario_id] = { total: 0, mio: false };
      votosPorComentario[v.comentario_id].total++;
      if (v.usuario_id === miId) votosPorComentario[v.comentario_id].mio = true;
    });
    return (comentarios || []).map(function (c) {
      var v = votosPorComentario[c.id] || { total: 0, mio: false };
      return {
        id: c.id, cuerpo: c.cuerpo, esPropuesta: c.es_propuesta,
        autorId: c.autor_id, autor: c.usuarios ? c.usuarios.nombre : "—",
        fecha: (c.created_at || "").slice(0, 10), votos: v.total, yoVote: v.mio
      };
    });
  }

  async function crearTema(payload) {
    if (!db) { global.NG_TOAST && global.NG_TOAST.show("El Foro necesita Supabase conectado.", "info"); return null; }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { data, error } = await db.from("foro_temas").insert({
      titulo: payload.titulo,
      problema: payload.problema,
      comision_id: payload.comisionId || null,
      autor_id: userData.user.id
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function comentar(temaId, cuerpo, esPropuesta) {
    if (!db) return null;
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { data, error } = await db.from("foro_comentarios").insert({
      tema_id: temaId, cuerpo: cuerpo, es_propuesta: !!esPropuesta, autor_id: userData.user.id
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function votar(comentarioId) {
    if (!db) return null;
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("foro_votos").insert({ comentario_id: comentarioId, usuario_id: userData.user.id });
    if (error) throw error;
  }

  async function quitarVoto(comentarioId) {
    if (!db) return null;
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("foro_votos").delete().eq("comentario_id", comentarioId).eq("usuario_id", userData.user.id);
    if (error) throw error;
  }

  // El primer comentario "abre" el debate — pasa el tema de "abierto" a
  // "en_debate" automáticamente (ver views/foro.js), para que la lista
  // distinga de un vistazo qué temas todavía no tienen ninguna respuesta.
  async function marcarEnDebate(temaId) {
    if (!db) return null;
    var { error } = await db.from("foro_temas").update({ estado: "en_debate" }).eq("id", temaId);
    if (error) throw error;
  }

  async function cerrarConConclusion(temaId, conclusion, rutaAccion) {
    if (!db) return null;
    var { error } = await db.from("foro_temas").update({
      estado: "con_conclusion", conclusion: conclusion, ruta_accion: rutaAccion
    }).eq("id", temaId);
    if (error) throw error;
  }

  // (2026-07-27) Editar/eliminar un tema — espejo de foro_temas_update/delete.
  // Solo título y problema son editables aquí; el estado/conclusión se maneja
  // aparte con marcarEnDebate()/cerrarConConclusion().
  async function actualizarTema(temaId, payload) {
    if (!db) return null;
    var { error } = await db.from("foro_temas").update({
      titulo: payload.titulo, problema: payload.problema
    }).eq("id", temaId);
    if (error) throw error;
  }

  async function eliminarTema(temaId) {
    if (!db) return null;
    var { error } = await db.from("foro_temas").delete().eq("id", temaId);
    if (error) throw error;
  }

  // Editar/eliminar un comentario propio — espejo de foro_comentarios_update
  // (nueva)/foro_comentarios_delete (autor del comentario o Dirección).
  async function editarComentario(comentarioId, nuevoCuerpo) {
    if (!db) return null;
    var { error } = await db.from("foro_comentarios").update({ cuerpo: nuevoCuerpo }).eq("id", comentarioId);
    if (error) throw error;
  }

  async function eliminarComentario(comentarioId) {
    if (!db) return null;
    var { error } = await db.from("foro_comentarios").delete().eq("id", comentarioId);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.foro = {
    ESTADOS_LABEL: ESTADOS_LABEL,
    listarTemas: listarTemas,
    obtenerTema: obtenerTema,
    listarComentarios: listarComentarios,
    crearTema: crearTema,
    comentar: comentar,
    votar: votar,
    quitarVoto: quitarVoto,
    marcarEnDebate: marcarEnDebate,
    cerrarConConclusion: cerrarConConclusion,
    actualizarTema: actualizarTema,
    eliminarTema: eliminarTema,
    editarComentario: editarComentario,
    eliminarComentario: eliminarComentario
  };
})(window);
