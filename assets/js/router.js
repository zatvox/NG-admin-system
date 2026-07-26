/* =====================================================================
 * router.js — Enrutador por hash (#/ruta). Cada vista se registra en
 * window.NG_VIEWS desde assets/js/views/*.js ANTES de que este archivo
 * se ejecute (ver orden de <script> en app.html).
 * ===================================================================== */
(function () {
  "use strict";
  var q = window.NG_DOM.q;
  // setTitle/showLoading/noAccessView/crumbs viven en views/shared.js (se
  // cargan ANTES que las vistas, que los necesitan apenas se definen). Este
  // archivo solo hace el despacho de rutas.
  var VH = window.NG_VIEW_HELPERS;

  var ROUTES_PROTEGIDAS = ["dashboard","comisiones","tareas","calendario","directorio","comunicaciones","enlaces","reportes","perfil","configuracion"];

  function route() {
    var hash = location.hash.replace("#/", "");
    var parts = hash.split("/").filter(Boolean);
    var r = parts[0] || "dashboard";
    var persona = window.NG_STATE.persona;

    window.NG_renderNav();

    if (!window.NG_PERMS.canAccess(r, persona) && ROUTES_PROTEGIDAS.indexOf(r) >= 0) {
      VH.setTitle("Sin acceso");
      q("#view-root").innerHTML = "";
      q("#view-root").appendChild(VH.noAccessView(persona));
      return;
    }

    VH.showLoading();
    var V = window.NG_VIEWS;
    var run;
    if (r === "dashboard") run = V.dashboard();
    else if (r === "comisiones" && !parts[1]) run = V.comisiones();
    else if (r === "comisiones" && parts[1]) run = V.comisionDetalle(parts[1]);
    else if (r === "subgrupo" && parts[1]) run = V.subgrupoDetalle(parts[1]);
    else if (r === "tareas") run = V.tareas();
    else if (r === "calendario") run = V.calendario();
    else if (r === "directorio") run = V.directorio();
    else if (r === "comunicaciones") run = V.comunicaciones();
    else if (r === "enlaces") run = V.enlaces();
    else if (r === "reportes") run = V.reportes();
    else if (r === "perfil") run = V.perfil();
    else if (r === "configuracion") run = V.configuracion();
    else { VH.setTitle("No encontrado"); q("#view-root").innerHTML = '<div class="empty-state">Esta pantalla no existe.</div>'; return; }

    Promise.resolve(run).catch(function (err) {
      console.error(err);
      q("#view-root").innerHTML = '<div class="empty-state">' + window.NG_DOM.esc(window.NG_ERR.format(err)) + "</div>";
    });
  }

  window.NG_ROUTER = { route: route };
})();
