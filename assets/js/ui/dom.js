/* =====================================================================
 * ui/dom.js — Helpers mínimos para construir DOM sin framework.
 * Se usan en TODAS las vistas (assets/js/views/*.js). Sin dependencias.
 * ===================================================================== */
(function (global) {
  "use strict";

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Crea un elemento DOM: el('div', {class:'x'}, ['texto', otroElemento])
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === "class") e.className = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  // Escapa texto de usuario antes de insertarlo como HTML crudo.
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  global.NG_DOM = { q: q, qa: qa, el: el, esc: esc };
})(window);
