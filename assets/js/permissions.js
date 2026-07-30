/* =====================================================================
 * permissions.js — Espejo EN EL CLIENTE de las políticas RLS reales
 * (assets/sql/rls-policies.sql). Sirve solo para UX (mostrar/ocultar
 * botones y secciones); la seguridad de verdad la impone Postgres con
 * RLS, así que aunque alguien manipule el JS del navegador, Supabase
 * seguirá rechazando lo que no le corresponde.
 *
 * `persona` es el objeto de sesión actual con esta forma:
 *   { id, nombre, rol: 'direccion'|'lider'|'coordinador'|'miembro'|'colaborador',
 *     comisionId, subgrupoId, comisionesLideradas: [id...],
 *     membresias: [{ comandoId, comisionId, rol }] }
 *
 * (2026-07-30) Una persona puede pertenecer a VARIOS comandos en VARIAS
 * comisiones a la vez (ej. su comando Macrodistrital de Organización por
 * distrito, MÁS un comando de Eventos por su oficio). `comisionId`/
 * `subgrupoId` son solo el contexto "principal" (primera membresía) para
 * el Inicio/topbar — todas las funciones de abajo validan contra la lista
 * completa (`membresias`/`comisionesLideradas`), nunca contra ese único id.
 * En modo demo (`NG_MOCK`), donde cada persona SÍ tiene un solo comando,
 * los helpers caen de vuelta a comparar contra comisionId/subgrupoId.
 * ===================================================================== */
