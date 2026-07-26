/* =====================================================================
 * data/mock-data.js — Dataset de ejemplo usado SOLO en modo demo
 * (cuando config.js sigue con placeholders, ver NG_CONFIG.IS_SUPABASE_
 * CONFIGURED). El resto de data/*.js lee y escribe sobre estos mismos
 * arrays en memoria para que la demo se sienta completa sin backend.
 * En cuanto conectes Supabase real, este archivo deja de usarse.
 * ===================================================================== */
(function (global) {
  "use strict";
  var U = global.NG_UTILS;

  var REGIONES = [
    "Amazonas","Áncash","Apurímac","Arequipa","Ayacucho","Cajamarca","Callao","Cusco",
    "Huancavelica","Huánuco","Ica","Junín","La Libertad","Lambayeque","Lima Metropolitana",
    "Lima Provincias","Loreto","Madre de Dios","Moquegua","Pasco","PEX","Piura","Puno",
    "San Martín","Tacna","Tumbes","Ucayali"
  ];

  function buildComandosRegionales() {
    return REGIONES.map(function (region, i) {
      return {
        id: "org-" + U.slugify(region),
        nombre: "Chat Regional — " + region,
        region: region,
        coordinador: "Coordinador/a temporal (por ratificar)",
        miembros: [],
        tareas: [
          { id: 2000 + i * 10 + 1, titulo: "Reunión virtual de presentación y elección de 3 coordinadores", estado: (i % 6 === 0 ? "hecho" : (i % 3 === 0 ? "en_curso" : "pendiente")), asignado: "Comité regional", fecha: "2026-07-23" },
          { id: 2000 + i * 10 + 2, titulo: "Contactar integrantes faltantes de la región (máx. 10 contactos por persona)", estado: (i % 5 === 0 ? "en_curso" : "pendiente"), asignado: "Comité regional", fecha: "2026-07-26" },
          { id: 2000 + i * 10 + 3, titulo: "Levantamiento de información — 3 preguntas a 5 personas c/u", estado: "pendiente", asignado: "Comité regional", fecha: "2026-07-26" }
        ]
      };
    });
  }

  var COMISIONES = [
    { id: "comunidad", nombre: "Comunidad", color: "var(--c-comunidad)", lider: "Natalia Rodriguez",
      mision: "Terminar de contactar a las personas que escribieron para sumarse y fortalecer la comunidad.",
      subgrupos: [
        { id: "com-contacto", nombre: "Contacto y Bienvenida", coordinador: "Ana Salazar",
          miembros: ["Ana Salazar", "Bruno Vega", "Carla Ríos"],
          tareas: [
            { id: 101, titulo: "Responder mensajes pendientes de Instagram", estado: "en_curso", asignado: "Bruno Vega", fecha: "2026-07-22" },
            { id: 102, titulo: "Armar base de datos de interesados", estado: "pendiente", asignado: "Carla Ríos", fecha: "2026-07-25" },
            { id: 103, titulo: "Enviar mensaje de bienvenida a nuevos contactos", estado: "hecho", asignado: "Ana Salazar", fecha: "2026-07-18" },
            { id: 104, titulo: "Llamar a interesados sin respuesta (tanda 1)", estado: "pendiente", asignado: "Bruno Vega", fecha: "2026-07-27" }
          ] },
        { id: "com-actividades", nombre: "Actividades Comunitarias", coordinador: "Diego Farfán",
          miembros: ["Diego Farfán", "Rosa Injante"],
          tareas: [
            { id: 105, titulo: "Planificar primer encuentro barrial", estado: "pendiente", asignado: "Diego Farfán", fecha: "2026-08-02" },
            { id: 106, titulo: "Mapear zonas con mayor interés", estado: "en_curso", asignado: "Rosa Injante", fecha: "2026-07-24" }
          ] }
      ] },
    { id: "organizacion", nombre: "Organización", color: "var(--c-organizacion)", lider: "Jorge Calmet",
      mision: "Generar la estructura inicial territorial y política: un chat y comando operativo por región, cada uno con un coordinador temporal hasta su ratificación en la reunión de presentación.",
      subgrupos: buildComandosRegionales() },
    { id: "eventos", nombre: "Eventos", color: "var(--c-eventos)", lider: "Lizzi Cotrina",
      mision: "Gestionar y organizar la reunión general del 6 de agosto.",
      subgrupos: [
        { id: "ev-reunion-agosto", nombre: "Reunión 6 de Agosto", coordinador: "Paola Yactayo",
          miembros: ["Paola Yactayo", "Marco Dueñas", "Fiorella Ninanya"],
          tareas: [
            { id: 301, titulo: "Reservar local para la reunión", estado: "hecho", asignado: "Marco Dueñas", fecha: "2026-07-19" },
            { id: 302, titulo: "Armar agenda del día", estado: "en_curso", asignado: "Paola Yactayo", fecha: "2026-07-26" },
            { id: 303, titulo: "Difundir invitación a la comunidad", estado: "pendiente", asignado: "Fiorella Ninanya", fecha: "2026-07-30" },
            { id: 304, titulo: "Coordinar logística (sonido, sillas, registro)", estado: "pendiente", asignado: "Marco Dueñas", fecha: "2026-08-03" }
          ] }
      ] },
    { id: "formacion", nombre: "Formación", color: "var(--c-formacion)", lider: "Diego Pomareda",
      mision: "Identificar perfiles y expertos para las primeras clases virtuales de formación.",
      subgrupos: [
        { id: "for-capacitacion", nombre: "Capacitación Virtual", coordinador: "Ximena Roca",
          miembros: ["Ximena Roca", "Luis Bardales"],
          tareas: [
            { id: 401, titulo: "Listar posibles temas de la primera clase", estado: "hecho", asignado: "Ximena Roca", fecha: "2026-07-16" },
            { id: 402, titulo: "Contactar a expertos propuestos", estado: "en_curso", asignado: "Luis Bardales", fecha: "2026-07-28" },
            { id: 403, titulo: "Definir plataforma para las clases", estado: "pendiente", asignado: "Ximena Roca", fecha: "2026-08-04" }
          ] }
      ] },
    { id: "comunicaciones", nombre: "Comunicaciones", color: "var(--c-comunicaciones)", lider: "Nicolás Talavera",
      mision: "Trabajar en redes sociales y mantener presencia activa en el espacio público, en coordinación con las demás comisiones.",
      subgrupos: [
        { id: "com-contenido", nombre: "Contenido y Redes", coordinador: "Valeria Ugarte",
          miembros: ["Valeria Ugarte", "Sebastián Roque"],
          tareas: [
            { id: 501, titulo: "Calendario de contenido — última semana de julio", estado: "en_curso", asignado: "Valeria Ugarte", fecha: "2026-07-24" },
            { id: 502, titulo: "Piezas gráficas para la reunión del 6 de agosto", estado: "pendiente", asignado: "Sebastián Roque", fecha: "2026-07-31" },
            { id: 503, titulo: "Cobertura del primer encuentro barrial", estado: "pendiente", asignado: "Valeria Ugarte", fecha: "2026-08-02" }
          ] }
      ] }
  ];

  var EVENTOS = [
    { id: 1, titulo: "Reunión general — Nueva Generación", fecha: "2026-08-06", alcance: "general", comisionId: null },
    { id: 2, titulo: "Reunión de coordinación: Contacto y Bienvenida", fecha: "2026-07-22", alcance: "comision", comisionId: "comunidad" },
    { id: 3, titulo: "Primer encuentro barrial", fecha: "2026-08-02", alcance: "comision", comisionId: "comunidad" },
    { id: 4, titulo: "Reunión virtual de presentación por región (máx. jueves)", fecha: "2026-07-23", alcance: "comision", comisionId: "organizacion" },
    { id: 5, titulo: "Visita logística al local", fecha: "2026-07-28", alcance: "comision", comisionId: "eventos" },
    { id: 6, titulo: "Primera clase virtual de formación", fecha: "2026-08-10", alcance: "general", comisionId: "formacion" },
    { id: 7, titulo: "Publicación calendario de contenido", fecha: "2026-07-24", alcance: "comision", comisionId: "comunicaciones" },
    { id: 8, titulo: "Entrevistas a expertos propuestos", fecha: "2026-07-29", alcance: "comision", comisionId: "formacion" },
    { id: 9, titulo: "Cierre del levantamiento de información por región", fecha: "2026-07-26", alcance: "comision", comisionId: "organizacion" }
  ];

  var COMUNICADOS = [
    { id: 1, titulo: "Formación de los primeros equipos de trabajo", autor: "Equipo Directivo", fecha: "2026-07-19", alcance: "general", comisionId: null,
      cuerpo: "Anunciamos la formación de 5 comisiones de trabajo, cada una liderada por un miembro del equipo directivo. Quienes deseen sumarse a algún comando operativo pueden inscribirse a través del sistema." },
    { id: 2, titulo: "Se abre inscripción al comando de Contacto y Bienvenida", autor: "Natalia Rodriguez", fecha: "2026-07-19", alcance: "comision", comisionId: "comunidad",
      cuerpo: "Buscamos personas con disponibilidad para responder mensajes y dar la bienvenida a nuevos interesados en la comunidad." },
    { id: 3, titulo: "Reunión general confirmada para el 6 de agosto", autor: "Lizzi Cotrina", fecha: "2026-07-18", alcance: "general", comisionId: "eventos",
      cuerpo: "Confirmamos la fecha de nuestra primera reunión general. Muy pronto compartiremos el lugar y la agenda del día." },
    { id: 4, titulo: "Chats regionales independizados: primeras actividades", autor: "Jorge Calmet", fecha: "2026-07-20", alcance: "comision", comisionId: "organizacion",
      cuerpo: "Cada departamento/región ya tiene su propio chat regional. Cada uno deberá reunirse virtualmente hasta el jueves 23/07 para presentarse y elegir 3 personas para la coordinación inicial." }
  ];

  var ENLACES = [
    { id: 1, nombre: "Formulario: Postulación a coordinador/a regional", autor: "Jorge Calmet", fecha: "2026-07-20", comisionId: "organizacion", url: "https://forms.gle/GgS1ntuZAMgXoy9s8", descripcion: "Complétalo si te interesa asumir la coordinación temporal de tu chat regional." },
    { id: 2, nombre: "Base de números de WhatsApp por contactar", autor: "Jorge Calmet", fecha: "2026-07-19", comisionId: "organizacion", url: "https://drive.google.com/drive/folders/ejemplo-contactos-pendientes", descripcion: "Relación de personas que aún no están en ningún chat regional." },
    { id: 3, nombre: "Formulario de levantamiento de información", autor: "Jorge Calmet", fecha: "2026-07-20", comisionId: "organizacion", url: "https://forms.gle/ejemplo-levantamiento-info", descripcion: "Para registrar las 3 preguntas a la comunidad." },
    { id: 4, nombre: "Base de datos de interesados", autor: "Natalia Rodriguez", fecha: "2026-07-18", comisionId: "comunidad", url: "https://docs.google.com/spreadsheets/ejemplo-interesados", descripcion: "Google Sheet para registrar a las personas que escriben para sumarse." },
    { id: 5, nombre: "Drive — Piezas gráficas y plantillas", autor: "Nicolás Talavera", fecha: "2026-07-17", comisionId: "comunicaciones", url: "https://drive.google.com/drive/folders/ejemplo-piezas-graficas", descripcion: "Plantillas editables y banco de piezas ya publicadas." },
    { id: 6, nombre: "Logística — Reunión 6 de agosto", autor: "Lizzi Cotrina", fecha: "2026-07-19", comisionId: "eventos", url: "https://docs.google.com/document/ejemplo-logistica-6ago", descripcion: "Checklist de local, sonido, sillas y registro de asistentes." },
    { id: 7, nombre: "Temas propuestos para clases virtuales", autor: "Diego Pomareda", fecha: "2026-07-16", comisionId: "formacion", url: "https://docs.google.com/spreadsheets/ejemplo-temas-formacion", descripcion: "Listado colaborativo de posibles temas y expertos a contactar." },
    { id: 8, nombre: "Directorio general de la organización", autor: "Equipo Directivo", fecha: "2026-07-14", comisionId: null, url: "https://drive.google.com/drive/folders/ejemplo-directorio-general", descripcion: "Carpeta madre con la estructura completa de las 5 comisiones." }
  ];

  // Personas de demostración — una por cada nivel de rol (login sin Supabase).
  var PERSONAS = [
    { id: "direccion", nombre: "Equipo Directivo", rol: "direccion", comisionId: null, subgrupoId: null, desc: "Visión completa de las 5 comisiones" },
    { id: "lider-comunidad", nombre: "Natalia Rodriguez", rol: "lider", comisionId: "comunidad", subgrupoId: null, desc: "Líder de Comunidad" },
    { id: "lider-organizacion", nombre: "Jorge Calmet", rol: "lider", comisionId: "organizacion", subgrupoId: null, desc: "Líder de Organización" },
    { id: "coord-contacto", nombre: "Ana Salazar", rol: "coordinador", comisionId: "comunidad", subgrupoId: "com-contacto", desc: "Coordinadora — Contacto y Bienvenida" },
    { id: "coord-region", nombre: "Coordinador/a Temporal — Lima Metropolitana", rol: "coordinador", comisionId: "organizacion", subgrupoId: "org-lima-metropolitana", desc: "Coordinación temporal de un chat regional" },
    { id: "miembro-bruno", nombre: "Bruno Vega", rol: "miembro", comisionId: "comunidad", subgrupoId: "com-contacto", desc: "Miembro — Contacto y Bienvenida" },
    { id: "colaborador-x", nombre: "Persona interesada", rol: "colaborador", comisionId: null, subgrupoId: null, desc: "Aún sin comando asignado" }
  ];

  global.NG_MOCK = {
    REGIONES: REGIONES,
    COMISIONES: COMISIONES,
    EVENTOS: EVENTOS,
    COMUNICADOS: COMUNICADOS,
    ENLACES: ENLACES,
    PERSONAS: PERSONAS
  };
})(window);
