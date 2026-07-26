/* =====================================================================
 * modal-openers.js — Configuración de los 5 formularios de creación
 * ("+ Nueva tarea", "+ Nuevo enlace", "+ Nuevo evento", "+ Nuevo
 * comunicado", "+ Crear comando operativo"). Cada uno arma los campos
 * y delega el guardado real a assets/js/data/*.js a través de
 * NG_MODAL.openForm({..., onSave}). Si NG_DB no existe (modo demo), el
 * modal ya muestra el toast informativo automáticamente (ver ui/modal.js).
 * ===================================================================== */
(function (global) {
  "use strict";
  var isoDate = global.NG_UTILS.isoDate;
  var TODAY = function () { return global.NG_STATE.today; };

  function scopeSelectOptions(persona, comisiones) {
    var opts = [];
    if (persona.rol === "direccion") {
      opts.push({ value: "", label: "General (toda la organización)" });
      comisiones.forEach(function (c) { opts.push({ value: c.id, label: c.nombre }); });
    } else {
      var c = comisiones.filter(function (x) { return x.id === persona.comisionId; })[0];
      if (c) opts.push({ value: c.id, label: c.nombre });
    }
    return opts;
  }

  var ESTADO_OPTIONS = [
    { value: "pendiente", label: "Pendiente" },
    { value: "en_curso", label: "En curso" },
    { value: "hecho", label: "Hecho" }
  ];

  global.NG_openNuevoComandoModal = function (c) {
    global.NG_MODAL.openForm({
      title: "Crear comando operativo",
      subtitle: "Comisión: " + c.nombre,
      entityLabel: "Comando operativo",
      fields: [
        { name: "nombre", label: "Nombre del comando operativo", type: "text", required: true, placeholder: "Ej. Comando Regional — Arequipa" },
        { name: "coordinador", label: "Coordinador/a", type: "text", required: true, placeholder: "Nombre del coordinador o coordinadora" },
        { name: "secretario1", label: "Secretario/a de apoyo 1 (opcional)", type: "text" },
        { name: "secretario2", label: "Secretario/a de apoyo 2 (opcional)", type: "text" }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.crearComando(c.id, v); }
    });
  };

  // Junta a todos los miembros de TODOS los comandos de la comisión (no
  // solo los del comando donde se crea la tarea) — así una tarea se puede
  // repartir entre gente de comandos hermanos dentro de la misma comisión,
  // que es el criterio que se pidió para la lista de "usuarios disponibles".
  // Se arma en el cliente reusando el árbol que ya trajo comisiones.listar()
  // (sin pedirle nada nuevo a Supabase) y se deduplica por id.
  function miembrosDeLaComision(c) {
    var vistos = {}; var out = [];
    (c.subgrupos || []).forEach(function (sg) {
      var opciones = sg.miembrosConId || (sg.miembros || []).map(function (m) { return { id: m, nombre: m }; });
      opciones.forEach(function (m) {
        if (!vistos[m.id]) { vistos[m.id] = true; out.push(m); }
      });
    });
    out.sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    return out;
  }

  global.NG_openNuevaTareaModalSubgrupo = function (s, c) {
    // "Asignado a" ahora es multi-select buscable (userpicker): manda
    // usuario_id reales (uuid), nunca texto libre — mandar el nombre ahí
    // rompía el insert con 400 "invalid input syntax for type uuid". La
    // lista incluye a cualquier miembro de la comisión (no solo de este
    // comando), y se puede dejar vacía (tarea sin asignar todavía).
    var opciones = miembrosDeLaComision(c).map(function (m) { return { value: m.id, label: m.nombre }; });
    var asignadosField = {
      name: "asignados", label: "Asignado a (puedes elegir varias personas)", type: "userpicker", required: false,
      options: opciones,
      placeholder: "Escribe un nombre para filtrar…",
      hint: opciones.length
        ? "Escribe para filtrar por nombre completo. Marca una o más personas."
        : 'Todavía nadie se unió a ningún comando de esta comisión. Cuando alguien use "Unirme a este comando", va a aparecer aquí.'
    };
    global.NG_MODAL.openForm({
      title: "Nueva tarea",
      subtitle: s.nombre + " · " + c.nombre,
      entityLabel: "Tarea",
      fields: [
        { name: "titulo", label: "Título de la tarea", type: "text", required: true, placeholder: "Ej. Armar agenda del día" },
        { name: "descripcion", label: "Descripción (opcional)", type: "textarea", placeholder: "Detalles adicionales de la tarea…" },
        asignadosField,
        { name: "fecha", label: "Fecha límite", type: "date", required: true, value: isoDate(TODAY()) },
        { name: "estado", label: "Estado inicial", type: "select", options: ESTADO_OPTIONS, value: "pendiente" }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.crearTarea(s.id, v); }
    });
  };

  global.NG_openNuevaTareaModalGlobal = function (persona, comisionesVisibles) {
    global.NG_MODAL.openForm({
      title: "Nueva tarea",
      entityLabel: "Tarea",
      fields: [
        { name: "titulo", label: "Título de la tarea", type: "text", required: true, placeholder: "Ej. Contactar interesados pendientes" },
        { name: "comision", label: "Comisión", type: "select", required: true, options: comisionesVisibles.map(function (c) { return { value: c.id, label: c.nombre }; }) },
        { name: "comando", label: "Comando operativo", type: "text", required: true, placeholder: "Nombre exacto del comando dentro de la comisión", hint: "En la versión final este campo será un selector dependiente de la comisión elegida." },
        { name: "asignadoId", label: "Asignado a", type: "text", required: true, placeholder: "Nombre de la persona" },
        { name: "fecha", label: "Fecha límite", type: "date", required: true, value: isoDate(TODAY()) },
        { name: "estado", label: "Estado inicial", type: "select", options: ESTADO_OPTIONS, value: "pendiente" }
      ]
      // Sin onSave: requiere resolver primero el comando_id real a partir del nombre
      // escrito (ver hint del campo) — se habilita cuando el selector dependiente esté listo.
    });
  };

  global.NG_openNuevoEventoModal = function (persona, comisiones) {
    global.NG_MODAL.openForm({
      title: "Nuevo evento",
      entityLabel: "Evento",
      fields: [
        { name: "titulo", label: "Título del evento", type: "text", required: true, placeholder: "Ej. Reunión de coordinación" },
        { name: "fecha", label: "Fecha", type: "date", required: true, value: isoDate(TODAY()) },
        { name: "alcance", label: "Alcance", type: "select", options: scopeSelectOptions(persona, comisiones) }
      ],
      onSave: function (v) { return global.NG_DATA.eventos.crear(v); }
    });
  };

  global.NG_openNuevoComunicadoModal = function (persona, comisiones) {
    global.NG_MODAL.openForm({
      title: "Nuevo comunicado",
      entityLabel: "Comunicado",
      fields: [
        { name: "titulo", label: "Título", type: "text", required: true, placeholder: "Ej. Se abre inscripción al comando de..." },
        { name: "cuerpo", label: "Mensaje", type: "textarea", required: true, placeholder: "Escribe el contenido del comunicado…" },
        { name: "alcance", label: "Alcance", type: "select", options: scopeSelectOptions(persona, comisiones) }
      ],
      onSave: function (v) { return global.NG_DATA.comunicados.crear(v); }
    });
  };

  global.NG_openNuevoEnlaceModal = function (persona, comisiones) {
    global.NG_MODAL.openForm({
      title: "Nuevo enlace",
      entityLabel: "Enlace",
      fields: [
        { name: "nombre", label: "Nombre del recurso", type: "text", required: true, placeholder: "Ej. Formulario de inscripción" },
        { name: "url", label: "URL", type: "url", required: true, placeholder: "https://…" },
        { name: "descripcion", label: "Descripción / indicaciones", type: "textarea", placeholder: "¿Para qué sirve este enlace y cómo debe usarse?" },
        { name: "alcance", label: "Comisión", type: "select", options: scopeSelectOptions(persona, comisiones) }
      ],
      onSave: function (v) { return global.NG_DATA.enlaces.crear(v); }
    });
  };
})(window);
