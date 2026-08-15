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

    // (2026-07-30) Chips por comisión (multi-selección) en vez del select de
    // "Todos/Solo generales" — solo se listan las comisiones que de verdad
    // aparecen en "visibles" (no tiene sentido un chip de una comisión de la
    // que no puedes ver nada).
    var comisionesConComunicados = {};
    visibles.forEach(function (c) { if (c.comisionId) comisionesConComunicados[c.comisionId] = true; });
    var chipsComisiones = comisiones.filter(function (c) { return comisionesConComunicados[c.id]; });

    var container = el("div", { class: "grid grid-cols-2" });
    function draw() {
      container.innerHTML = "";
      var f = visibles.filter(function (c) { return barra.pasaFiltro(c.comisionId); });
      if (!f.length) { container.appendChild(el("div", { class: "empty-state" }, ["No hay comunicados para mostrar."])); return; }
      f.forEach(function (c) { container.appendChild(S.comunicadoCard(c, comisiones, p)); });
    }
    var barra = S.comisionFilterBar(chipsComisiones, { incluirGeneral: true, onChange: draw });
    root.appendChild(barra.el);
    root.appendChild(container);
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

    // (2026-07-30) Chips por comisión (multi-selección) en vez del select de
    // una sola opción — Enlaces sigue siendo biblioteca abierta a todos, así
    // que aquí sí se listan TODAS las comisiones (no solo las "mías").
    var container = el("div", { class: "grid grid-cols-2" });
    function draw() {
      container.innerHTML = "";
      var f = enlaces.filter(function (l) { return barra.pasaFiltro(l.comisionId); });
      if (!f.length) { container.appendChild(el("div", { class: "empty-state" }, ["No hay enlaces para mostrar."])); return; }
      f.slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }).forEach(function (l) { container.appendChild(S.enlaceCard(l, comisiones, p)); });
    }
    var barra = S.comisionFilterBar(comisiones, { incluirGeneral: true, onChange: draw });
    root.appendChild(barra.el);
    root.appendChild(container);
    draw();
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.comunicaciones = viewComunicaciones;
  global.NG_VIEWS.enlaces = viewEnlaces;
})(window);
