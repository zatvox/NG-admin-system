/* =====================================================================
 * views/completar-perfil.js — Wizard "Completar mi perfil" (Etapa 3 del
 * sistema de puntaje). 5 pasos, uno por cada regla PROFILE_* que SÍ
 * depende de datos que el miembro llena (PROFILE_ACCOUNT queda fuera:
 * se acredita solo cuando Dirección aprueba la cuenta, migración 0013).
 *
 * Cada paso se guarda por separado con actualizarPerfilExtendido() —
 * así nadie pierde lo ya llenado si cierra el navegador a mitad de
 * camino. Guardar dispara el trigger fn_acreditar_perfil en la base;
 * este archivo solo junta los datos y los manda, ninguna lógica de
 * puntaje vive acá (ver ARCHITECTURE.md, "nada de lógica crítica en
 * el cliente").
 *
 * Acceso: NO tiene entrada en el menú lateral a propósito — es una
 * pantalla que se llega desde el CTA "Completar mi perfil" de Mi
 * Puntuación o de Mi Perfil, nunca por navegación libre (ver decisión
 * en el handoff: "sin gate duro, solo CTA alcanzable").
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var H = global.NG_VIEW_HELPERS;

  var INTERESES_CIVICOS = [
    "Educación", "Salud", "Seguridad ciudadana", "Medio ambiente",
    "Economía y empleo", "Vivienda y urbanismo", "Transporte público",
    "Derechos humanos", "Cultura y deporte", "Tecnología e innovación",
    "Igualdad de género", "Lucha contra la corrupción"
  ];

  var PASOS = [
    { key: "identidad", titulo: "Identidad", regla: "PROFILE_IDENTITY" },
    { key: "territorio", titulo: "Territorio", regla: "PROFILE_TERRITORY" },
    { key: "contacto", titulo: "Contacto", regla: "PROFILE_CONTACT" },
    { key: "formacion", titulo: "Formación y ocupación", regla: "PROFILE_EDUCATION_OCCUPATION" },
    { key: "acerca", titulo: "Acerca de mí", regla: "PROFILE_ABOUT" }
  ];

  async function viewCompletarPerfil() {
    H.setTitle("Completar mi perfil", "Suma puntos llenando cada sección");
    var root = q("#view-root"); root.innerHTML = "";
    var p = global.NG_STATE.persona;

    if (global.NG_AUTH.isDemo) {
      root.appendChild(el("div", { class: "empty-state" }, ["El modo demo no guarda cambios de perfil — conéctate con una cuenta real para completar tu perfil."]));
      return;
    }

    // Reglamento (para mostrar cuántos puntos vale cada paso, si ya hay
    // una versión cargada) — puramente informativo, no bloquea nada.
    var reglamento = null;
    try { reglamento = await global.NG_DATA.puntaje.obtenerReglamento(); } catch (e) { /* sin bloquear el wizard por esto */ }
    var puntosPorRegla = {};
    if (reglamento && reglamento.perfil) {
      reglamento.perfil.forEach(function (r) { puntosPorRegla[r.rule_code] = r.amount; });
    }

    var estadoPaso = 0;
    var datos = {
      dni: p.dni || "",
      pais: p.pais || "Perú",
      region: p.region || "", provincia: p.provincia || "", distrito: p.distrito || "",
      telefono: p.telefono || "",
      formacionAcademica: p.formacionAcademica || "", ocupacion: p.ocupacion || "",
      acercaDeMi: p.acercaDeMi || "", interesesCivicos: (p.interesesCivicos || []).slice()
    };

    var wrap = el("div", { class: "card", style: "max-width:560px;" });
    root.appendChild(wrap);

    // ---- indicador de pasos ----
    var stepsRow = el("div", { style: "display:flex;gap:6px;margin-bottom:18px;" });
    PASOS.forEach(function (paso, i) {
      stepsRow.appendChild(el("div", {
        style: "flex:1;height:4px;border-radius:4px;background:" + (i <= estadoPaso ? "var(--accent)" : "var(--border,#E4E7EC)") + ";"
      }));
    });
    wrap.appendChild(stepsRow);

    var body = el("div", {});
    wrap.appendChild(body);

    var errBox = el("div", { class: "form-error", style: "display:none;background:#FBE9E7;color:var(--danger);border-radius:8px;padding:10px 12px;font-size:12.5px;margin-bottom:10px;" });

    var nav = el("div", { style: "display:flex;justify-content:space-between;margin-top:16px;" });
    var backBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Atrás"]);
    var nextBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar y continuar"]);
    nav.appendChild(backBtn); nav.appendChild(nextBtn);
    wrap.appendChild(nav);

    function field(labelText, input) {
      return el("div", { class: "field" }, [el("label", {}, [labelText]), input]);
    }

    function pesoNota(regla) {
      var pts = puntosPorRegla[regla];
      return pts ? " (+" + pts + " pts)" : "";
    }

    function render() {
      var paso = PASOS[estadoPaso];
      body.innerHTML = "";
      body.appendChild(errBox);
      errBox.style.display = "none";
      body.appendChild(el("div", { class: "section-title" }, [
        "Paso " + (estadoPaso + 1) + " de " + PASOS.length + " — " + paso.titulo + pesoNota(paso.regla)
      ]));

      if (paso.key === "identidad") {
        body.appendChild(field("Nombre completo", el("input", { type: "text", value: p.nombre, disabled: true })));
        var dniInput = el("input", { type: "text", value: datos.dni, placeholder: "Tu DNI" });
        dniInput.addEventListener("input", function () { datos.dni = dniInput.value.trim(); });
        body.appendChild(field("DNI", dniInput));
        body.appendChild(el("p", { style: "font-size:12px;color:var(--text-faint);" }, ["El nombre se edita desde Mi Perfil."]));
      } else if (paso.key === "territorio") {
        var listaPaises = (global.NG_DATA.paises && global.NG_DATA.paises.listar()) || ["Perú"];
        var paisSelect = el("select", {});
        listaPaises.forEach(function (pa) { paisSelect.appendChild(el("option", { value: pa }, [pa])); });
        paisSelect.value = datos.pais;
        paisSelect.addEventListener("change", function () {
          datos.pais = paisSelect.value;
          // Al cambiar de país, región/provincia/distrito ya no aplican
          // (ej. una región peruana no tiene sentido si ahora eligió
          // otro país) — se limpian y se vuelve a pintar el paso.
          datos.region = ""; datos.provincia = ""; datos.distrito = "";
          render();
        });
        body.appendChild(field("País", paisSelect));

        if (datos.pais === "Perú" && global.NG_DATA.ubigeo) {
          var U = global.NG_DATA.ubigeo;
          var regionSelect = el("select", {});
          var provinciaSelect = el("select", {});
          var distritoSelect = el("select", {});

          function pintarRegiones() {
            regionSelect.innerHTML = "";
            regionSelect.appendChild(el("option", { value: "" }, ["Selecciona una región"]));
            U.regiones().forEach(function (r) { regionSelect.appendChild(el("option", { value: r }, [r])); });
            regionSelect.value = datos.region;
          }
          function pintarProvincias() {
            provinciaSelect.innerHTML = "";
            provinciaSelect.appendChild(el("option", { value: "" }, ["Selecciona una provincia"]));
            U.provincias(datos.region).forEach(function (pr) { provinciaSelect.appendChild(el("option", { value: pr }, [pr])); });
            provinciaSelect.value = datos.provincia;
            provinciaSelect.disabled = !datos.region;
          }
          function pintarDistritos() {
            distritoSelect.innerHTML = "";
            distritoSelect.appendChild(el("option", { value: "" }, ["Selecciona un distrito"]));
            U.distritos(datos.region, datos.provincia).forEach(function (d) { distritoSelect.appendChild(el("option", { value: d }, [d])); });
            distritoSelect.value = datos.distrito;
            distritoSelect.disabled = !datos.provincia;
          }

          regionSelect.addEventListener("change", function () {
            datos.region = regionSelect.value; datos.provincia = ""; datos.distrito = "";
            pintarProvincias(); pintarDistritos();
          });
          provinciaSelect.addEventListener("change", function () {
            datos.provincia = provinciaSelect.value; datos.distrito = "";
            pintarDistritos();
          });
          distritoSelect.addEventListener("change", function () { datos.distrito = distritoSelect.value; });

          pintarRegiones(); pintarProvincias(); pintarDistritos();

          body.appendChild(field("Región", regionSelect));
          body.appendChild(field("Provincia", provinciaSelect));
          body.appendChild(field("Distrito", distritoSelect));
        } else {
          var regionInput = el("input", { type: "text", value: datos.region, placeholder: "Región / estado / provincia" });
          regionInput.addEventListener("input", function () { datos.region = regionInput.value.trim(); });
          var provinciaInput = el("input", { type: "text", value: datos.provincia, placeholder: "Provincia / condado" });
          provinciaInput.addEventListener("input", function () { datos.provincia = provinciaInput.value.trim(); });
          var distritoInput = el("input", { type: "text", value: datos.distrito, placeholder: "Distrito / ciudad" });
          distritoInput.addEventListener("input", function () { datos.distrito = distritoInput.value.trim(); });
          body.appendChild(field("Región *", regionInput));
          body.appendChild(field("Provincia *", provinciaInput));
          body.appendChild(field("Distrito *", distritoInput));
          body.appendChild(el("p", { style: "font-size:12px;color:var(--text-faint);" }, ["Perú tiene selección guiada. Para otros países, completa estos 3 campos manualmente — son obligatorios."]));
        }
      } else if (paso.key === "contacto") {
        body.appendChild(field("Correo", el("input", { type: "email", value: p.email, disabled: true })));
        var telInput = el("input", { type: "tel", value: datos.telefono, placeholder: "Tu teléfono" });
        telInput.addEventListener("input", function () { datos.telefono = telInput.value.trim(); });
        body.appendChild(field("Teléfono", telInput));
      } else if (paso.key === "formacion") {
        var formInput = el("input", { type: "text", value: datos.formacionAcademica, placeholder: "Ej. Bachiller en Ingeniería" });
        formInput.addEventListener("input", function () { datos.formacionAcademica = formInput.value.trim(); });
        var ocupInput = el("input", { type: "text", value: datos.ocupacion, placeholder: "Ej. Docente, comerciante, estudiante" });
        ocupInput.addEventListener("input", function () { datos.ocupacion = ocupInput.value.trim(); });
        body.appendChild(field("Formación académica", formInput));
        body.appendChild(field("Ocupación", ocupInput));
      } else if (paso.key === "acerca") {
        var bioInput = el("textarea", { rows: 4, placeholder: "Cuéntanos brevemente quién eres y por qué te sumaste." }, [datos.acercaDeMi]);
        bioInput.addEventListener("input", function () { datos.acercaDeMi = bioInput.value.trim(); });
        body.appendChild(field("Acerca de mí", bioInput));

        body.appendChild(el("label", { style: "display:block;margin:12px 0 6px;font-size:12.5px;color:var(--text-soft);" }, ["Intereses cívicos (opcional)"]));
        var chipsWrap = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;" });
        INTERESES_CIVICOS.forEach(function (tag) {
          var chip = el("span", { class: "chip filter-chip" + (datos.interesesCivicos.indexOf(tag) >= 0 ? " chip-active" : "") }, [tag]);
          chip.addEventListener("click", function () {
            var idx = datos.interesesCivicos.indexOf(tag);
            if (idx >= 0) datos.interesesCivicos.splice(idx, 1); else datos.interesesCivicos.push(tag);
            chip.classList.toggle("chip-active");
          });
          chipsWrap.appendChild(chip);
        });
        body.appendChild(chipsWrap);
      }

      backBtn.style.visibility = estadoPaso === 0 ? "hidden" : "visible";
      nextBtn.textContent = estadoPaso === PASOS.length - 1 ? "Finalizar" : "Guardar y continuar";

      // Repinta la barra de progreso.
      Array.prototype.forEach.call(stepsRow.children, function (barra, i) {
        barra.style.background = i <= estadoPaso ? "var(--accent)" : "var(--border,#E4E7EC)";
      });
    }

    function payloadDelPaso(paso) {
      if (paso.key === "identidad") return { dni: datos.dni };
      if (paso.key === "territorio") return { pais: datos.pais, region: datos.region, provincia: datos.provincia, distrito: datos.distrito };
      if (paso.key === "contacto") return { telefono: datos.telefono };
      if (paso.key === "formacion") return { formacionAcademica: datos.formacionAcademica, ocupacion: datos.ocupacion };
      return { acercaDeMi: datos.acercaDeMi, interesesCivicos: datos.interesesCivicos };
    }

    function validarPaso(paso) {
      // Perú usa selects (ya vienen acotados al catálogo); para otro país,
      // región/provincia/distrito son texto libre y por eso obligatorio
      // llenarlos los 3 — si no, no hay forma de ubicar al miembro.
      if (paso.key === "territorio" && datos.pais !== "Perú") {
        if (!datos.region || !datos.provincia || !datos.distrito) {
          return "Completa región, provincia y distrito (los 3 son obligatorios fuera de Perú).";
        }
      }
      return null;
    }

    backBtn.addEventListener("click", function () {
      if (estadoPaso === 0) return;
      estadoPaso--; render();
    });

    nextBtn.addEventListener("click", function () {
      var paso = PASOS[estadoPaso];
      var errorValidacion = validarPaso(paso);
      if (errorValidacion) {
        errBox.textContent = errorValidacion;
        errBox.style.display = "block";
        return;
      }
      nextBtn.disabled = true;
      var textoOriginal = nextBtn.textContent;
      nextBtn.textContent = "Guardando…";
      global.NG_DATA.usuarios.actualizarPerfilExtendido(payloadDelPaso(paso))
        .then(function () {
          nextBtn.disabled = false; nextBtn.textContent = textoOriginal;
          if (estadoPaso < PASOS.length - 1) {
            estadoPaso++; render();
          } else {
            global.NG_TOAST.show("Perfil completado. ¡Gracias por sumar tus datos!", "success");
            if (global.NG_refreshPersonaAndGo) global.NG_refreshPersonaAndGo("#/puntuacion");
            else location.hash = "#/puntuacion";
          }
        })
        .catch(function (err) {
          nextBtn.disabled = false; nextBtn.textContent = textoOriginal;
          errBox.textContent = global.NG_ERR.format(err);
          errBox.style.display = "block";
        });
    });

    render();
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS["completar-perfil"] = viewCompletarPerfil;
})(window);
