/* =====================================================================
 * data/comisiones.js — Capa de datos de Comisiones / Comandos / Tareas.
 * ---------------------------------------------------------------------
 * listarComisiones() arma el mismo árbol anidado que usa toda la UI:
 *   [{ id, nombre, color, mision, lider, subgrupos:[{id,nombre,
 *      coordinador, miembros:[...], tareas:[...] }] }]
 *
 * En modo real hace 4 consultas (comisiones, comandos, membresias,
 * tareas) y las junta en el cliente — simple y suficiente para el
 * tamaño de esta organización (5 comisiones, ~30 comandos). Si el
 * proyecto crece mucho, esto es candidato a convertirse en una vista
 * SQL o función RPC (ver ARCHITECTURE.md, sección "Escalabilidad").
 * RLS filtra automáticamente lo que cada quien puede ver: no hace
 * falta duplicar esa lógica aquí.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;
  var MOCK = global.NG_MOCK;

  async function listarComisionesReal() {
    var [{ data: comisiones }, { data: comandos }, { data: membresias }, { data: tareas }, { data: asignaciones }] = await Promise.all([
      db.from("comisiones").select("*").order("orden"),
      db.from("comandos").select("*"),
      db.from("membresias").select("usuario_id, comando_id, rol, usuarios(nombre)"),
      db.from("tareas").select("*"),
      db.from("tarea_asignados").select("tarea_id, usuario_id, usuarios(nombre)") // multi-asignado, ver tabla tarea_asignados
    ]);

    return (comisiones || []).map(function (c) {
      var comandosDeEsta = (comandos || []).filter(function (cd) { return cd.comision_id === c.id; });
      return {
        id: c.id, nombre: c.nombre, color: c.color, mision: c.mision, liderId: c.lider_id,
        subgrupos: comandosDeEsta.map(function (cd) {
          var miembrosDeEste = (membresias || []).filter(function (m) { return m.comando_id === cd.id; });
          var coordinador = miembrosDeEste.filter(function (m) { return m.rol === "coordinador"; })[0];
          return {
            id: cd.id, nombre: cd.nombre, region: cd.region,
            coordinador: coordinador ? coordinador.usuarios.nombre : "Sin asignar",
            miembros: miembrosDeEste.map(function (m) { return m.usuarios.nombre; }),
            // miembrosConId conserva el usuario_id real (uuid), a diferencia de
            // "miembros" (solo nombres, usado para mostrar chips). El selector
            // "Asignado a" del modal de tareas necesita el id, no el nombre —
            // mandar el nombre ahí causaba "invalid input syntax for type uuid"
            // (POST /tareas 400) porque asignado_id es una columna uuid.
            miembrosConId: miembrosDeEste.map(function (m) { return { id: m.usuario_id, nombre: m.usuarios.nombre }; }),
            tareas: (tareas || []).filter(function (t) { return t.comando_id === cd.id; }).map(function (t) { return mapTarea(t, asignaciones); })
          };
        })
      };
    });
  }

  // asignaciones = filas de tarea_asignados (todas, se filtran por tarea_id
  // acá). Devuelve tanto "asignados" (array {id,nombre}, lo nuevo) como los
  // campos viejos "asignado"/"asignadoNombre" (compat con vistas que
  // todavía no se migraron) apuntando al primero de la lista.
  function mapTarea(t, asignaciones) {
    var propias = (asignaciones || []).filter(function (a) { return a.tarea_id === t.id; });
    var asignados = propias.map(function (a) { return { id: a.usuario_id, nombre: a.usuarios ? a.usuarios.nombre : "" }; });
    return {
      id: t.id, titulo: t.titulo, descripcion: t.descripcion, estado: t.estado, fecha: t.fecha_limite,
      asignados: asignados,
      asignadosNombres: asignados.length ? asignados.map(function (a) { return a.nombre; }).join(", ") : "Sin asignar",
      asignado: asignados.length ? asignados[0].id : null
    };
  }

  // El modo demo no tiene tarea_asignados real: normaliza los datos de
  // ejemplo (que traen "asignado" como texto suelto) al mismo formato
  // "asignados: [{id,nombre}]" que usa el modo real, para que kanban/
  // permisos/"mis tareas" no necesiten un camino de código aparte.
  function normalizarDemo(comisiones) {
    return comisiones.map(function (c) {
      return Object.assign({}, c, {
        subgrupos: c.subgrupos.map(function (s) {
          return Object.assign({}, s, {
            tareas: s.tareas.map(function (t) {
              var asignados = t.asignado ? [{ id: t.asignado, nombre: t.asignado }] : [];
              return Object.assign({}, t, { asignados: asignados, asignadosNombres: t.asignado || "Sin asignar" });
            })
          });
        })
      });
    });
  }

  function listarComisiones() {
    return db ? listarComisionesReal() : Promise.resolve(normalizarDemo(MOCK.COMISIONES));
  }

  async function crearComando(comisionId, payload) {
    if (!db) {
      global.NG_TOAST && global.NG_TOAST.show("Comando operativo creado. Falta implementar la base de datos para guardar la información.", "info");
      return null;
    }
    var slug = global.NG_UTILS.slugify(payload.nombre);
    var { data, error } = await db.from("comandos").insert({ comision_id: comisionId, slug: slug, nombre: payload.nombre }).select().single();
    if (error) throw error;
    return data;
  }

  // payload.asignados = array de usuario_id (puede venir vacío = sin
  // asignar). Primero crea la tarea, después inserta una fila en
  // tarea_asignados por cada persona elegida en el buscador del modal.
  async function crearTarea(comandoId, payload) {
    if (!db) return null; // el modal ya muestra el toast de "modo demo"
    var { data, error } = await db.from("tareas").insert({
      comando_id: comandoId,
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      fecha_limite: payload.fecha || null,
      estado: payload.estado || "pendiente"
    }).select().single();
    if (error) throw error;

    var idsAsignados = payload.asignados || [];
    if (idsAsignados.length) {
      var filas = idsAsignados.map(function (uid) { return { tarea_id: data.id, usuario_id: uid }; });
      var { error: eAsig } = await db.from("tarea_asignados").insert(filas);
      if (eAsig) throw eAsig;
    }
    return data;
  }

  async function actualizarEstadoTarea(tareaId, nuevoEstado) {
    if (!db) return null; // en demo el cambio ya se aplicó en memoria desde la vista
    var { error } = await db.from("tareas").update({ estado: nuevoEstado }).eq("id", tareaId);
    if (error) throw error;
  }

  // Auto-enlistamiento: cualquier persona autenticada puede sumarse a un
  // comando como Miembro (botón "Unirme a este comando"). El insert lo
  // permite membresias_insert en rls-policies.sql (usuario_id = auth.uid()
  // y rol='miembro'); aquí solo se arma la fila.
  async function unirseComando(comandoId) {
    if (!db) {
      global.NG_TOAST && global.NG_TOAST.show("Modo demo: el auto-enlistamiento se activa al conectar Supabase.", "info");
      return null;
    }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { data, error } = await db.from("membresias")
      .insert({ usuario_id: userData.user.id, comando_id: comandoId, rol: "miembro" })
      .select().single();
    if (error) throw error;
    return data;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.comisiones = {
    listar: listarComisiones,
    crearComando: crearComando,
    crearTarea: crearTarea,
    actualizarEstadoTarea: actualizarEstadoTarea,
    unirseComando: unirseComando
  };
})(window);
