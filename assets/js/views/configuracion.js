/* =====================================================================
 * views/configuracion.js — Módulo "Configuración", exclusivo de
 * Dirección General (ver NG_PERMS.NAV y rls-policies.sql →
 * configuracion_write). Aquí se edita todo lo que antes había que
 * tocar en config.js o directamente en la base de datos: nombre de la
 * organización, colores de marca, y parámetros de negocio. Guardar
 * escribe en la tabla `configuracion` (o en memoria, en modo demo) y
 * refresca el tema visual al instante.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var H = global.NG_VIEW_HELPERS, S = global.NG_SHARED;

  var CAMPOS = [
    { clave: "organizacion.nombre", label: "Nombre de la organización", tipo: "text", grupo: "Identidad" },
    { clave: "organizacion.eslogan", label: "Eslogan / subtítulo", tipo: "text", grupo: "Identidad" },
    { clave: "marca.color_primario", label: "Color primario (sidebar, botones)", tipo: "color", grupo: "Identidad" },
    { clave: "marca.color_acento", label: "Color de acento (destacados, hoy en calendario)", tipo: "color", grupo: "Identidad" },
    { clave: "negocio.dias_aviso_vencimiento", label: "Días de aviso antes de que una tarea venza", tipo: "number", grupo: "Parámetros de negocio" },
    { clave: "negocio.max_contactos_por_persona", label: "Máximo de contactos por persona (campañas de Organización)", tipo: "number", grupo: "Parámetros de negocio" },
    { clave: "notificaciones.activas", label: "Notificaciones in-app activas", tipo: "checkbox", grupo: "Notificaciones" }
  ];

  async function viewConfiguracion() {
    H.setTitle("Configuración", "Solo Dirección General");
    var root = q("#view-root"); root.innerHTML = "";
    var valores = await global.NG_DATA.configuracion.obtener();

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h1", {}, ["Configuración"]),
        el("p", {}, ["Personaliza nombre, colores y parámetros de negocio sin tocar código ni la base de datos directamente. Solo Dirección ve y edita esta pantalla."])
      ])
    ]));

    if (!global.NG_AUTH.isDemo) {
      root.appendChild(el("div", { class: "empty-state", style: "text-align:left;margin-bottom:22px;" }, [
        "Estos cambios se guardan en la tabla configuracion de Supabase y los ve toda la organización al recargar la página."
      ]));
    } else {
      root.appendChild(el("div", { class: "empty-state", style: "text-align:left;margin-bottom:22px;" }, [
        "Modo demo: los cambios se aplican en esta sesión (verás el tema cambiar al instante) pero no se guardan al recargar — se guardarán de verdad en cuanto conectes Supabase."
      ]));
    }

    var grupos = {};
    CAMPOS.forEach(function (c) { (grupos[c.grupo] = grupos[c.grupo] || []).push(c); });

    var inputs = {};
    Object.keys(grupos).forEach(function (nombreGrupo) {
      root.appendChild(el("div", { class: "section-title" }, [nombreGrupo]));
      var card = el("div", { class: "card" });
      grupos[nombreGrupo].forEach(function (campo) {
        var field = el("div", { class: "modal-field" });
        field.appendChild(el("label", {}, [campo.label]));
        var input;
        if (campo.tipo === "checkbox") {
          var row = el("div", { class: "toggle-row" }, [el("span", {}, [campo.label])]);
          var sw = el("label", { class: "switch" });
          input = el("input", { type: "checkbox" });
          if (valores[campo.clave]) input.setAttribute("checked", "checked");
          sw.appendChild(input); sw.appendChild(el("span", { class: "slider" }));
          row.appendChild(sw);
          card.appendChild(row);
          inputs[campo.clave] = input;
          return; // el toggle ya trae su propio label, no dupliques el field genérico
        } else if (campo.tipo === "color") {
          input = el("input", { type: "color", value: valores[campo.clave] || "#16213E", style: "height:40px;padding:4px;" });
        } else {
          input = el("input", { type: campo.tipo === "number" ? "text" : "text", value: String(valores[campo.clave] != null ? valores[campo.clave] : "") });
        }
        field.appendChild(input);
        card.appendChild(field);
        inputs[campo.clave] = input;
      });
      root.appendChild(card);
    });

    var footRow = el("div", { style: "display:flex;gap:10px;margin-top:20px;" });
    var saveBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar cambios"]);
    var previewNote = el("span", { style: "font-size:12px;color:var(--text-faint);align-self:center;" }, [""]);
    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
      var promesas = CAMPOS.map(function (campo) {
        var input = inputs[campo.clave];
        var valor = campo.tipo === "checkbox" ? input.checked : (campo.tipo === "number" ? Number(input.value) : input.value);
        return global.NG_DATA.configuracion.guardar(campo.clave, valor, campo.label);
      });
      Promise.all(promesas)
        .then(function () {
          saveBtn.disabled = false; saveBtn.textContent = "Guardar cambios";
          global.NG_TOAST.show("Configuración guardada.", "success");
          return global.NG_DATA.configuracion.obtener();
        })
        .then(function (nuevos) {
          global.NG_STATE.appConfig = nuevos;
          // Aplica el nuevo tema/nombre en vivo, sin recargar la página.
          if (window.NG_applyBrandingLive) window.NG_applyBrandingLive(nuevos);
        })
        .catch(function (err) {
          saveBtn.disabled = false; saveBtn.textContent = "Guardar cambios";
          global.NG_TOAST.show(global.NG_ERR.format(err), "error");
        });
    });
    footRow.appendChild(saveBtn); footRow.appendChild(previewNote);
    root.appendChild(footRow);

    // Referencia de solo lectura: quién lidera cada comisión hoy (para
    // recordar a Dirección que la reasignación de líderes se hace por SQL /
    // panel de Supabase por ahora — ver ARCHITECTURE.md "próximos pasos").
    var comisiones = await global.NG_DATA.comisiones.listar();
    root.appendChild(el("div", { class: "section-title" }, ["Comisiones y líderes actuales"]));
    root.appendChild(tablaComisiones(comisiones));
  }

  function tablaComisiones(comisiones) {
    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Comisión"]), el("th", {}, ["Líder"]), el("th", {}, ["Comandos"])])]);
    comisiones.forEach(function (c) {
      table.appendChild(el("tr", {}, [
        el("td", {}, [el("span", { class: "dot", style: "background:" + c.color }), c.nombre]),
        el("td", {}, [c.lider || "Sin asignar"]),
        el("td", {}, [String(c.subgrupos.length)])
      ]));
    });
    tw.appendChild(table);
    return tw;
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.configuracion = viewConfiguracion;
})(window);
