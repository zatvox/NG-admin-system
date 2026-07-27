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
    // "lider:usuarios!lider_id(nombre)" resuelve el NOMBRE del líder vía el
    // FK comisiones.lider_id -> usuarios.id. Antes solo se guardaba
    // "liderId" (el uuid) y nunca se traía el nombre — por eso el chip
    // siempre mostraba "Líder: —" aunque ya hubieras asignado lider_id en
    // la tabla comisiones: el dato nunca llegaba a la UI.
    var [{ data: comisiones }, { data: comandos }, { data: membresias }, { data: tareas }, { data: asignaciones }] = await Promise.all([
      db.from("comisiones").select("*, lider:usuarios!lider_id(nombre)").order("orden"),
      db.from("comandos").select("*"),
      db.from("membresias").select("usuario_id, comando_id, rol, usuarios(nombre)"),
      db.from("tareas").select("*"),
      db.from("tarea_asignados").select("tarea_id, usuario_id, usuarios(nombre)") // multi-asignado, ver tabla tarea_asignados
    ]);

    return (comisiones || []).map(function (c) {
      var comandosDeEsta = (comandos || []).filter(function (cd) { return cd.comision_id === c.id; });
      return {
        id: c.id, nombre: c.nombre, color: c.color, mision: c.mision, liderId: c.lider_id,
        lider: (c.lider && c.lider.nombre) ? c.lider.nombre : null,
        subgrupos: comandosDeEsta.map(function (cd) {
          var miembrosDeEste = (membresias || []).filter(function (m) { return m.comando_id === cd.id; });
          var coordinador = miembrosDeEste.filter(function (m) { return m.rol === "coordinador"; })[0];
          return {
            id: cd.id, nombre: cd.nombre, region: cd.region, enlaceUrl: cd.enlace_url || null,
            // "m.usuarios" puede venir null si el embed no encontró el
            // perfil (perfil borrado, o RLS de "usuarios" bloqueándolo) —
            // nunca asumir que existe, aunque la fila de membresía sí.
            coordinador: (coordinador && coordinador.usuarios) ? coordinador.usuarios.nombre : "Sin asignar",
            miembros: miembrosDeEste.map(function (m) { return m.usuarios ? m.usuarios.nombre : "(perfil no disponible)"; }),
            // miembrosConId conserva el usuario_id real (uuid), a diferencia de
            // "miembros" (solo nombres, usado para mostrar chips). El selector
            // "Asignado a" del modal de tareas necesita el id, no el nombre —
            // mandar el nombre ahí causaba "invalid input syntax for type uuid"
            // (POST /tareas 400) porque asignado_id es una columna uuid.
            miembrosConId: miembrosDeEste.map(function (m) { return { id: m.usuario_id, nombre: m.usuarios ? m.usuarios.nombre : "(perfil no disponible)" }; }),
            // miembrosDetalle SÍ trae el rol de cada quien (miembro/coordinador/
            // secretario) — lo necesita la lista de miembros del comando para
            // poder mostrar y cambiar el rol de cada persona (ver
            // views/dashboard-comisiones.js, sección "Miembros").
            miembrosDetalle: miembrosDeEste.map(function (m) { return { id: m.usuario_id, nombre: m.usuarios ? m.usuarios.nombre : "(perfil no disponible)", rol: m.rol }; }),
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
            // La demo no tiene ids ni roles reales por persona (solo strings
            // de nombre) — se sintetiza lo mínimo para que la lista de
            // "Miembros" del comando no truene, aunque cambiar de rol no
            // persista de verdad en modo demo (mismo criterio que el resto).
            miembrosDetalle: (s.miembros || []).map(function (m) {
              return { id: m, nombre: m, rol: m === s.coordinador ? "coordinador" : "miembro" };
            }),
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

  // Editar los datos de una comisión ya existente (nombre/misión/color).
  // Permitido por comisiones_update: Dirección, o el Líder de ESA comisión.
  // Las 5 comisiones son fijas (no hay "crear comisión" en la UI), así
  // que esto solo actualiza, nunca inserta.
  async function actualizarComision(comisionId, payload) {
    if (!db) return null;
    var { error } = await db.from("comisiones").update({
      nombre: payload.nombre,
      mision: payload.mision || null,
      color: payload.color || undefined
    }).eq("id", comisionId);
    if (error) throw error;
  }

  async function crearComando(comisionId, payload) {
    if (!db) {
      global.NG_TOAST && global.NG_TOAST.show("Comando operativo creado. Falta implementar la base de datos para guardar la información.", "info");
      return null;
    }
    var slug = global.NG_UTILS.slugify(payload.nombre);
    var { data, error } = await db.from("comandos").insert({
      comision_id: comisionId, slug: slug, nombre: payload.nombre,
      enlace_url: payload.enlaceUrl || null
    }).select().single();
    if (error) throw error;
    return data;
  }

  // Editar un comando ya existente (nombre/región/enlace del grupo).
  // Permitido por comandos_update: Dirección, o el Líder de la comisión
  // dueña de ese comando (mismo alcance que crearComando, no incluye a
  // Coordinador — administrar EL COMANDO como registro es distinto de
  // administrar sus tareas/miembros, que sí puede un Coordinador).
  async function actualizarComando(comandoId, payload) {
    if (!db) return null;
    var { error } = await db.from("comandos").update({
      nombre: payload.nombre,
      region: payload.region || null,
      enlace_url: payload.enlaceUrl || null
    }).eq("id", comandoId);
    if (error) throw error;
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

  // Edición completa (título/descripción/fecha/estado/asignados), no solo
  // el estado. Los asignados se reemplazan por completo: borra todas las
  // filas de tarea_asignados de esta tarea e inserta las nuevas — más
  // simple y confiable que calcular un diff, y el volumen por tarea es
  // chico (unas pocas personas), así que no hay problema de performance.
  async function actualizarTarea(tareaId, payload) {
    if (!db) return null;
    var { error } = await db.from("tareas").update({
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      fecha_limite: payload.fecha || null,
      estado: payload.estado
    }).eq("id", tareaId);
    if (error) throw error;

    var { error: eDel } = await db.from("tarea_asignados").delete().eq("tarea_id", tareaId);
    if (eDel) throw eDel;
    var idsAsignados = payload.asignados || [];
    if (idsAsignados.length) {
      var filas = idsAsignados.map(function (uid) { return { tarea_id: tareaId, usuario_id: uid }; });
      var { error: eAsig } = await db.from("tarea_asignados").insert(filas);
      if (eAsig) throw eAsig;
    }
  }

  async function eliminarTarea(tareaId) {
    if (!db) return null;
    var { error } = await db.from("tareas").delete().eq("id", tareaId);
    if (error) throw error;
  }

  // Cambiar el rol de una membresía existente (ej. ascender a Miembro a
  // Coordinador/Secretario de apoyo). Permitido por membresias_update:
  // Dirección, Líder de la comisión, o Coordinador de ESE comando.
  async function cambiarRolMembresia(comandoId, usuarioId, nuevoRol) {
    if (!db) return null;
    var { error } = await db.from("membresias").update({ rol: nuevoRol })
      .eq("comando_id", comandoId).eq("usuario_id", usuarioId);
    if (error) throw error;
  }

  // Quitar a OTRA persona del comando (a diferencia de salirComando, que
  // solo te saca a ti mismo). Permitido por membresias_delete para
  // Dirección/Líder de la comisión/Coordinador de ese comando.
  async function quitarMiembro(comandoId, usuarioId) {
    if (!db) return null;
    var { error } = await db.from("membresias").delete()
      .eq("comando_id", comandoId).eq("usuario_id", usuarioId);
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

  // Salir de un comando: contraparte de unirseComando(). Borra la propia
  // fila de membresías (usuario_id = auth.uid()); lo permite membresias_delete
  // gracias a la cláusula "or usuario_id = auth.uid()" agregada en
  // rls-policies.sql (2026-07-26) — antes esa política solo dejaba borrar a
  // Dirección/Líder/Coordinador, y un Miembro no podía ni siquiera salirse
  // de su propio comando.
  async function salirComando(comandoId) {
    if (!db) {
      global.NG_TOAST && global.NG_TOAST.show("Modo demo: salir de un comando se activa al conectar Supabase.", "info");
      return null;
    }
    var { data: userData, error: eUser } = await db.auth.getUser();
    if (eUser) throw eUser;
    var { error } = await db.from("membresias")
      .delete()
      .eq("usuario_id", userData.user.id)
      .eq("comando_id", comandoId);
    if (error) throw error;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.comisiones = {
    listar: listarComisiones,
    actualizarComision: actualizarComision,
    crearComando: crearComando,
    actualizarComando: actualizarComando,
    crearTarea: crearTarea,
    actualizarEstadoTarea: actualizarEstadoTarea,
    actualizarTarea: actualizarTarea,
    eliminarTarea: eliminarTarea,
    unirseComando: unirseComando,
    salirComando: salirComando,
    cambiarRolMembresia: cambiarRolMembresia,
    quitarMiembro: quitarMiembro
  };
})(window);
