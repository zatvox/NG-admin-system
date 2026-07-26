/* =====================================================================
 * views/tareas-calendario.js — Vista global de Tareas (kanban/lista con
 * filtros) y Calendario mensual estilo Google Calendar (grilla fija de
 * 6 semanas, "+N más", botón Hoy).
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var S = global.NG_SHARED, H = global.NG_VIEW_HELPERS, U = global.NG_UTILS;

  async function viewTareas() {
    H.setTitle("Tareas");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var base = S.allTareas(comisiones);
    if (p.rol === "lider") base = base.filter(function (t) { return t.comisionId === p.comisionId; });
    if (p.rol === "coordinador" || p.rol === "miembro") base = base.filter(function (t) { return t.subgrupoId === p.subgrupoId; });

    var root = q("#view-root"); root.innerHTML = "";
    var comisionesVisibles = p.rol === "direccion" ? comisiones : comisiones.filter(function (c) { return c.id === p.comisionId; });

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Tareas"]), el("p", {}, ["Vista consolidada de tareas según tu alcance de acceso."])]),
      (p.rol !== "miembro") ? S.actionBtn("+ Nueva tarea", function () { global.NG_openNuevaTareaModalGlobal(p, comisionesVisibles); }) : null
    ].filter(Boolean)));

    var toolbar = el("div", { class: "toolbar" });
    var filterComision = el("select", {});
    filterComision.appendChild(el("option", { value: "" }, ["Todas las comisiones"]));
    comisionesVisibles.forEach(function (c) { filterComision.appendChild(el("option", { value: c.id }, [c.nombre])); });
    var filterEstado = el("select", {}, [
      el("option", { value: "" }, ["Todos los estados"]),
      el("option", { value: "pendiente" }, ["Pendiente"]),
      el("option", { value: "en_curso" }, ["En curso"]),
      el("option", { value: "hecho" }, ["Hecho"])
    ]);
    var btnKanban = el("button", { class: "btn btn-ghost", type: "button" }, ["Vista tablero"]);
    var btnList = el("button", { class: "btn btn-ghost", type: "button" }, ["Vista lista"]);
    toolbar.appendChild(filterComision); toolbar.appendChild(filterEstado);
    toolbar.appendChild(el("div", { class: "spacer" }));
    toolbar.appendChild(btnKanban); toolbar.appendChild(btnList);
    root.appendChild(toolbar);

    var container = el("div", {});
    root.appendChild(container);

    var mode = "kanban";
    function draw() {
      var filtered = base.filter(function (t) {
        return (!filterComision.value || t.comisionId === filterComision.value) && (!filterEstado.value || t.estado === filterEstado.value);
      });
      container.innerHTML = "";
      if (!filtered.length) { container.appendChild(el("div", { class: "empty-state" }, ["No hay tareas con estos filtros."])); return; }
      if (mode === "kanban") {
        container.appendChild(S.kanbanBoard(filtered, null, p, draw));
      } else {
        var tw = el("div", { class: "table-wrap" });
        var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Tarea"]), el("th", {}, ["Comisión"]), el("th", {}, ["Comando"]), el("th", {}, ["Asignado"]), el("th", {}, ["Fecha"]), el("th", {}, ["Estado"])])]);
        filtered.forEach(function (t) {
          table.appendChild(el("tr", {}, [
            el("td", {}, [t.titulo]), el("td", {}, [t.comisionNombre]), el("td", {}, [t.subgrupoNombre]),
            el("td", {}, [t.asignadosNombres || "Sin asignar"]), el("td", { class: "mono" }, [U.fmtFecha(t.fecha)]),
            el("td", {}, [el("span", { class: "badge-estado badge-" + t.estado }, [S.ESTADO_LABEL[t.estado]])])
          ]));
        });
        tw.appendChild(table); container.appendChild(tw);
      }
    }
    filterComision.addEventListener("change", draw);
    filterEstado.addEventListener("change", draw);
    btnKanban.addEventListener("click", function () { mode = "kanban"; draw(); });
    btnList.addEventListener("click", function () { mode = "list"; draw(); });
    draw();
  }

  async function viewCalendario() {
    H.setTitle("Calendario");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var eventos = await global.NG_DATA.eventos.listar();
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Calendario"]), el("p", {}, ["Eventos generales y de tu(s) comisión(es)."])]),
      (p.rol === "direccion" || p.rol === "lider" || p.rol === "coordinador") ? S.actionBtn("+ Nuevo evento", function () { global.NG_openNuevoEventoModal(p, comisiones); }) : null
    ].filter(Boolean)));

    var visibleEventos = eventos.filter(function (e) {
      if (p.rol === "direccion") return true;
      if (!e.comisionId) return true;
      return e.comisionId === p.comisionId;
    });

    var calWrap = el("div", { class: "card cal-card" });
    var head = el("div", { class: "cal-head" });
    var left = el("div", { class: "cal-head-left" });
    var todayBtn = el("button", { class: "btn-today", type: "button" }, ["Hoy"]);
    var nav = el("div", { class: "cal-nav" });
    var prev = el("button", { type: "button", "aria-label": "Mes anterior" }, ["‹"]);
    var next = el("button", { type: "button", "aria-label": "Mes siguiente" }, ["›"]);
    nav.appendChild(prev); nav.appendChild(next);
    var monthLabel = el("div", { class: "cal-title" });
    left.appendChild(todayBtn); left.appendChild(nav); left.appendChild(monthLabel);
    head.appendChild(left);
    calWrap.appendChild(head);

    var gridWrap = el("div", { class: "cal-grid-wrap" });
    var dowRow = el("div", { class: "cal-dow-row" });
    U.DOW.forEach(function (d) { dowRow.appendChild(el("div", { class: "cal-dow" }, [d])); });
    gridWrap.appendChild(dowRow);
    var grid = el("div", { class: "cal-grid" });
    gridWrap.appendChild(grid);
    calWrap.appendChild(gridWrap);
    root.appendChild(calWrap);

    var listWrap = el("div", {});
    root.appendChild(listWrap);

    function draw() {
      var st = global.NG_STATE, today = st.today;
      monthLabel.textContent = U.MESES[st.calMonth][0].toUpperCase() + U.MESES[st.calMonth].slice(1) + " " + st.calYear;
      grid.innerHTML = "";

      var first = new Date(st.calYear, st.calMonth, 1);
      var startOffset = (first.getDay() + 6) % 7;
      var daysInMonth = new Date(st.calYear, st.calMonth + 1, 0).getDate();
      var daysInPrevMonth = new Date(st.calYear, st.calMonth, 0).getDate();
      var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

      for (var i = 0; i < totalCells; i++) {
        var dayNum, cellMonth = st.calMonth, cellYear = st.calYear, otherMonth = false;
        if (i < startOffset) {
          dayNum = daysInPrevMonth - startOffset + i + 1;
          cellMonth = st.calMonth - 1; if (cellMonth < 0) { cellMonth = 11; cellYear--; }
          otherMonth = true;
        } else if (i >= startOffset + daysInMonth) {
          dayNum = i - (startOffset + daysInMonth) + 1;
          cellMonth = st.calMonth + 1; if (cellMonth > 11) { cellMonth = 0; cellYear++; }
          otherMonth = true;
        } else {
          dayNum = i - startOffset + 1;
        }
        var iso = cellYear + "-" + String(cellMonth + 1).padStart(2, "0") + "-" + String(dayNum).padStart(2, "0");
        var isToday = (cellYear === today.getFullYear() && cellMonth === today.getMonth() && dayNum === today.getDate());
        var cell = el("div", { class: "cal-cell" + (isToday ? " today" : "") + (otherMonth ? " other-month" : "") }, [
          el("div", { class: "cal-daynum-row" }, [el("div", { class: "cal-daynum" }, [String(dayNum)])])
        ]);
        var dayEvents = visibleEventos.filter(function (e) { return e.fecha === iso; });
        var maxShow = 3;
        dayEvents.slice(0, maxShow).forEach(function (e) {
          var c = e.comisionId ? S.getComision(comisiones, e.comisionId) : null;
          var pill = el("div", { class: "cal-evt" }, [e.titulo]);
          pill.style.background = c ? c.color : "var(--ink)";
          pill.title = e.titulo;
          cell.appendChild(pill);
        });
        if (dayEvents.length > maxShow) {
          var more = el("div", { class: "cal-evt-more" }, ["+" + (dayEvents.length - maxShow) + " más"]);
          more.addEventListener("click", (function (evList) { return function () {
            global.NG_MODAL.open("Eventos — " + U.fmtFecha(evList[0].fecha), evList.map(function (e) { return "• " + e.titulo; }).join("\n"));
          }; })(dayEvents));
          cell.appendChild(more);
        }
        grid.appendChild(cell);
      }

      listWrap.innerHTML = "";
      listWrap.appendChild(el("div", { class: "section-title" }, ["Próximos eventos"]));
      var upcoming = visibleEventos.filter(function (e) { return U.diasRestantes(e.fecha, today) >= 0; });
      listWrap.appendChild(S.eventListSection(upcoming, comisiones));
    }
    prev.addEventListener("click", function () { global.NG_STATE.calMonth--; if (global.NG_STATE.calMonth < 0) { global.NG_STATE.calMonth = 11; global.NG_STATE.calYear--; } draw(); });
    next.addEventListener("click", function () { global.NG_STATE.calMonth++; if (global.NG_STATE.calMonth > 11) { global.NG_STATE.calMonth = 0; global.NG_STATE.calYear++; } draw(); });
    todayBtn.addEventListener("click", function () { global.NG_STATE.calMonth = global.NG_STATE.today.getMonth(); global.NG_STATE.calYear = global.NG_STATE.today.getFullYear(); draw(); });
    draw();
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.tareas = viewTareas;
  global.NG_VIEWS.calendario = viewCalendario;
})(window);