(function (global) {
  "use strict";

  // ¿Lidera esta comisión puntual? (comisionesLideradas real, o el único
  // comisionId de una persona "lider" en modo demo).
  function lideraComision(persona, comisionId) {
    if (!comisionId) return false;
    if (persona.comisionesLideradas) return persona.comisionesLideradas.indexOf(comisionId) >= 0;
    return persona.rol === "lider" && persona.comisionId === comisionId;
  }

  // ¿Tiene alguna membresía (el rol que sea) en un comando de esta comisión?
  function tieneMembresiaEnComision(persona, comisionId) {
    if (!comisionId) return false;
    if (persona.membresias) return persona.membresias.some(function (m) { return m.comisionId === comisionId; });
    return persona.comisionId === comisionId;
  }

  // La membresía puntual de la persona en ESE comando (o null si no está).
  function membresiaEnComando(persona, comandoId) {
    if (!comandoId) return null;
    if (persona.membresias) return persona.membresias.filter(function (m) { return m.comandoId === comandoId; })[0] || null;
    return persona.subgrupoId === comandoId ? { comandoId: comandoId, comisionId: persona.comisionId, rol: persona.rol } : null;
  }

  // ¿Es coordinador (o secretario, que hereda el permiso) en ALGÚN comando
  // de esta comisión? Se usa para "alcance" de comunicados/enlaces/eventos.
  function esCoordinadorEnComision(persona, comisionId) {
    if (!comisionId) return false;
    if (persona.membresias) return persona.membresias.some(function (m) { return m.comisionId === comisionId && m.rol === "coordinador"; });
    return persona.rol === "coordinador" && persona.comisionId === comisionId;
  }

  // Todas las comisiones donde la persona puede publicar comunicados/enlaces/
  // eventos "de comisión" — la lidera, o coordina algún comando ahí dentro.
  function comisionesConAlcance(persona) {
    var ids = {};
    (persona.comisionesLideradas || (persona.rol === "lider" && persona.comisionId ? [persona.comisionId] : [])).forEach(function (id) { ids[id] = true; });
    (persona.membresias || (persona.rol === "coordinador" && persona.comisionId ? [{ comisionId: persona.comisionId, rol: "coordinador" }] : []))
      .forEach(function (m) { if (m.rol === "coordinador") ids[m.comisionId] = true; });
    return Object.keys(ids);
  }

  var NAV = [
    { route: "dashboard",       label: "Inicio",         roles: ["direccion","lider","coordinador","miembro","colaborador"] },
    { route: "comisiones",      label: "Comisiones",      roles: ["direccion","lider","coordinador","miembro","colaborador"] },
    { route: "tareas",          label: "Tareas",          roles: ["direccion","lider","coordinador","miembro"] },
    { route: "calendario",      label: "Calendario",      roles: ["direccion","lider","coordinador","miembro","colaborador"] },
    { route: "directorio",      label: "Directorio",      roles: ["direccion","lider","coordinador"] },
    { route: "comunicaciones",  label: "Comunicados",     roles: ["direccion","lider","coordinador","miembro","colaborador"] },
    { route: "enlaces",         label: "Enlaces",         roles: ["direccion","lider","coordinador","miembro"] },
    { route: "foro",            label: "Foro de Ideas",   roles: ["direccion","lider","coordinador","miembro","colaborador"] },
    { route: "reportes",        label: "Reportes",        roles: ["direccion"] },
    { route: "usuarios",        label: "Usuarios",        roles: ["direccion"] },
    { route: "configuracion",   label: "Configuración",   roles: ["direccion"] }, // módulo nuevo, solo Dirección
    { route: "perfil",          label: "Mi perfil",       roles: ["direccion","lider","coordinador","miembro","colaborador"] }
  ];

  function canAccess(route, persona) {
    var item = NAV.filter(function (n) { return n.route === route; })[0];
    if (!item) return true; // sub-rutas (comisión/subgrupo) se validan aparte
    return item.roles.indexOf(persona.rol) >= 0;
  }

  // Ver el tablero de un comando: alcanza con pertenecer a la misma comisión
  // (transparencia lateral entre comandos hermanos). Editar sigue siendo
  // más estricto (ver canEditTask).
  function canAccessSubgrupo(persona, comisionIdDelSubgrupo) {
    if (persona.rol === "direccion") return true;
    if (persona.rol === "lider" || persona.rol === "coordinador" || persona.rol === "miembro") {
      return lideraComision(persona, comisionIdDelSubgrupo) || tieneMembresiaEnComision(persona, comisionIdDelSubgrupo);
    }
    return false; // colaborador: sin acceso a comandos operativos
  }

  function canManageComision(persona, comisionId) {
    return persona.rol === "direccion" || lideraComision(persona, comisionId);
  }

  function canManageSubgrupo(persona, comisionId, subgrupoId) {
    if (canManageComision(persona, comisionId)) return true;
    var m = membresiaEnComando(persona, subgrupoId);
    return !!m && m.rol === "coordinador";
  }

  // Modificar el ESTADO de una tarea puntual.
  function canEditTask(persona, tarea, comisionId, subgrupoId) {
    if (persona.rol === "direccion") return true;
    if (lideraComision(persona, comisionId)) return true;
    var m = membresiaEnComando(persona, subgrupoId);
    if (!m) return false; // no pertenece a ESE comando puntual (colaborador, u otro comando distinto)
    if (m.rol === "coordinador") return true;
    // Una tarea puede tener VARIAS personas asignadas (tarea.asignados =
    // [{id,nombre}]); un Miembro puede editar el estado si aparece en esa
    // lista. Se compara por id (modo real) y por nombre como respaldo
    // (datos de ejemplo del modo demo, que no tienen uuid real).
    var lista = tarea.asignados || [];
    return lista.some(function (a) { return a.id === persona.id || a.nombre === persona.nombre; });
  }

  function canPostComunicado(persona) {
    return persona.rol === "direccion" || persona.rol === "lider";
  }

  function canPostEnlaceOEvento(persona) {
    return persona.rol === "direccion" || persona.rol === "lider" || persona.rol === "coordinador";
  }

  // Editar/eliminar un comunicado, enlace o evento YA PUBLICADO — espejo
  // exacto de las políticas *_update/*_delete en rls-policies.sql. Antes
  // no existían ni las políticas ni estos botones: una vez publicado, un
  // comunicado/enlace/evento no se podía corregir ni borrar nunca.
  function canManageComunicado(persona, item) {
    if (persona.rol === "direccion") return true;
    return !!item.comisionId && lideraComision(persona, item.comisionId);
  }
  function canManageEnlaceOEvento(persona, item) {
    if (persona.rol === "direccion") return true;
    if (!item.comisionId) return false;
    return lideraComision(persona, item.comisionId) || esCoordinadorEnComision(persona, item.comisionId);
  }

  // Foro de Ideas: participar (crear tema, comentar, apoyar) está abierto
  // a cualquier rol, incluido Colaborador — no hay canParticiparForo()
  // porque no hay nada que filtrar. Cerrar con conclusión sí es más
  // controlado: el autor del tema, Dirección, o cualquier Líder (espejo
  // exacto de foro_temas_update en rls-policies.sql).
  function canCerrarTemaForo(persona, tema) {
    return persona.rol === "direccion" || persona.rol === "lider" || (tema && tema.autorId === persona.id);
  }

  // Editar el título/problema de un tema — espejo exacto de foro_temas_update
  // (mismo criterio que cerrar con conclusión: autor, Dirección o cualquier
  // Líder). Eliminar un tema es más estricto (foro_temas_delete): solo el
  // autor o Dirección, sin el "cualquier Líder".
  function canEditarTemaForo(persona, tema) {
    return canCerrarTemaForo(persona, tema);
  }
  function canEliminarTemaForo(persona, tema) {
    return persona.rol === "direccion" || (tema && tema.autorId === persona.id);
  }

  // Editar/eliminar un comentario del foro — espejo de foro_comentarios_update
  // (nueva) / foro_comentarios_delete: solo el autor del comentario o Dirección.
  function canManageComentarioForo(persona, comentario) {
    return persona.rol === "direccion" || (comentario && comentario.autorId === persona.id);
  }

  // Ids de TODAS las comisiones a las que la persona tiene algún acceso
  // (la lidera, o tiene una membresía de cualquier rol en un comando suyo).
  // Úsalo para filtrar listas (Tareas, Calendario, Comunicados) en vez de
  // comparar contra el único persona.comisionId "principal".
  function misComisionIds(persona) {
    if (persona.rol === "direccion") return null; // null = sin filtro, ve todo
    var ids = {};
    (persona.comisionesLideradas || (persona.comisionId ? [persona.comisionId] : [])).forEach(function (id) { ids[id] = true; });
    (persona.membresias || (persona.comisionId ? [{ comisionId: persona.comisionId }] : [])).forEach(function (m) { if (m.comisionId) ids[m.comisionId] = true; });
    return Object.keys(ids);
  }

  // Ids de TODOS los comandos donde la persona tiene membresía (cualquier
  // rol). Úsalo para filtrar tareas por "mis comandos" en vez de comparar
  // contra el único persona.subgrupoId "principal".
  function misComandoIds(persona) {
    if (persona.membresias) return persona.membresias.map(function (m) { return m.comandoId; });
    return persona.subgrupoId ? [persona.subgrupoId] : [];
  }

  global.NG_PERMS = {
    NAV: NAV,
    canAccess: canAccess,
    canAccessSubgrupo: canAccessSubgrupo,
    misComisionIds: misComisionIds,
    misComandoIds: misComandoIds,
    comisionesConAlcance: comisionesConAlcance,
    canManageComision: canManageComision,
    canManageSubgrupo: canManageSubgrupo,
    canEditTask: canEditTask,
    canPostComunicado: canPostComunicado,
    canPostEnlaceOEvento: canPostEnlaceOEvento,
    canManageComunicado: canManageComunicado,
    canManageEnlaceOEvento: canManageEnlaceOEvento,
    canCerrarTemaForo: canCerrarTemaForo,
    canEditarTemaForo: canEditarTemaForo,
    canEliminarTemaForo: canEliminarTemaForo,
    canManageComentarioForo: canManageComentarioForo
  };
})(window);
