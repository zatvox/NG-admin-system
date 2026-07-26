/* =====================================================================
 * views/shared.js — Constructores de UI reutilizados por varias vistas
 * (tarjetas de comisión/comando, tablero kanban, listas de tareas y
 * eventos, tarjetas de comunicado/enlace). Evita duplicar esta lógica
 * en cada archivo de views/*.js.
 * ===================================================================== */
(function (global) {
  "use strict";
  var el = global.NG_DOM.el, esc = global.NG_DOM.esc;
  var U = global.NG_UTILS;
  var q = global.NG_DOM.q;
  var ESTADO_LABEL = { pendiente: "Pendiente", en_curso: "En curso", hecho: "Hecho" };

  // ---- Helpers de página (título, loading, sin acceso, breadcrumbs) ----
  // Se definen AQUÍ (no en router.js) a propósito: shared.js carga antes que
  // las vistas en app.html, así que NG_VIEW_HELPERS ya existe cuando cada
  // vista lo lee al definirse. Si viviera en router.js (que carga al final)
  // las vistas lo capturarían como undefined.
  function setTitle(text, subtext) {
    q("#page-title").innerHTML = esc(text) + (subtext ? ' <span class="mono">' + esc(subtext) + "</span>" : "");
  }
  function showLoading() {
    q("#view-root").innerHTML = '<div class="loading-state"><div class="spinner"></div>Cargando…</div>';
  }
  function noAccessView(persona) {
    return el("div", { class: "no-access" }, [
      el("div", { class: "dot" }),
      el("h3", {}, ["Esta sección no está disponible para tu perfil actual"]),
      el("p", {}, ["Estás viendo el sistema como " + persona.nombre + "."])
    ]);
  }
  function crumbs(items) {
    var wrap = el("div", { class: "crumbs" });
    items.forEach(function (it, i) {
      if (i > 0) wrap.appendChild(document.createTextNode("  /  "));
      if (it.href) {
        var a = el("a", {}, [it.label]);
        a.addEventListener("click", function () { location.hash = it.href; });
        wrap.appendChild(a);
      } else {
        wrap.appendChild(document.createTextNode(it.label));
      }
    });
    return wrap;
  }
  global.NG_VIEW_HELPERS = { setTitle: setTitle, showLoading: showLoading, noAccessView: noAccessView, crumbs: crumbs };

  function sum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }

  // Búsquedas dentro del árbol devuelto por NG_DATA.comisiones.listar().
  function getComision(comisiones, id) { return comisiones.filter(function (c) { return c.id === id; })[0] || null; }
  function getSubgrupo(comisiones, id) {
    for (var i = 0; i < comisiones.length; i++) {
      var sub = comisiones[i].subgrupos.filter(function (s) { return s.id === id; })[0];
      if (sub) return { subgrupo: sub, comision: comisiones[i] };
    }
    return null;
  }
  function allTareas(comisiones) {
    var out = [];
    comisiones.forEach(function (c) {
      c.subgrupos.forEach(function (s) {
        s.tareas.forEach(function (t) {
          out.push(Object.assign({}, t, { comisionId: c.id, comisionNombre: c.nombre, comisionColor: c.color, subgrupoId: s.id, subgrupoNombre: s.nombre }));
        });
      });
    });
    return out;
  }
  function kpi(num, label) { return el("div", { class: "kpi" }, [el("div", { class: "stat-num mono" }, [String(num)]), el("div", { class: "stat-lbl" }, [label])]); }

  function comisionCard(c) {
    var abiertas = sum(c.subgrupos.map(function (s) { return s.tareas.filter(function (t) { return t.estado !== "hecho"; }).length; }));
    var card = el("div", { class: "card card-clickable comision-card", style: "--c:" + c.color }, [
      el("div", { class: "comision-head" }, [el("div", { class: "comision-name" }, [c.nombre])]),
      el("div", { class: "comision-lead" }, ["Líder: " + (c.lider || "—")]),
      el("div", { class: "comision-stats" }, [
        el("div", {}, [el("div", { class: "stat-num" }, [String(c.subgrupos.length)]), el("div", { class: "stat-lbl" }, ["Comandos"])]),
        el("div", {}, [el("div", { class: "stat-num" }, [String(abiertas)]), el("div", { class: "stat-lbl" }, ["Tareas abiertas"])])
      ])
    ]);
    card.addEventListener("click", function () { location.hash = "#/comisiones/" + c.id; });
    return card;
  }

  function subgrupoCard(s, c, persona) {
    var pendientes = s.tareas.filter(function (t) { return t.estado !== "hecho"; }).length;
    var allowed = global.NG_PERMS.canAccessSubgrupo(persona, c.id);
    // (2026-07-25) Cualquiera puede ver TODOS los comandos de TODAS las
    // comisiones (lectura abierta, ver rls-policies.sql), pero solo entra
    // al tablero si es de esa comisión — "no clicleable" para el resto.
    // Cualquier persona sin privilegios de estructura (o sea, todos menos
    // Dirección/Líder, que ya tienen acceso total) puede sumarse a un
    // comando ajeno con "Unirme a este comando" — es el paso 2 del
    // auto-enlistamiento (paso 1 = entrar a la comisión desde "Comisiones"
    // / botón "Enlistarse"), y no importa si ya pertenece a otra comisión.
    var puedeUnirse = !allowed && persona.rol !== "direccion" && persona.rol !== "lider";
    var card = el("div", { class: "card" + (allowed ? " card-clickable" : ""), style: (allowed || puedeUnirse) ? "" : "opacity:.6;" }, [
      el("div", { class: "comision-name", style: "font-size:14px;margin-bottom:6px;" }, [s.nombre]),
      el("div", { class: "comision-lead" }, ["Coordinador/a: " + s.coordinador]),
      el("div", { class: "comision-stats" }, [
        el("div", {}, [el("div", { class: "stat-num" }, [String((s.miembros || []).length)]), el("div", { class: "stat-lbl" }, ["Miembros"])]),
        el("div", {}, [el("div", { class: "stat-num" }, [String(pendientes)]), el("div", { class: "stat-lbl" }, ["Pendientes"])])
      ])
    ]);
    if (allowed) {
      card.addEventListener("click", function () { location.hash = "#/subgrupo/" + s.id; });
    } else if (puedeUnirse) {
      var joinBtn = el("button", { class: "btn btn-accent", type: "button", style: "margin-top:10px;font-size:12px;padding:7px 12px;width:100%;" }, ["Unirme a este comando"]);
      joinBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        joinBtn.disabled = true; joinBtn.textContent = "Uniéndote…";
        global.NG_DATA.comisiones.unirseComando(s.id)
          .then(function () {
            global.NG_TOAST.show("Te uniste a " + s.nombre + " como Miembro.", "success");
            if (global.NG_refreshPersonaAndGo) global.NG_refreshPersonaAndGo("#/subgrupo/" + s.id);
          })
          .catch(function (err) {
            joinBtn.disabled = false; joinBtn.textContent = "Unirme a este comando";
            global.NG_TOAST.show(global.NG_ERR.format(err), "error");
          });
      });
      card.appendChild(joinBtn);
    } else {
      card.appendChild(el("div", { style: "font-size:10.5px;color:var(--text-faint);margin-top:10px;font-family:'IBM Plex Mono',monospace;" }, ["Fuera de tu comisión"]));
    }
    return card;
  }

  function taskListSection(title, tareas) {
    var wrap = el("div", {});
    if (title) wrap.appendChild(el("div", { class: "section-title" }, [title]));
    if (!tareas.length) { wrap.appendChild(el("div", { class: "empty-state" }, ["No hay tareas para mostrar."])); return wrap; }
    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Tarea"]), el("th", {}, ["Asignado"]), el("th", {}, ["Fecha"]), el("th", {}, ["Estado"])])]);
    tareas.forEach(function (t) {
      table.appendChild(el("tr", {}, [
        el("td", {}, [t.titulo]), el("td", {}, [t.asignadosNombres || "Sin asignar"]), el("td", { class: "mono" }, [U.fmtFecha(t.fecha)]),
        el("td", {}, [el("span", { class: "badge-estado badge-" + t.estado }, [ESTADO_LABEL[t.estado]])])
      ]));
    });
    tw.appendChild(table); wrap.appendChild(tw);
    return wrap;
  }

  function eventListSection(eventos, comisiones) {
    var wrap = el("div", { class: "cal-list" });
    if (!eventos.length) { wrap.appendChild(el("div", { class: "empty-state" }, ["No hay eventos próximos."])); return wrap; }
    eventos.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }).forEach(function (e) {
      var c = e.comisionId ? comisiones.filter(function (x) { return x.id === e.comisionId; })[0] : null;
      wrap.appendChild(el("div", { class: "cal-list-item" }, [
        el("div", { class: "cal-list-date" }, [U.fmtFecha(e.fecha)]),
        el("div", {}, [
          el("div", { style: "font-weight:600;font-size:13.5px;color:var(--ink);" }, [e.titulo]),
          el("div", { style: "font-size:11.5px;color:var(--text-faint);margin-top:2px;" }, [c ? c.nombre : "Toda la organización"])
        ])
      ]));
    });
    return wrap;
  }

  function taskCard(t, ctx, persona, onChange) {
    var comisionId = ctx ? ctx.comisionId : t.comisionId;
    var subgrupoId = ctx ? ctx.subgrupoId : t.subgrupoId;
    var editable = global.NG_PERMS.canEditTask(persona, t, comisionId, subgrupoId);

    var card = el("div", { class: "task-card" }, [
      el("div", { class: "task-title" }, [t.titulo]),
      el("div", { class: "task-meta" }, [el("span", {}, [(t.asignadosNombres || "Sin asignar") + " · " + U.fmtFecha(t.fecha)])])
    ]);
    if (!editable) {
      card.querySelector(".task-meta").appendChild(el("span", { class: "badge-estado badge-" + t.estado }, [ESTADO_LABEL[t.estado]]));
      return card;
    }
    var select = el("select", { "aria-label": "Cambiar estado" });
    ["pendiente", "en_curso", "hecho"].forEach(function (k) {
      var opt = el("option", { value: k }, [ESTADO_LABEL[k]]);
      if (k === t.estado) opt.setAttribute("selected", "selected");
      select.appendChild(opt);
    });
    select.addEventListener("change", function (e) {
      var nuevo = e.target.value;
      t.estado = nuevo; // reflejo optimista en UI
      global.NG_DATA.comisiones.actualizarEstadoTarea(t.id, nuevo)
        .then(function () { global.NG_TOAST.show('Tarea movida a "' + ESTADO_LABEL[nuevo] + '".', "success"); })
        .catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      if (typeof onChange === "function") onChange(); else global.NG_ROUTER.route();
    });
    card.querySelector(".task-meta").appendChild(select);
    return card;
  }

  function kanbanBoard(tareas, ctx, persona, onChange) {
    var cols = [{ key: "pendiente", label: "Pendiente" }, { key: "en_curso", label: "En curso" }, { key: "hecho", label: "Hecho" }];
    var board = el("div", { class: "kanban" });
    cols.forEach(function (col) {
      var items = tareas.filter(function (t) { return t.estado === col.key; });
      var colEl = el("div", { class: "kanban-col" }, [el("h3", {}, [col.label, el("span", { class: "mono" }, [String(items.length)])])]);
      if (!items.length) colEl.appendChild(el("div", { style: "font-size:11.5px;color:var(--text-faint);padding:6px;" }, ["Sin tareas"]));
      items.forEach(function (t) { colEl.appendChild(taskCard(t, ctx, persona, onChange)); });
      board.appendChild(colEl);
    });
    return board;
  }

  function comunicadoCard(p, comisiones) {
    var c = p.comisionId ? comisiones.filter(function (x) { return x.id === p.comisionId; })[0] : null;
    var card = el("div", { class: "card post-card" });
    card.style.setProperty("--c", c ? c.color : "var(--accent)");
    card.appendChild(el("div", { class: "post-head" }, [el("div", { class: "post-title" }, [p.titulo]), el("span", { class: "chip" }, [c ? c.nombre : "General"])]));
    card.appendChild(el("div", { class: "post-meta" }, [(p.autor || "—") + " · " + U.fmtFecha(p.fecha)]));
    card.appendChild(el("div", { class: "post-body" }, [p.cuerpo]));
    return card;
  }

  function enlaceCard(l, comisiones) {
    var c = l.comisionId ? comisiones.filter(function (x) { return x.id === l.comisionId; })[0] : null;
    var card = el("div", { class: "card post-card" });
    card.style.setProperty("--c", c ? c.color : "var(--accent)");
    card.appendChild(el("div", { class: "post-head" }, [el("div", { class: "post-title" }, [l.nombre]), el("span", { class: "chip" }, [c ? c.nombre : "General"])]));
    card.appendChild(el("div", { class: "post-meta" }, ["Publicado por " + (l.autor || "—") + " · " + U.fmtFecha(l.fecha)]));
    card.appendChild(el("div", { class: "post-body" }, [l.descripcion || ""]));
    var a = el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", class: "btn btn-ghost", style: "margin-top:12px;font-size:12.5px;padding:7px 12px;" }, ["Abrir enlace ↗"]);
    card.appendChild(a);
    return card;
  }

  function rowKV(k, v) { return el("div", { class: "toggle-row" }, [el("span", { style: "color:var(--text-soft);" }, [k]), el("span", { style: "font-weight:600;color:var(--ink);" }, [v])]); }
  function actionBtn(label, onClick) { var b = el("button", { class: "btn btn-accent", type: "button" }, [label]); b.addEventListener("click", onClick); return b; }

  global.NG_SHARED = {
    ESTADO_LABEL: ESTADO_LABEL, sum: sum, kpi: kpi,
    getComision: getComision, getSubgrupo: getSubgrupo, allTareas: allTareas,
    comisionCard: comisionCard, subgrupoCard: subgrupoCard,
    taskListSection: taskListSection, eventListSection: eventListSection,
    taskCard: taskCard, kanbanBoard: kanbanBoard,
    comunicadoCard: comunicadoCard, enlaceCard: enlaceCard,
    rowKV: rowKV, actionBtn: actionBtn
  };
})(window);
