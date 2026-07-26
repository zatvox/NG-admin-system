/* =====================================================================
 * ui/toast.js — Notificación flotante de feedback (éxito/error/info).
 * Requiere un <div id="toast"></div> en el HTML de la página.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q;
  var timer;

  function showToast(msg, kind) {
    var t = q("#toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast-base" + (kind ? " toast-" + kind : "");
    t.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(function () { t.classList.remove("show"); }, 4000);
  }

  global.NG_TOAST = { show: showToast };
})(window);
