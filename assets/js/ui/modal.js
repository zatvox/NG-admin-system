/* =====================================================================
 * ui/modal.js — Modal informativo + modal de formulario genérico.
 * Requiere <div id="modal-overlay"><div id="modal-box"></div></div> en
 * el HTML. Los formularios que crea openFormModal() SÍ escriben en
 * Supabase cuando NG_DB existe (ver cfg.onSave); en modo demo solo
 * muestran el toast de confirmación, igual que en la demo original.
 * ===================================================================== */
(function (global) {
  "use strict";
  var el = global.NG_DOM.el, q = global.NG_DOM.q;

  function closeModal() {
    var overlay = q("#modal-overlay");
    if (overlay) overlay.style.display = "none";
  }

  function openModal(title, text) {
    var box = q("#modal-box");
    box.innerHTML = "";
    box.appendChild(el("div", { class: "modal-head" }, [el("h3", {}, [title || "Aviso"])]));
    box.appendChild(el("div", { class: "modal-body" }, [el("p", {}, [text || ""])]));
    var foot = el("div", { class: "modal-foot" });
    var okBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Entendido"]);
    okBtn.addEventListener("click", closeModal);
    foot.appendChild(okBtn);
    box.appendChild(foot);
    q("#modal-overlay").style.display = "flex";
  }

  /* cfg = {
   *   title, subtitle, entityLabel, fields:[{name,label,type,options,placeholder,value,required,hint}],
   *   onSave: async function(values) -> debe hacer el insert/update real cuando NG_DB existe.
   *           Si no se pasa onSave, el modal solo confirma visualmente (modo demo puro).
   * } */
  function openFormModal(cfg) {
    var box = q("#modal-box");
    box.innerHTML = "";

    var headText = el("div", {}, [el("h3", {}, [cfg.title])]);
    if (cfg.subtitle) headText.appendChild(el("p", {}, [cfg.subtitle]));
    var closeX = el("button", { class: "modal-close-x", type: "button", "aria-label": "Cerrar" }, ["✕"]);
    closeX.addEventListener("click", closeModal);
    box.appendChild(el("div", { class: "modal-head" }, [headText, closeX]));

    var body = el("div", { class: "modal-body" });
    var formWrap = el("div", {});
    var inputs = {};
    cfg.fields.forEach(function (f) {
      var field = el("div", { class: "modal-field" });
      field.appendChild(el("label", {}, [f.label + (f.required ? " *" : "")]));
      var input;
      if (f.type === "textarea") {
        input = el("textarea", { placeholder: f.placeholder || "" });
        if (f.value) input.value = f.value;
      } else if (f.type === "select") {
        input = el("select", {});
        (f.options || []).forEach(function (o) {
          var opt = el("option", { value: o.value }, [o.label]);
          if (o.value === f.value) opt.setAttribute("selected", "selected");
          input.appendChild(opt);
        });
      } else if (f.type === "userpicker") {
        // Multi-select buscable: campo de texto arriba + lista de checkboxes
        // abajo. Cada letra que se escribe filtra la lista comparando contra
        // el nombre completo (equivalente en el cliente a un ILIKE '%texto%'
        // — mismo criterio de "contiene", insensible a mayúsculas).
        input = el("div", { class: "userpicker" });
        var seleccionados = {}; // usuario_id -> nombre, para poder mostrar un resumen
        var searchBox = el("input", { type: "text", placeholder: f.placeholder || "Escribe un nombre para filtrar…" });
        var listBox = el("div", { class: "userpicker-list" });
        var opciones = f.options || [];

        function renderLista(filtro) {
          listBox.innerHTML = "";
          var texto = (filtro || "").trim().toLowerCase();
          var filtradas = texto
            ? opciones.filter(function (o) { return o.label.toLowerCase().indexOf(texto) >= 0; })
            : opciones;
          if (!filtradas.length) {
            listBox.appendChild(el("div", { class: "userpicker-empty" }, [
              opciones.length ? "Nadie coincide con \"" + filtro + "\"." : "No hay usuarios disponibles para asignar todavía en esta comisión."
            ]));
            return;
          }
          filtradas.forEach(function (o) {
            var row = el("label", { class: "userpicker-row" });
            var cb = el("input", { type: "checkbox" });
            cb.checked = !!seleccionados[o.value];
            cb.addEventListener("change", function () {
              if (cb.checked) seleccionados[o.value] = o.label; else delete seleccionados[o.value];
            });
            row.appendChild(cb);
            row.appendChild(document.createTextNode(" " + o.label));
            listBox.appendChild(row);
          });
        }
        searchBox.addEventListener("input", function () { renderLista(searchBox.value); });
        renderLista("");

        input.appendChild(searchBox);
        input.appendChild(listBox);
        // El resto de openFormModal trata cfg.fields como si cada uno tuviera
        // un <input>/<select> con .value — se imita eso con un getter para no
        // duplicar la lógica de "required" ni la de armar `values` al guardar.
        Object.defineProperty(input, "value", { get: function () { return Object.keys(seleccionados); } });
      } else {
        input = el("input", { type: f.type || "text", placeholder: f.placeholder || "" });
        if (f.value) input.value = f.value;
      }
      field.appendChild(input);
      if (f.hint) field.appendChild(el("div", { class: "modal-hint" }, [f.hint]));
      formWrap.appendChild(field);
      inputs[f.name] = input;
    });
    body.appendChild(formWrap);
    box.appendChild(body);

    var foot = el("div", { class: "modal-foot" });
    var cancelBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Cancelar"]);
    cancelBtn.addEventListener("click", closeModal);
    var saveBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar"]);
    saveBtn.addEventListener("click", function () {
      // .value puede ser un string (inputs normales) o un array (userpicker,
      // multi-select) — "vacío" significa cosas distintas en cada caso.
      function estaVacio(v) { return Array.isArray(v) ? v.length === 0 : !String(v == null ? "" : v).trim(); }
      var missing = cfg.fields.filter(function (f) { return f.required && estaVacio(inputs[f.name].value); });
      if (missing.length) {
        global.NG_TOAST.show("Completa los campos obligatorios antes de guardar.", "error");
        return;
      }
      var values = {};
      cfg.fields.forEach(function (f) { values[f.name] = inputs[f.name].value; });

      if (typeof cfg.onSave === "function") {
        saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
        Promise.resolve(cfg.onSave(values))
          .then(function () {
            closeModal();
            global.NG_TOAST.show((cfg.entityLabel || "Elemento") + " creado correctamente.", "success");
          })
          .catch(function (err) {
            saveBtn.disabled = false; saveBtn.textContent = "Guardar";
            global.NG_TOAST.show(global.NG_ERR.format(err), "error");
          });
      } else {
        closeModal();
        global.NG_TOAST.show((cfg.entityLabel || "Elemento") + " creado. Falta implementar la base de datos para guardar la información.", "info");
      }
    });
    foot.appendChild(cancelBtn); foot.appendChild(saveBtn);
    box.appendChild(foot);

    q("#modal-overlay").style.display = "flex";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = q("#modal-overlay");
    if (!overlay) return;
    overlay.addEventListener("click", function (e) { if (e.target.id === "modal-overlay") closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.style.display === "flex") closeModal();
    });
  });

  global.NG_MODAL = { open: openModal, openForm: openFormModal, close: closeModal };
})(window);
