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
      comisiones.forEach(function (c) { grid.appendChild(S.comisionCard(c)); });
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
    } else if (p.rol === "coordinador") {
      var info = S.getSubgrupo(comisiones, p.subgrupoId);
      var s = info.subgrupo;
      root.appendChild(el("div", { class: "kpi-row" }, [
        S.kpi((s.miembros || []).length, "Miembros del comando"),
        S.kpi(s.tareas.filter(function (x) { return x.estado === "pendiente"; }).length, "Pendientes"),
        S.kpi(s.tareas.filter(function (x) { return x.estado === "en_curso"; }).length, "En curso")
      ]));
      root.appendChild(el("div", { class: "section-title" }, ["Tablero de " + s.nombre]));
      root.appendChild(S.kanbanBoard(s.tareas, { comisionId: info.comision.id, subgrupoId: s.id }, p));
    } else if (p.rol === "miembro") {
      var info2 = S.getSubgrupo(comisiones, p.subgrupoId);
      var s2 = info2.subgrupo, c2 = info2.comision;
      var mias = s2.tareas.filter(function (t) { return (t.asignados || []).some(function (a) { return a.id === p.id || a.nombre === p.nombre; }); });
      var eventosAll = await global.NG_DATA.eventos.listar();
      root.appendChild(el("div", { class: "section-title" }, ["Mis tareas"]));
      root.appendChild(S.taskListSection(null, mias.length ? mias : s2.tareas.slice(0, 4)));
      root.appendChild(el("div", { class: "section-title" }, ["Próximos eventos de " + c2.nombre]));
      root.appendChild(S.eventListSection(eventosAll.filter(function (e) { return e.comisionId === c2.id || e.alcance === "general"; }).slice(0, 4), comisiones));
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
    var comisiones = await global.NG_DATA.comisiones.listar();
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [el("div", {}, [el("h1", {}, ["Comisiones"]), el("p", {}, ["Las 5 comisiones de trabajo y sus comandos operativos."])])]));
    var grid = el("div", { class: "grid grid-cols-5" });
    comisiones.forEach(function (c) { grid.appendChild(S.comisionCard(c)); });
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
      canManage ? S.actionBtn("+ Crear comando operativo", function () { global.NG_openNuevoComandoModal(c); }) : null
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
    root.appendChild(S.eventListSection(eventos.filter(function (e) { return e.comisionId === c.id; }), comisiones));

    var comunicados = await global.NG_DATA.comunicados.listar();
    root.appendChild(el("div", { class: "section-title" }, ["Comunicados de esta comisión"]));
    var posts = comunicados.filter(function (p2) { return p2.comisionId === c.id; });
    if (!posts.length) root.appendChild(el("div", { class: "empty-state" }, ["Aún no hay comunicados de esta comisión."]));
    else { var pg = el("div", { class: "grid grid-cols-2" }); posts.forEach(function (p2) { pg.appendChild(S.comunicadoCard(p2, comisiones)); }); root.appendChild(pg); }
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

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, [s.nombre]), el("p", {}, ["Coordinador/a: " + s.coordinador + " · " + c.nombre])]),
      canManage ? S.actionBtn("+ Nueva tarea", function () { global.NG_openNuevaTareaModalSubgrupo(s, c); }) : null
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

    root.appendChild(el("div", { class: "section-title" }, ["Miembros (" + (s.miembros || []).length + ")"]));
    var chips = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;" });
    (s.miembros || []).forEach(function (m) { chips.appendChild(el("span", { class: "chip" }, [el("span", { class: "dot", style: "background:" + c.color + ";width:6px;height:6px;" }), m])); });
    root.appendChild(chips);

    // "Salir de comando": solo para quien se enlistó como Miembro en ESTE
    // comando puntual (contraparte de "Unirme a este comando" en shared.js).
    // No se ofrece a Coordinador/Líder/Dirección: su membresía/cargo la
    // gestiona quien administra el comando, no un botón de autoservicio.
    if (p.rol === "miembro" && p.subgrupoId === s.id) {
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
    root.appendChild(S.kanbanBoard(s.tareas, { comisionId: c.id, subgrupoId: s.id }, p));
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.dashboard = viewDashboard;
  global.NG_VIEWS.comisiones = viewComisiones;
  global.NG_VIEWS.comisionDetalle = viewComisionDetalle;
  global.NG_VIEWS.subgrupoDetalle = viewSubgrupoDetalle;
})(window);
