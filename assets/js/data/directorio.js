/* =====================================================================
 * data/directorio.js — Lista de personas por comisión/comando/rol.
 * Reutiliza el árbol que ya arma data/comisiones.js (no duplica queries);
 * RLS ya se encarga de que Miembro/Colaborador reciban una lista vacía
 * si intentan leer esto sin permiso (ver membresias_select en rls-policies.sql).
 * ===================================================================== */
(function (global) {
  "use strict";

  async function listarDirectorio() {
    var comisiones = await global.NG_DATA.comisiones.listar();
    var filas = [];
    comisiones.forEach(function (c) {
      c.subgrupos.forEach(function (s) {
        filas.push({ nombre: s.coordinador, rol: "Coordinador/a", comision: c.nombre, comando: s.nombre, color: c.color });
        (s.miembros || []).filter(function (m) { return m !== s.coordinador; }).forEach(function (m) {
          filas.push({ nombre: m, rol: "Miembro", comision: c.nombre, comando: s.nombre, color: c.color });
        });
      });
    });
    return filas;
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.directorio = { listar: listarDirectorio };
})(window);
