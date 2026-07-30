/* =====================================================================
 * views/comunicaciones-enlaces.js — Feed de Comunicados y biblioteca
 * de Enlaces compartidos.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var S = global.NG_SHARED, H = global.NG_VIEW_HELPERS;

  async function viewComunicaciones() {
    H.setTitle("Comunicados");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var comunicados = await global.NG_DATA.comunicados.listar();
    var canPost = global.NG_PERMS.canPostComunicado(p);
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Comunicados"]), el("p", {}, ["Anuncios generales y por comisión."])]),
      canPost ? S.actionBtn("+ Nuevo comunicado", function () { global.NG_openNuevoComunicadoModal(p, comisiones); }) : null
    ].filter(Boolean)));

    var misComisiones = global.NG_PERMS.misComisionIds(p); // null = Dirección, ve todo
    var visibles = comunicados.filter(function (c) {
      if (p.rol === "direccion") return true;
      if (c.alcance === "general") return true;
      return misComisiones.indexOf(c.comisionId) >= 0;
    }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

    var toolbar = el("div", { class: "toolbar" });
    var filter = el("select", {}, [el("option", { value: "" }, ["Todos"]), el("option", { value: "general" }, ["Solo generales"])]);
    toolbar.appendChild(filter);
    root.appendChild(toolbar);

    var container = el("div", { class: "grid grid-cols-2" });
    root.appendChild(container);
    function draw() {
      container.innerHTML = "";
      var f = filter.value === "general" ? visibles.filter(function (c) { return c.alcance === "general"; }) : visibles;
      if (!f.length) { container.appendChild(el("div", { class: "empty-state" }, ["No hay comunicados para mostrar."])); return; }
      f.forEach(function (c) { container.appendChild(S.comunicadoCard(c, comisiones, p)); });
    }
    filter.addEventListener("change", draw);
    draw();
  }

  async function viewEnlaces() {
    H.setTitle("Enlaces");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var enlaces = await global.NG_DATA.enlaces.listar();
    var canPost = global.NG_PERMS.canPostEnlaceOEvento(p);
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Enlaces"]), el("p", {}, ["Formularios, Drive y otros recursos publicados por las comisiones."])]),
      canPost ? S.actionBtn("+ Nuevo enlace", function () { global.NG_openNuevoEnlaceModal(p, comisiones); }) : null
    ].filter(Boolean)));

    var toolbar = el("div", { class: "toolbar" });
    var filter = el("select", {});
    filter.appendChild(el("option", { value: "" }, ["Todas las comisiones"]));
    filter.appendChild(el("option", { value: "general" }, ["Solo generales"]));
    comisiones.forEach(function (c) { filter.appendChild(el("option", { value: c.id }, [c.nombre])); });
    toolbar.appendChild(filter);
    root.appendChild(toolbar);

    var container = el("div", { class: "grid grid-cols-2" });
    root.appendChild(container);
    function draw() {
      container.innerHTML = "";
      var f = enlaces;
      if (filter.value === "general") f = f.filter(function (l) { return !l.comisionId; });
      else if (filter.value) f = f.filter(function (l) { return l.comisionId === filter.value; });
      if (!f.length) { container.appendChild(el("div", { class: "empty-state" }, ["No hay enlaces para mostrar."])); return; }
      f.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }).forEach(function (l) { container.appendChild(S.enlaceCard(l, comisiones, p)); });
    }
    filter.addEventListener("change", draw);
    draw();
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.comunicaciones = viewComunicaciones;
  global.NG_VIEWS.enlaces = viewEnlaces;
})(window);
