/* =====================================================================
 * utils.js — Funciones auxiliares puras (fechas, texto, slugs).
 * Sin dependencias de DOM ni de Supabase: fáciles de testear a futuro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MESES = ["enero","febrero","marzo","abril","mayo","junio","julio",
    "agosto","septiembre","octubre","noviembre","diciembre"];
  var DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  var DOW = ["lun","mar","mié","jue","vie","sáb","dom"];

  function slugify(s) {
    return String(s).toLowerCase()
      .normalize("NFD").replace(new RegExp("[̀-ͯ]", "g"), "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtFecha(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    return d.getDate() + " " + MESES[d.getMonth()].slice(0, 3) + ".";
  }

  function fmtLargeDate(d) {
    return DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES[d.getMonth()];
  }

  function diasRestantes(iso, hoy) {
    var d = new Date(iso + "T00:00:00");
    var base = hoy || new Date();
    base = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    return Math.round((d - base) / 86400000);
  }

  function initials(nombre) {
    var parts = String(nombre || "").trim().split(/\s+/);
    return ((parts[0] || "")[0] || "") + ((parts[1] || "")[0] || "");
  }

  function sum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }

  // Debounce simple para inputs de búsqueda (evita golpear Supabase en cada tecla).
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 250);
    };
  }

  global.NG_UTILS = {
    MESES: MESES, DIAS: DIAS, DOW: DOW,
    slugify: slugify, isoDate: isoDate, fmtFecha: fmtFecha, fmtLargeDate: fmtLargeDate,
    diasRestantes: diasRestantes, initials: initials, sum: sum, debounce: debounce
  };
})(window);
