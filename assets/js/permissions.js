/* =====================================================================
 * permissions.js — Espejo EN EL CLIENTE de las políticas RLS reales
 * (assets/sql/rls-policies.sql). Sirve solo para UX (mostrar/ocultar
 * botones y secciones); la seguridad de verdad la impone Postgres con
 * RLS, así que aunque alguien manipule el JS del navegador, Supabase
 * seguirá rechazando lo que no le corresponde.
 *
 * `persona` es el objeto de sesión actual con esta forma:
 *   { id, nombre, rol: 'direccion'|'lider'|'coordinador'|'miembro'|'colaborador',
 *     comisionId, subgrupoId }
 * ===================================================================== */
(function (global) {
  "use strict";

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
      return persona.comisionId === comisionIdDelSubgrupo;
    }
    return false; // colaborador: sin acceso a comandos operativos
  }

  function canManageComision(persona, comisionId) {
    return persona.rol === "direccion" || (persona.rol === "lider" && persona.comisionId === comisionId);
  }

  function canManageSubgrupo(persona, comisionId, subgrupoId) {
    return canManageComision(persona, comisionId) || (persona.rol === "coordinador" && persona.subgrupoId === subgrupoId);
  }

  // Modificar el ESTADO de una tarea puntual.
  function canEditTask(persona, tarea, comisionId, subgrupoId) {
    if (persona.rol === "direccion") return true;
    if (persona.rol === "lider") return persona.comisionId === comisionId;
    if (persona.rol === "coordinador") return persona.subgrupoId === subgrupoId;
    // Una tarea puede tener VARIAS personas asignadas (tarea.asignados =
    // [{id,nombre}]); un Miembro puede editar el estado si aparece en esa
    // lista. Se compara por id (modo real) y por nombre como respaldo
    // (datos de ejemplo del modo demo, que no tienen uuid real).
    if (persona.rol === "miembro") {
      if (persona.subgrupoId !== subgrupoId) return false;
      var lista = tarea.asignados || [];
      return lista.some(function (a) { return a.id === persona.id || a.nombre === persona.nombre; });
    }
    return false; // colaborador: solo lectura, y ni siquiera llega aquí (no tiene subgrupoId)
  }

  function canPostComunicado(persona) {
    return persona.rol === "direccion" || persona.rol === "lider";
  }

  function canPostEnlaceOEvento(persona) {
    return persona.rol === "direccion" || persona.rol === "lider" || persona.rol === "coordinador";
  }

  // Foro de Ideas: participar (crear tema, comentar, apoyar) está abierto
  // a cualquier rol, incluido Colaborador — no hay canParticiparForo()
  // porque no hay nada que filtrar. Cerrar con conclusión sí es más
  // controlado: el autor del tema, Dirección, o cualquier Líder (espejo
  // exacto de foro_temas_update en rls-policies.sql).
  function canCerrarTemaForo(persona, tema) {
    return persona.rol === "direccion" || persona.rol === "lider" || (tema && tema.autorId === persona.id);
  }

  global.NG_PERMS = {
    NAV: NAV,
    canAccess: canAccess,
    canAccessSubgrupo: canAccessSubgrupo,
    canManageComision: canManageComision,
    canManageSubgrupo: canManageSubgrupo,
    canEditTask: canEditTask,
    canPostComunicado: canPostComunicado,
    canPostEnlaceOEvento: canPostEnlaceOEvento,
    canCerrarTemaForo: canCerrarTemaForo
  };
})(window);
