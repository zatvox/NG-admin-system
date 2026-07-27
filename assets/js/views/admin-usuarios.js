/* =====================================================================
 * views/admin-usuarios.js — Panel de administración de cuentas, solo
 * Dirección General. Antes esto SOLO se podía hacer con SQL manual
 * (marcar es_direccion, suspender una cuenta, etc.) — usuarios_update_
 * propio ya lo permitía por RLS (fn_es_direccion() puede editar
 * cualquier fila de "usuarios"), solo faltaba la interfaz.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var H = global.NG_VIEW_HELPERS;

  var ESTADO_OPTIONS = [
    { value: "activo", label: "Activo" },
    { value: "pendiente_activacion", label: "Pendiente de activación" },
    { value: "suspendido", label: "Suspendido" }
  ];

  async function viewUsuarios() {
    H.setTitle("Usuarios");
    var p = global.NG_STATE.persona;
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Usuarios"]), el("p", {}, ["Cuentas registradas en el sistema — visible y editable solo para Dirección General."])])
    ]));

    if (!global.NG_DB) {
      root.appendChild(el("div", { class: "empty-state" }, ["Esto requiere Supabase conectado — no aplica en modo demo."]));
      return;
    }

    var usuarios = await global.NG_DATA.usuarios.listarTodos();
    var container = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [
      el("th", {}, ["Nombre"]), el("th", {}, ["Correo"]), el("th", {}, ["Estado"]), el("th", {}, ["Dirección General"])
    ])]);

    usuarios.forEach(function (u) {
      var estadoSelect = el("select", { "aria-label": "Estado de " + u.nombre, style: "font-size:12px;padding:5px 8px;" });
      ESTADO_OPTIONS.forEach(function (o) {
        var opt = el("option", { value: o.value }, [o.label]);
        if (o.value === u.estado) opt.setAttribute("selected", "selected");
        estadoSelect.appendChild(opt);
      });
      estadoSelect.addEventListener("change", function (e) {
        var nuevo = e.target.value;
        var label = ESTADO_OPTIONS.filter(function (o) { return o.value === nuevo; })[0].label;
        global.NG_DATA.usuarios.actualizarUsuarioAdmin(u.id, { estado: nuevo })
          .then(function () { global.NG_TOAST.show(u.nombre + " ahora está: " + label + ".", "success"); })
          .catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });

      var esPropio = u.id === p.id;
      var esDireccionCheck = el("input", { type: "checkbox", "aria-label": "¿Es Dirección General? — " + u.nombre });
      esDireccionCheck.checked = !!u.es_direccion;
      // No te dejamos quitarte tu propio acceso de Dirección desde esta
      // tabla — evita un auto-bloqueo accidental (te quedarías sin nadie
      // que pueda revertirlo salvo entrando a Supabase directamente).
      if (esPropio) esDireccionCheck.disabled = true;
      esDireccionCheck.addEventListener("change", function (e) {
        var nuevo = e.target.checked;
        global.NG_DATA.usuarios.actualizarUsuarioAdmin(u.id, { esDireccion: nuevo })
          .then(function () { global.NG_TOAST.show(u.nombre + (nuevo ? " ahora es Dirección General." : " ya no es Dirección General."), "success"); })
          .catch(function (err) { e.target.checked = !nuevo; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });

      table.appendChild(el("tr", {}, [
        el("td", {}, [u.nombre]),
        el("td", {}, [u.email]),
        el("td", {}, [estadoSelect]),
        el("td", {}, [esDireccionCheck].concat(esPropio ? [el("span", { style: "font-size:10.5px;color:var(--text-faint);margin-left:6px;" }, ["(tu cuenta)"])] : []))
      ]));
    });
    container.appendChild(table);
    root.appendChild(container);
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.usuarios = viewUsuarios;
})(window);
