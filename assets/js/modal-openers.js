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

  // (2026-07-30) Antes solo ofrecía persona.comisionId (una sola comisión) —
  // una persona puede liderar y/o coordinar comandos en varias comisiones a
  // la vez, así que se listan TODAS donde tiene alcance para publicar (ver
  // NG_PERMS.comisionesConAlcance, espejo de a quién dejan las políticas
  // *_insert de comunicados/enlaces/eventos).
  function scopeSelectOptions(persona, comisiones) {
    var opts = [];
    if (persona.rol === "direccion") {
      opts.push({ value: "", label: "General (toda la organización)" });
      comisiones.forEach(function (c) { opts.push({ value: c.id, label: c.nombre }); });
    } else {
      var ids = global.NG_PERMS.comisionesConAlcance(persona);
      comisiones.filter(function (c) { return ids.indexOf(c.id) >= 0; }).forEach(function (c) { opts.push({ value: c.id, label: c.nombre }); });
    }
    return opts;
  }

  var ESTADO_OPTIONS = [
    { value: "pendiente", label: "Pendiente" },
    { value: "en_curso", label: "En curso" },
    { value: "hecho", label: "Hecho" }
  ];

  // (2026-07-27) Editar los datos de una comisión ya existente — antes
  // solo se podía crear/leer, nunca corregir el nombre, la misión o el
  // color desde la interfaz (la única forma era SQL manual).
  global.NG_openEditarComisionModal = function (c) {
    global.NG_MODAL.openForm({
      title: "Editar comisión",
      entityLabel: "Comisión",
      fields: [
        { name: "nombre", label: "Nombre de la comisión", type: "text", required: true, value: c.nombre },
        { name: "mision", label: "Misión", type: "textarea", value: c.mision || "" },
        { name: "color", label: "Color (hex)", type: "text", required: true, value: c.color, placeholder: "#4C5FD5" }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.actualizarComision(c.id, v); }
    });
  };

  global.NG_openNuevoComandoModal = function (c) {
    global.NG_MODAL.openForm({
      title: "Crear comando operativo",
      subtitle: "Comisión: " + c.nombre,
      entityLabel: "Comando operativo",
      fields: [
        { name: "nombre", label: "Nombre del comando operativo", type: "text", required: true, placeholder: "Ej. Comando Regional — Arequipa" },
        { name: "coordinador", label: "Coordinador/a", type: "text", required: true, placeholder: "Nombre del coordinador o coordinadora" },
        { name: "secretario1", label: "Secretario/a de apoyo 1 (opcional)", type: "text" },
        { name: "secretario2", label: "Secretario/a de apoyo 2 (opcional)", type: "text" },
        { name: "enlaceUrl", label: "Enlace del grupo (WhatsApp u otro, opcional)", type: "url", placeholder: "https://chat.whatsapp.com/..." }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.crearComando(c.id, v); }
    });
  };

  // (2026-07-27) Editar un comando ya existente — antes "+ Crear comando
  // operativo" era la única puerta de entrada, no había forma de corregir
  // el nombre, la región o el enlace del grupo después de creado.
  global.NG_openEditarComandoModal = function (s, c) {
    global.NG_MODAL.openForm({
      title: "Editar comando operativo",
      subtitle: c.nombre,
      entityLabel: "Comando operativo",
      fields: [
        { name: "nombre", label: "Nombre del comando operativo", type: "text", required: true, value: s.nombre },
        { name: "region", label: "Región (opcional, uso interno de Organización)", type: "text", value: s.region || "" },
        { name: "enlaceUrl", label: "Enlace del grupo (WhatsApp u otro, opcional)", type: "url", value: s.enlaceUrl || "", placeholder: "https://chat.whatsapp.com/..." }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.actualizarComando(s.id, v); }
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

  // (2026-07-26) Antes este modal no guardaba nada de verdad (no tenía
  // onSave: "comando" era texto libre sin forma de resolver un comando_id
  // real, así que SIEMPRE mostraba el toast de "falta implementar la base
  // de datos", sin importar si Supabase estaba conectado o no). Se
  // resuelve con el mismo truco que "+ Nueva tarea" dentro de un comando:
  // en vez de un selector dependiente (comisión → comando, que el motor
  // de modales actual no soporta re-renderizar), se arma UN SOLO select
  // de "comando" con todos los comandos de las comisiones visibles para
  // esta persona, ya con la comisión en la etiqueta para que no haya
  // ambigüedad (ej. "Eventos — Reunión 6 de Agosto").
  global.NG_openNuevaTareaModalGlobal = function (persona, comisionesVisibles) {
    var opcionesComando = [];
    (comisionesVisibles || []).forEach(function (c) {
      (c.subgrupos || []).forEach(function (s) {
        opcionesComando.push({ value: s.id, label: c.nombre + " — " + s.nombre, comisionId: c.id });
      });
    });

    var vistos = {}; var opcionesAsignado = [];
    (comisionesVisibles || []).forEach(function (c) {
      (c.subgrupos || []).forEach(function (s) {
        (s.miembrosConId || []).forEach(function (m) {
          if (!vistos[m.id]) { vistos[m.id] = true; opcionesAsignado.push(m); }
        });
      });
    });
    opcionesAsignado.sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });

    global.NG_MODAL.openForm({
      title: "Nueva tarea",
      entityLabel: "Tarea",
      fields: [
        { name: "titulo", label: "Título de la tarea", type: "text", required: true, placeholder: "Ej. Contactar interesados pendientes" },
        { name: "descripcion", label: "Descripción (opcional)", type: "textarea", placeholder: "Detalles adicionales de la tarea…" },
        {
          name: "comando", label: "Comando operativo", type: "select", required: true,
          options: opcionesComando,
          hint: opcionesComando.length ? "" : "Todavía no hay comandos operativos en tu comisión."
        },
        {
          name: "asignados", label: "Asignado a (puedes elegir varias personas)", type: "userpicker", required: false,
          options: opcionesAsignado.map(function (m) { return { value: m.id, label: m.nombre }; }),
          placeholder: "Escribe un nombre para filtrar…",
          hint: opcionesAsignado.length
            ? "Escribe para filtrar por nombre completo. Marca una o más personas."
            : 'Todavía nadie se unió a ningún comando de estas comisiones.'
        },
        { name: "fecha", label: "Fecha límite", type: "date", required: true, value: isoDate(TODAY()) },
        { name: "estado", label: "Estado inicial", type: "select", options: ESTADO_OPTIONS, value: "pendiente" }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.crearTarea(v.comando, v); }
    });
  };

  // (2026-07-27) Editar una tarea existente: título, descripción, fecha,
  // estado y asignados — antes solo se podía cambiar el estado desde el
  // tablero kanban. "c" es la comisión dueña de la tarea (se necesita para
  // recalcular la lista de miembros elegibles como asignados, igual que en
  // "+ Nueva tarea"). El campo "comando" no se puede editar aquí a
  // propósito: mover una tarea de comando es una operación distinta
  // (reasignar dueño) que no pidieron y merece su propia revisión.
  global.NG_openEditarTareaModal = function (t, c) {
    var opciones = miembrosDeLaComision(c).map(function (m) { return { value: m.id, label: m.nombre }; });
    var idsActuales = (t.asignados || []).map(function (a) { return a.id; });
    var asignadosField = {
      name: "asignados", label: "Asignado a (puedes elegir varias personas)", type: "userpicker", required: false,
      options: opciones, value: idsActuales,
      placeholder: "Escribe un nombre para filtrar…",
      hint: opciones.length
        ? "Escribe para filtrar por nombre completo. Marca una o más personas."
        : 'Todavía nadie se unió a ningún comando de esta comisión.'
    };
    global.NG_MODAL.openForm({
      title: "Editar tarea",
      subtitle: c.nombre,
      entityLabel: "Tarea",
      fields: [
        { name: "titulo", label: "Título de la tarea", type: "text", required: true, value: t.titulo },
        { name: "descripcion", label: "Descripción (opcional)", type: "textarea", value: t.descripcion || "" },
        asignadosField,
        { name: "fecha", label: "Fecha límite", type: "date", required: true, value: t.fecha },
        { name: "estado", label: "Estado", type: "select", options: ESTADO_OPTIONS, value: t.estado }
      ],
      onSave: function (v) { return global.NG_DATA.comisiones.actualizarTarea(t.id, v); }
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

  // (2026-07-27) Editar un evento/comunicado/enlace ya publicado. Reusa
  // exactamente los mismos campos que "Nuevo X", solo que pre-llenados y
  // con onSave apuntando a actualizar() en vez de crear(). "item.comisionId"
  // ya viene resuelto por el mapeo de cada data/*.js, así que scopeSelectOptions
  // funciona igual que en el modal de creación.
  global.NG_openEditarEventoModal = function (item, persona, comisiones) {
    global.NG_MODAL.openForm({
      title: "Editar evento",
      entityLabel: "Evento",
      fields: [
        { name: "titulo", label: "Título del evento", type: "text", required: true, value: item.titulo },
        { name: "fecha", label: "Fecha", type: "date", required: true, value: item.fecha },
        { name: "alcance", label: "Alcance", type: "select", options: scopeSelectOptions(persona, comisiones), value: item.comisionId || "" }
      ],
      onSave: function (v) { return global.NG_DATA.eventos.actualizar(item.id, v); }
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

  global.NG_openEditarComunicadoModal = function (item, persona, comisiones) {
    global.NG_MODAL.openForm({
      title: "Editar comunicado",
      entityLabel: "Comunicado",
      fields: [
        { name: "titulo", label: "Título", type: "text", required: true, value: item.titulo },
        { name: "cuerpo", label: "Mensaje", type: "textarea", required: true, value: item.cuerpo },
        { name: "alcance", label: "Alcance", type: "select", options: scopeSelectOptions(persona, comisiones), value: item.comisionId || "" }
      ],
      onSave: function (v) { return global.NG_DATA.comunicados.actualizar(item.id, v); }
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

  global.NG_openEditarEnlaceModal = function (item, persona, comisiones) {
    global.NG_MODAL.openForm({
      title: "Editar enlace",
      entityLabel: "Enlace",
      fields: [
        { name: "nombre", label: "Nombre del recurso", type: "text", required: true, value: item.nombre },
        { name: "url", label: "URL", type: "url", required: true, value: item.url },
        { name: "descripcion", label: "Descripción / indicaciones", type: "textarea", value: item.descripcion || "" },
        { name: "alcance", label: "Comisión", type: "select", options: scopeSelectOptions(persona, comisiones), value: item.comisionId || "" }
      ],
      onSave: function (v) { return global.NG_DATA.enlaces.actualizar(item.id, v); }
    });
  };

  // Foro de Ideas — abierto a cualquier persona autenticada, sin filtrar
  // por rol (ver rls-policies.sql: foro_temas_insert solo exige estar
  // logueado). "comisionId" es opcional: sirve para relacionar el tema
  // con una comisión afín, no para restringir quién puede verlo o entrar.
  global.NG_openNuevoTemaForoModal = function (persona, comisiones) {
    var opcionesComision = [{ value: "", label: "Ninguna — tema general" }].concat(
      (comisiones || []).map(function (c) { return { value: c.id, label: c.nombre }; })
    );
    global.NG_MODAL.openForm({
      title: "Nuevo tema en el Foro",
      subtitle: "Plantea un problema concreto de la sociedad para buscarle una solución entre todos.",
      entityLabel: "Tema",
      fields: [
        { name: "titulo", label: "Título del tema", type: "text", required: true, placeholder: "Ej. Poca participación juvenil en cabildos abiertos" },
        {
          name: "problema", label: "¿Cuál es el problema específico?", type: "textarea", required: true,
          placeholder: "Describe el problema concreto — el hecho, sin etiqueta ideológica. Ej. \"Solo el 12% de los cabildos de este año tuvo asistentes menores de 30 años.\""
        },
        { name: "comisionId", label: "¿Se relaciona con alguna comisión? (opcional)", type: "select", options: opcionesComision }
      ],
      onSave: function (v) { return global.NG_DATA.foro.crearTema(v); }
    });
  };

  // (2026-07-27) Editar título/problema de un tema ya publicado — el estado
  // (abierto/en_debate/con_conclusion) no se toca aquí, eso sigue siendo
  // "Cerrar con conclusión". Quién puede editar se decide en views/foro.js
  // con NG_PERMS.canEditarTemaForo (espejo de foro_temas_update).
  global.NG_openEditarTemaForoModal = function (tema) {
    global.NG_MODAL.openForm({
      title: "Editar tema",
      entityLabel: "Tema",
      fields: [
        { name: "titulo", label: "Título del tema", type: "text", required: true, value: tema.titulo },
        { name: "problema", label: "¿Cuál es el problema específico?", type: "textarea", required: true, value: tema.problema }
      ],
      onSave: function (v) { return global.NG_DATA.foro.actualizarTema(tema.id, v); }
    });
  };

  // Cerrar un tema con conclusión + ruta de acción — quién puede hacerlo
  // se decide server-side (foro_temas_update: autor del tema, Dirección o
  // cualquier Líder), este modal no filtra nada, solo se ofrece cuando
  // views/foro.js ya calculó que la persona puede.
  // (2026-07-27) Ya no necesita un callback "onDone" para refrescar la
  // vista: ui/modal.js re-dispara la ruta actual automáticamente después
  // de cualquier onSave exitoso.
  global.NG_openCerrarTemaForoModal = function (tema) {
    global.NG_MODAL.openForm({
      title: "Cerrar con conclusión",
      subtitle: tema.titulo,
      entityLabel: "Conclusión",
      fields: [
        { name: "conclusion", label: "¿A qué conclusión llegó el debate?", type: "textarea", required: true, placeholder: "Resume el acuerdo al que llegó la mayoría…" },
        { name: "rutaAccion", label: "Ruta de acción (qué se va a hacer, quién y cuándo)", type: "textarea", required: true, placeholder: "Pasos concretos para resolver el problema…" }
      ],
      onSave: function (v) { return global.NG_DATA.foro.cerrarConConclusion(tema.id, v.conclusion, v.rutaAccion); }
    });
  };
})(window);
