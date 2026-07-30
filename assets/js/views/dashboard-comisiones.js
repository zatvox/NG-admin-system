/* =====================================================================
 * views/dashboard-comisiones.js — Inicio, listado de Comisiones,
 * detalle de una Comisión y detalle de un Comando (subgrupo).
 * Se registran en window.NG_VIEWS para que router.js las invoque.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var S = global.NG_SHARED, H = global.NG_VIEW_HELPERS, U = global.NG_UTILS;

  function fmtLargeDate(d) { return U.fmtLargeDate(d); }

  async function viewDashboard() {
    H.setTitle("Inicio", { direccion: "Dirección General", lider: "Líder de Comisión", coordinador: "Coordinador de Comando", miembro: "Miembro", colaborador: "Colaborador / Voluntario" }[global.NG_STATE.persona.rol]);
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Hola, " + p.nombre.split(" ")[0]]), el("p", {}, ["Esto es lo que tienes activo hoy, " + fmtLargeDate(global.NG_STATE.today) + "."])])
    ]));

    if (p.rol === "direccion") {
      var tareas = S.allTareas(comisiones);
      var pendientes = tareas.filter(function (t) { return t.estado !== "hecho"; }).length;
      var eventos = await global.NG_DATA.eventos.listar();
      var kpis = el("div", { class: "kpi-row" }, [
        S.kpi(comisiones.length, "Comisiones activas"),
        S.kpi(S.sum(comisiones.map(function (c) { return c.subgrupos.length; })), "Comandos operativos"),
        S.kpi(pendientes, "Tareas abiertas"),
        S.kpi(eventos.filter(function (e) { return U.diasRestantes(e.fecha, global.NG_STATE.today) >= 0; }).length, "Próximos eventos")
      ]);
      root.appendChild(kpis);
      root.appendChild(el("div", { class: "section-title" }, ["Resumen por comisión"]));
      var grid = el("div", { class: "grid grid-cols-5" });
      comisiones.forEach(function (c) { grid.appendChild(S.comisionCard(c, p)); });
      root.appendChild(grid);
    } else if (p.rol === "lider") {
      var c = S.getComision(comisiones, p.comisionId);
      var t = S.allTareas(comisiones).filter(function (x) { return x.comisionId === c.id; });
      var eventos2 = await global.NG_DATA.eventos.listar();
      root.appendChild(el("div", { class: "kpi-row" }, [
        S.kpi(c.subgrupos.length, "Comandos en tu comisión"),
        S.kpi(t.filter(function (x) { return x.estado !== "hecho"; }).length, "Tareas abiertas"),
        S.kpi(eventos2.filter(function (e) { return e.comisionId === c.id && U.diasRestantes(e.fecha, global.NG_STATE.today) >= 0; }).length, "Próximos eventos")
      ]));
      root.appendChild(el("div", { class: "section-title" }, ["Comandos operativos de " + c.nombre]));
      var g = el("div", { class: "grid grid-cols-3" });
      c.subgrupos.forEach(function (s) { g.appendChild(S.subgrupoCard(s, c, p)); });
      root.appendChild(g);
      root.appendChild(S.taskListSection("Tareas pendientes en tu comisión", t.filter(function (x) { return x.estado !== "hecho"; }).slice(0, 6)));
    } else if (p.rol === "coordinador" || p.rol === "miembro") {
      // (2026-07-30) Antes solo miraba p.subgrupoId (UN comando). Ahora
      // recorre TODAS sus membresías: puede coordinar un comando y a la vez
      // ser simple miembro de otro, en comisiones distintas. Se muestra un
      // tablero completo por cada comando que coordina, y una lista
      // combinada de "mis tareas" para los comandos donde es solo miembro.
      var misMembresias = (p.membresias && p.membresias.length) ? p.membresias : [{ comandoId: p.subgrupoId, comisionId: p.comisionId, rol: p.rol }];
      var comoCoordinador = misMembresias.filter(function (m) { return m.rol === "coordinador"; });
      var comoMiembro = misMembresias.filter(function (m) { return m.rol === "miembro"; });

      comoCoordinador.forEach(function (m) {
        var info = S.getSubgrupo(comisiones, m.comandoId);
        if (!info) return;
        var s = info.subgrupo, c = info.comision;
        root.appendChild(el("div", { class: "kpi-row" }, [
          S.kpi((s.miembros || []).length, "Miembros del comando"),
          S.kpi(s.tareas.filter(function (x) { return x.estado === "pendiente"; }).length, "Pendientes"),
          S.kpi(s.tareas.filter(function (x) { return x.estado === "en_curso"; }).length, "En curso")
        ]));
        root.appendChild(el("div", { class: "section-title" }, ["Tablero de " + s.nombre + " · " + c.nombre]));
        root.appendChild(S.kanbanBoard(s.tareas, { comisionId: c.id, subgrupoId: s.id, comisionColor: c.color }, p, null,
          function (t) { global.NG_openEditarTareaModal(t, c); }));
      });

      var eventosAll = await global.NG_DATA.eventos.listar();

      if (comoMiembro.length) {
        var todasMisTareas = [];
        var comisionesDeMisComandos = {};
        comoMiembro.forEach(function (m) {
          var info2 = S.getSubgrupo(comisiones, m.comandoId);
          if (!info2) return;
          comisionesDeMisComandos[info2.comision.id] = info2.comision.nombre;
          (info2.subgrupo.tareas || []).forEach(function (t) {
            if ((t.asignados || []).some(function (a) { return a.id === p.id || a.nombre === p.nombre; })) todasMisTareas.push(t);
          });
        });
        root.appendChild(el("div", { class: "section-title" }, ["Mis tareas"]));
        root.appendChild(S.taskListSection(null, todasMisTareas));
        var idsComisionesMiembro = Object.keys(comisionesDeMisComandos);
        root.appendChild(el("div", { class: "section-title" }, ["Próximos eventos"]));
        root.appendChild(S.eventListSection(eventosAll.filter(function (e) { return e.alcance === "general" || idsComisionesMiembro.indexOf(e.comisionId) >= 0; }).slice(0, 4), comisiones));
      } else if (!comoCoordinador.length) {
        root.appendChild(el("div", { class: "empty-state" }, ["Todavía no estás en ningún comando operativo."]));
      }
    } else {
      var comunicados = await global.NG_DATA.comunicados.listar();
      root.appendChild(el("div", { class: "empty-state" }, ['Aún no perteneces a ningún comando operativo. Revisa "Comunicados" para ver a qué comisiones puedes sumarte.']));
      root.appendChild(el("div", { class: "section-title" }, ["Comunicados abiertos a la comunidad"]));
      var g2 = el("div", { class: "grid grid-cols-2" });
      comunicados.filter(function (c) { return c.alcance === "general"; }).forEach(function (c) { g2.appendChild(S.comunicadoCard(c, comisiones)); });
      root.appendChild(g2);
    }
  }

  async function viewComisiones() {
    H.setTitle("Comisiones");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [el("div", {}, [el("h1", {}, ["Comisiones"]), el("p", {}, ["Las 5 comisiones de trabajo y sus comandos operativos."])])]));
    var grid = el("div", { class: "grid grid-cols-5" });
    comisiones.forEach(function (c) { grid.appendChild(S.comisionCard(c, p)); });
    root.appendChild(grid);
  }

  async function viewComisionDetalle(id) {
    var comisiones = await global.NG_DATA.comisiones.listar();
    var c = S.getComision(comisiones, id);
    var root = q("#view-root"); root.innerHTML = "";
    if (!c) { H.setTitle("Comisión no encontrada"); root.innerHTML = '<div class="empty-state">Esta comisión no existe.</div>'; return; }
    var p = global.NG_STATE.persona;
    H.setTitle(c.nombre);
    root.appendChild(H.crumbs([{ label: "Comisiones", href: "#/comisiones" }, { label: c.nombre }]));
    var canManage = global.NG_PERMS.canManageComision(p, c.id);

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, [c.nombre]), el("p", {}, [c.mision || ""])]),
      canManage ? el("div", { style: "display:flex;gap:8px;" }, [
        S.actionBtn("+ Crear comando operativo", function () { global.NG_openNuevoComandoModal(c); }),
        (function () { var b = el("button", { class: "btn btn-ghost", type: "button" }, ["Editar comisión"]); b.addEventListener("click", function () { global.NG_openEditarComisionModal(c); }); return b; })()
      ]) : null
    ].filter(Boolean)));

    root.appendChild(el("div", { class: "kpi-row" }, [
      S.kpi(c.subgrupos.length, "Comandos operativos"),
      S.kpi(S.sum(c.subgrupos.map(function (s) { return (s.miembros || []).length; })), "Personas involucradas"),
      S.kpi(S.sum(c.subgrupos.map(function (s) { return s.tareas.filter(function (t) { return t.estado !== "hecho"; }).length; })), "Tareas abiertas")
    ]));

    root.appendChild(el("div", { class: "section-title" }, ["Líder: " + (c.lider || "Sin asignar")]));
    root.appendChild(el("div", { class: "section-title" }, ["Comandos operativos"]));
    var grid = el("div", { class: "grid grid-cols-3" });
    c.subgrupos.forEach(function (s) { grid.appendChild(S.subgrupoCard(s, c, p)); });
    root.appendChild(grid);

    var eventos = await global.NG_DATA.eventos.listar();
    root.appendChild(el("div", { class: "section-title" }, ["Próximos eventos"]));
    root.appendChild(S.eventListSection(eventos.filter(function (e) { return e.comisionId === c.id; }), comisiones, p));

    var comunicados = await global.NG_DATA.comunicados.listar();
    root.appendChild(el("div", { class: "section-title" }, ["Comunicados de esta comisión"]));
    var posts = comunicados.filter(function (p2) { return p2.comisionId === c.id; });
    if (!posts.length) root.appendChild(el("div", { class: "empty-state" }, ["Aún no hay comunicados de esta comisión."]));
    else { var pg = el("div", { class: "grid grid-cols-2" }); posts.forEach(function (p2) { pg.appendChild(S.comunicadoCard(p2, comisiones, p)); }); root.appendChild(pg); }
  }

  async function viewSubgrupoDetalle(id) {
    var comisiones = await global.NG_DATA.comisiones.listar();
    var info = S.getSubgrupo(comisiones, id);
    var root = q("#view-root"); root.innerHTML = "";
    if (!info) { H.setTitle("Comando no encontrado"); root.innerHTML = '<div class="empty-state">Este comando operativo no existe.</div>'; return; }
    var s = info.subgrupo, c = info.comision, p = global.NG_STATE.persona;
    H.setTitle(s.nombre, c.nombre);
    root.appendChild(H.crumbs([{ label: "Comisiones", href: "#/comisiones" }, { label: c.nombre, href: "#/comisiones/" + c.id }, { label: s.nombre }]));

    if (!global.NG_PERMS.canAccessSubgrupo(p, c.id)) { root.appendChild(H.noAccessView(p)); return; }
    var canManage = global.NG_PERMS.canManageSubgrupo(p, c.id, s.id);
    // Editar el REGISTRO del comando (nombre/región/enlace) es más
    // restringido que administrar sus tareas/miembros: solo Dirección o
    // el Líder de la comisión (mismo alcance que comandos_update en
    // rls-policies.sql), un Coordinador no lo tiene aunque sí administre
    // el día a día del comando.
    var canEditComando = global.NG_PERMS.canManageComision(p, c.id);

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, [s.nombre]), el("p", {}, ["Coordinador/a: " + s.coordinador + " · " + c.nombre])]),
      el("div", { style: "display:flex;gap:8px;" }, [
        canManage ? S.actionBtn("+ Nueva tarea", function () { global.NG_openNuevaTareaModalSubgrupo(s, c); }) : null,
        canEditComando ? (function () { var b = el("button", { class: "btn btn-ghost", type: "button" }, ["Editar comando"]); b.addEventListener("click", function () { global.NG_openEditarComandoModal(s, c); }); return b; })() : null
      ].filter(Boolean))
    ].filter(Boolean)));

    // Enlace del grupo de coordinación de ESTE comando (ej. WhatsApp),
    // guardado en comandos.enlace_url — distinto de la biblioteca de
    // enlaces general de la comisión. Solo se muestra si existe.
    if (s.enlaceUrl) {
      root.appendChild(el("a", {
        href: s.enlaceUrl, target: "_blank", rel: "noopener noreferrer",
        class: "btn btn-ghost", style: "margin-bottom:16px;font-size:12.5px;padding:7px 12px;display:inline-block;"
      }, ["Abrir grupo de coordinación ↗"]));
    }

    var miembrosDetalle = s.miembrosDetalle || [];
    var ROL_MEMBRESIA_LABEL = { miembro: "Miembro", coordinador: "Coordinador/a", secretario: "Secretario/a de apoyo" };
    root.appendChild(el("div", { class: "section-title" }, ["Miembros (" + miembrosDetalle.length + ")"]));

    if (canManage) {
      // (2026-07-27) Quien administra el comando (Dirección, Líder de la
      // comisión, o el propio Coordinador) puede ascender/degradar el rol
      // de cada persona y quitarla del comando — antes esto SOLO se podía
      // hacer con SQL manual, no había forma de nombrar un coordinador
      // desde la interfaz.
      var ROL_OPTIONS = [
        { value: "miembro", label: "Miembro" },
        { value: "coordinador", label: "Coordinador/a" },
        { value: "secretario", label: "Secretario/a de apoyo" }
      ];
      var membersCard = el("div", { class: "card", style: "margin-bottom:16px;padding:6px 14px;" });
      if (!miembrosDetalle.length) {
        membersCard.appendChild(el("div", { class: "empty-state", style: "border:none;" }, ["Nadie se ha enlistado en este comando todavía."]));
      }
      miembrosDetalle.forEach(function (m) {
        var row = el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);" }, [
          el("span", { style: "font-weight:600;font-size:13px;color:var(--ink);" }, [m.nombre])
        ]);
        var rolSelect = el("select", { "aria-label": "Rol de " + m.nombre, style: "font-size:12px;padding:5px 8px;" });
        ROL_OPTIONS.forEach(function (o) {
          var opt = el("option", { value: o.value }, [o.label]);
          if (o.value === m.rol) opt.setAttribute("selected", "selected");
          rolSelect.appendChild(opt);
        });
        rolSelect.addEventListener("change", function (e) {
          var nuevoRol = e.target.value;
          rolSelect.disabled = true;
          global.NG_DATA.comisiones.cambiarRolMembresia(s.id, m.id, nuevoRol)
            .then(function () {
              global.NG_TOAST.show(m.nombre + " ahora es " + ROL_MEMBRESIA_LABEL[nuevoRol] + ".", "success");
              global.NG_ROUTER.route();
            })
            .catch(function (err) {
              rolSelect.disabled = false;
              global.NG_TOAST.show(global.NG_ERR.format(err), "error");
            });
        });
        var quitarBtn = el("button", { type: "button", class: "icon-btn-sm", title: "Quitar del comando", "aria-label": "Quitar a " + m.nombre + " del comando" }, ["✕"]);
        quitarBtn.addEventListener("click", function () {
          if (!window.confirm("¿Quitar a " + m.nombre + " de \"" + s.nombre + "\"?")) return;
          global.NG_DATA.comisiones.quitarMiembro(s.id, m.id)
            .then(function () {
              global.NG_TOAST.show(m.nombre + " fue quitado del comando.", "success");
              global.NG_ROUTER.route();
            })
            .catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
        });
        row.appendChild(el("div", { style: "display:flex;align-items:center;gap:8px;" }, [rolSelect, quitarBtn]));
        membersCard.appendChild(row);
      });
      root.appendChild(membersCard);
    } else {
      var chips = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;" });
      miembrosDetalle.forEach(function (m) {
        var etiqueta = m.nombre + (m.rol !== "miembro" ? " · " + ROL_MEMBRESIA_LABEL[m.rol] : "");
        chips.appendChild(el("span", { class: "chip" }, [el("span", { class: "dot", style: "background:" + c.color + ";width:6px;height:6px;" }), etiqueta]));
      });
      root.appendChild(chips);
    }

    // "Salir de comando": solo para quien se enlistó como Miembro en ESTE
    // comando puntual (contraparte de "Unirme a este comando" en shared.js).
    // No se ofrece a Coordinador/Líder/Dirección: su membresía/cargo la
    // gestiona quien administra el comando, no un botón de autoservicio.
    // (2026-07-30) Antes comparaba contra el único p.subgrupoId "principal"
    // — ahora contra CUALQUIERA de sus membresías, porque puede estar
    // enlistado como Miembro en este comando aunque no sea el primero al
    // que se unió.
    var miMembresiaAqui = (p.membresias || (p.subgrupoId ? [{ comandoId: p.subgrupoId, rol: p.rol }] : []))
      .filter(function (m) { return m.comandoId === s.id; })[0];
    if (miMembresiaAqui && miMembresiaAqui.rol === "miembro") {
      var leaveBtn = el("button", { class: "btn btn-ghost", type: "button", style: "margin-bottom:16px;font-size:12px;padding:7px 12px;" }, ["Salir de este comando"]);
      leaveBtn.addEventListener("click", function () {
        if (!window.confirm("¿Seguro que quieres salir de \"" + s.nombre + "\"? Perderás el acceso a sus tareas.")) return;
        leaveBtn.disabled = true; leaveBtn.textContent = "Saliendo…";
        global.NG_DATA.comisiones.salirComando(s.id)
          .then(function () {
            global.NG_TOAST.show("Saliste de " + s.nombre + ".", "success");
            if (global.NG_refreshPersonaAndGo) global.NG_refreshPersonaAndGo("#/comisiones/" + c.id);
          })
          .catch(function (err) {
            leaveBtn.disabled = false; leaveBtn.textContent = "Salir de este comando";
            global.NG_TOAST.show(global.NG_ERR.format(err), "error");
          });
      });
      root.appendChild(leaveBtn);
    }

    root.appendChild(el("div", { class: "section-title" }, ["Tablero de tareas"]));
    root.appendChild(S.kanbanBoard(s.tareas, { comisionId: c.id, subgrupoId: s.id, comisionColor: c.color }, p, null,
      function (t) { global.NG_openEditarTareaModal(t, c); }));
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.dashboard = viewDashboard;
  global.NG_VIEWS.comisiones = viewComisiones;
  global.NG_VIEWS.comisionDetalle = viewComisionDetalle;
  global.NG_VIEWS.subgrupoDetalle = viewSubgrupoDetalle;
})(window);
