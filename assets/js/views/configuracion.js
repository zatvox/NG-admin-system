/* =====================================================================
 * views/configuracion.js — Módulo "Configuración", exclusivo de
 * Dirección General (ver NG_PERMS.NAV y rls-policies.sql →
 * configuracion_write). Cuatro pestañas:
 *   - General: nombre/colores/parámetros de negocio (lo que ya existía).
 *   - Puntaje: Perfil / Asistencia / Resultados y Vigencia: edita el
 *     catálogo del "Reglamento de Puntajes" (assets/js/data/puntaje.js,
 *     tablas scoring_* — ver assets/sql/migrations/0012_...). El motor
 *     que ACREDITA puntos de verdad es una etapa aparte; aquí solo se
 *     definen los valores y se registra la vigencia (acta/hash/fechas).
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var H = global.NG_VIEW_HELPERS, S = global.NG_SHARED;

  var CAMPOS = [
    { clave: "organizacion.nombre", label: "Nombre de la organización", tipo: "text", grupo: "Identidad" },
    { clave: "organizacion.eslogan", label: "Eslogan / subtítulo", tipo: "text", grupo: "Identidad" },
    { clave: "organizacion.fundadores", label: "Fundadores (se muestra en la landing pública, index.html)", tipo: "textarea", grupo: "Identidad" },
    { clave: "marca.color_primario", label: "Color primario (sidebar, botones)", tipo: "color", grupo: "Identidad" },
    { clave: "marca.color_acento", label: "Color de acento (destacados, hoy en calendario)", tipo: "color", grupo: "Identidad" },
    { clave: "negocio.dias_aviso_vencimiento", label: "Días de aviso antes de que una tarea venza", tipo: "number", grupo: "Parámetros de negocio" },
    { clave: "negocio.max_contactos_por_persona", label: "Máximo de contactos por persona (campañas de Organización)", tipo: "number", grupo: "Parámetros de negocio" },
    { clave: "notificaciones.activas", label: "Notificaciones in-app activas", tipo: "checkbox", grupo: "Notificaciones" }
  ];

  var TABS = [
    { key: "general", label: "General" },
    { key: "perfil", label: "Puntaje: Perfil" },
    { key: "asistencia", label: "Puntaje: Asistencia" },
    { key: "resultados", label: "Puntaje: Resultados y Vigencia" }
  ];

  var ETIQUETAS_TIPO = { territorial: "Actividad territorial", virtual: "Reunión virtual", presencial: "Reunión presencial", hibrida: "Reunión híbrida", capacitacion: "Capacitación", asamblea: "Asamblea" };
  var ETIQUETAS_NIVEL = { subcomision: "Subcomisión / Comando", comision: "Comisión", nacional: "Directiva Nacional" };

  async function viewConfiguracion() {
    H.setTitle("Configuración", "Solo Dirección General");
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h1", {}, ["Configuración"]),
        el("p", {}, ["Personaliza la organización y el Reglamento de Puntajes sin tocar código ni la base de datos directamente. Solo Dirección ve y edita esta pantalla."])
      ])
    ]));

    // --- Barra de pestañas -------------------------------------------------
    var chips = {};
    var paneles = {};
    var tabBar = el("div", { class: "filter-row", style: "margin-bottom:20px;flex-wrap:wrap;gap:8px;" });
    TABS.forEach(function (t) {
      var chip = el("button", { class: "chip filter-chip" + (t.key === "general" ? " chip-active" : ""), type: "button" }, [t.label]);
      chip.addEventListener("click", function () { activarTab(t.key); });
      chips[t.key] = chip;
      tabBar.appendChild(chip);
    });
    root.appendChild(tabBar);

    TABS.forEach(function (t) {
      paneles[t.key] = el("div", { style: t.key === "general" ? "" : "display:none;" });
      root.appendChild(paneles[t.key]);
    });

    function activarTab(key) {
      TABS.forEach(function (t) {
        chips[t.key].className = "chip filter-chip" + (t.key === key ? " chip-active" : "");
        paneles[t.key].style.display = t.key === key ? "" : "none";
      });
    }

    // --- Carga de datos (en paralelo) ---------------------------------------
    var valores, reglamento;
    try {
      var res = await Promise.all([
        global.NG_DATA.configuracion.obtener(),
        global.NG_DATA.puntaje.obtenerReglamento()
      ]);
      valores = res[0]; reglamento = res[1];
    } catch (err) {
      root.appendChild(el("div", { class: "empty-state" }, [window.NG_ERR ? window.NG_ERR.format(err) : String(err)]));
      return;
    }

    pintarGeneral(paneles.general, valores);

    if (!reglamento) {
      ["perfil", "asistencia", "resultados"].forEach(function (k) {
        paneles[k].appendChild(el("div", { class: "empty-state" }, [
          "No hay ningún Reglamento de Puntajes cargado todavía. Corre assets/sql/migrations/0012_sistema_puntaje_reglas.sql en Supabase (o assets/sql/schema.sql si es una base nueva) para crear la versión semilla."
        ]));
      });
    } else {
      pintarPerfil(paneles.perfil, reglamento);
      pintarAsistencia(paneles.asistencia, reglamento);
      pintarResultadosVigencia(paneles.resultados, reglamento);
    }
  }

  // =========================================================================
  // TAB: GENERAL (sin cambios de comportamiento respecto a la versión previa)
  // =========================================================================
  async function pintarGeneral(root, valores) {
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
        } else if (campo.tipo === "textarea") {
          input = el("textarea", { rows: "3", style: "width:100%;" });
          input.value = valores[campo.clave] != null ? valores[campo.clave] : "";
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
          if (window.NG_applyBrandingLive) window.NG_applyBrandingLive(nuevos);
        })
        .catch(function (err) {
          saveBtn.disabled = false; saveBtn.textContent = "Guardar cambios";
          global.NG_TOAST.show(global.NG_ERR.format(err), "error");
        });
    });
    footRow.appendChild(saveBtn);
    root.appendChild(footRow);

    var comisiones = await global.NG_DATA.comisiones.listar();
    root.appendChild(el("div", { class: "section-title" }, ["Comisiones y líderes actuales"]));
    root.appendChild(tablaComisiones(comisiones));

    await pintarFlyers(root);
  }

  async function pintarFlyers(root) {
    root.appendChild(el("div", { class: "view-head", style: "margin-top:26px;" }, [
      el("div", {}, [
        el("h1", { style: "font-size:19px;" }, ["Flyers de la landing pública"]),
        el("p", {}, ['Se muestran en index.html — lo primero que ve cualquiera con cuenta pendiente de aprobación.'])
      ]),
      S.actionBtn("+ Nuevo flyer", function () { global.NG_openNuevoFlyerModal(); })
    ]));

    if (!global.NG_DB) {
      root.appendChild(el("div", { class: "empty-state" }, ["Los flyers requieren Supabase conectado."]));
      return;
    }

    var flyers = await global.NG_DATA.flyers.listar();
    if (!flyers.length) {
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay flyers publicados."]));
      return;
    }

    var grid = el("div", { class: "grid grid-cols-3" });
    flyers.forEach(function (f) {
      var card = el("div", { class: "card" }, [
        el("img", { src: f.imagenUrl, alt: f.titulo, style: "width:100%;border-radius:8px;margin-bottom:8px;object-fit:cover;max-height:140px;" }),
        el("div", { style: "font-weight:600;font-size:13px;" }, [f.titulo]),
        el("div", { style: "font-size:11.5px;color:var(--text-faint);margin-top:2px;" }, [f.activo ? "Activo" : "Inactivo · oculto en la landing"])
      ]);
      card.appendChild(S.gestionRow(
        function () { global.NG_openEditarFlyerModal(f); },
        function () {
          if (!window.confirm('¿Eliminar el flyer "' + f.titulo + '"?')) return;
          global.NG_DATA.flyers.eliminar(f.id)
            .then(function () { global.NG_TOAST.show("Flyer eliminado.", "success"); global.NG_ROUTER.route(); })
            .catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
        }
      ));
      grid.appendChild(card);
    });
    root.appendChild(grid);
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

  // =========================================================================
  // Encabezado común a las 3 pestañas de Puntaje: estado de la versión +
  // aviso de solo-lectura cuando no está en BORRADOR.
  // =========================================================================
  function encabezadoVersion(reglamento, subtitulo) {
    var v = reglamento.version;
    var wrap = el("div", { class: "view-head", style: "align-items:flex-start;" }, [
      el("div", {}, [
        el("h1", { style: "font-size:19px;display:flex;align-items:center;gap:10px;" }, [
          subtitulo,
          el("span", { class: "badge-estado badge-" + v.status }, [v.status])
        ]),
        el("p", {}, ["Versión " + v.version_code + " del Reglamento de Puntajes."])
      ])
    ]);
    return wrap;
  }

  function avisoSoloLectura(reglamento, root, onNuevaVersion) {
    if (reglamento.version.status === "BORRADOR") return false;
    var aviso = el("div", { class: "empty-state", style: "text-align:left;margin-bottom:18px;" }, [
      "Esta versión está " + reglamento.version.status + " y no se puede editar directamente (el reglamento exige que todo cambio de valores quede en una nueva versión trazable — sección 9.3). ",
      el("button", { class: "btn btn-ghost", type: "button", style: "margin-left:8px;" }, ["Crear nueva versión (borrador) para editar"])
    ]);
    aviso.querySelector("button").addEventListener("click", onNuevaVersion);
    root.appendChild(aviso);
    return true;
  }

  async function crearNuevaVersion(reglamento) {
    var codigoSugerido = sugerirSiguienteCodigo(reglamento.version.version_code);
    var nuevoCodigo = window.prompt("Código de la nueva versión (ej. " + codigoSugerido + "):", codigoSugerido);
    if (!nuevoCodigo) return;
    try {
      await global.NG_DATA.puntaje.duplicarVersion(reglamento.version.version_id, nuevoCodigo.trim());
      global.NG_TOAST.show("Nueva versión creada en BORRADOR.", "success");
      global.NG_ROUTER.route();
    } catch (err) {
      global.NG_TOAST.show(global.NG_ERR.format(err), "error");
    }
  }

  function sugerirSiguienteCodigo(actual) {
    var m = /^(\d+)\.(\d+)\.(\d+)/.exec(actual || "1.0.0");
    if (!m) return "1.0.1";
    return m[1] + "." + m[2] + "." + (Number(m[3]) + 1);
  }

  // =========================================================================
  // TAB: PUNTAJE — PERFIL (reglas PROFILE_*, montos fijos)
  // =========================================================================
  function pintarPerfil(root, reglamento) {
    root.appendChild(encabezadoVersion(reglamento, "Puntaje: Secciones de perfil"));
    root.appendChild(el("p", { style: "color:var(--text-soft);margin:-10px 0 16px;font-size:13px;" }, [
      "Créditos únicos por miembro y versión: cada sección acredita una sola vez al completarse. Editar el número no reacredita a quienes ya la tienen — eso lo controla el motor de acreditación."
    ]));

    var soloLectura = avisoSoloLectura(reglamento, root, function () { crearNuevaVersion(reglamento); });

    var card = el("div", { class: "card" });
    var inputs = {};
    var subtotalEl = el("strong", {}, ["0"]);

    reglamento.perfil.forEach(function (regla) {
      var field = el("div", { class: "modal-field", style: "display:flex;align-items:center;justify-content:space-between;gap:14px;" });
      field.appendChild(el("label", { style: "margin:0;flex:1;" }, [regla.etiqueta, el("div", { style: "font-size:11px;color:var(--text-faint);font-family:'IBM Plex Mono',monospace;" }, [regla.rule_code])]));
      var input = el("input", { type: "number", min: "0", step: "1", value: String(regla.amount), style: "width:90px;text-align:right;", disabled: soloLectura ? "disabled" : null });
      if (soloLectura) input.setAttribute("disabled", "disabled");
      input.addEventListener("input", recalcularSubtotal);
      inputs[regla.rule_id] = input;
      field.appendChild(input);
      card.appendChild(field);
    });
    root.appendChild(card);

    var subtotalRow = el("div", { style: "display:flex;justify-content:space-between;padding:12px 4px;font-size:14px;" }, [
      "Subtotal si un miembro completa todo el perfil:", el("span", {}, [subtotalEl, " pts"])
    ]);
    root.appendChild(subtotalRow);
    recalcularSubtotal();

    function recalcularSubtotal() {
      var total = 0;
      Object.keys(inputs).forEach(function (id) { total += Number(inputs[id].value) || 0; });
      subtotalEl.textContent = String(total);
    }

    if (!soloLectura) {
      var saveBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar valores de perfil"]);
      saveBtn.addEventListener("click", function () {
        var cambios = Object.keys(inputs).map(function (ruleId) {
          var n = Number(inputs[ruleId].value);
          return { rule_id: ruleId, amount: isNaN(n) || n < 0 ? 0 : Math.round(n) };
        });
        saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
        global.NG_DATA.puntaje.guardarPerfil(cambios)
          .then(function () { global.NG_TOAST.show("Valores de perfil guardados.", "success"); global.NG_ROUTER.route(); })
          .catch(function (err) { saveBtn.disabled = false; saveBtn.textContent = "Guardar valores de perfil"; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      root.appendChild(el("div", { style: "margin-top:6px;" }, [saveBtn]));
    }
  }

  // =========================================================================
  // TAB: PUNTAJE — ASISTENCIA (matriz tipo de actividad × nivel organizador)
  // =========================================================================
  function pintarAsistencia(root, reglamento) {
    root.appendChild(encabezadoVersion(reglamento, "Puntaje: Asistencia validada"));
    root.appendChild(el("p", { style: "color:var(--text-soft);margin:-10px 0 16px;font-size:13px;" }, [
      "Mismo valor para todos los asistentes, sin importar su rol. Deja una celda vacía para marcar \"No aplica\" esa combinación (ej. actividad territorial a nivel Nacional)."
    ]));

    var soloLectura = avisoSoloLectura(reglamento, root, function () { crearNuevaVersion(reglamento); });
    var asis = reglamento.asistencia;
    if (!asis) { root.appendChild(el("div", { class: "empty-state" }, ["La regla ATTENDANCE_VALIDATED no existe en esta versión."])); return; }

    // --- Tope por periodo ---------------------------------------------------
    var topeCard = el("div", { class: "card" });
    var topeRow = el("div", { class: "toggle-row" }, [el("span", {}, ["Aplicar tope mensual de eventos acreditados"])]);
    var swTope = el("label", { class: "switch" });
    var chkTope = el("input", { type: "checkbox" });
    if (asis.period_cap_window === "MONTH") chkTope.setAttribute("checked", "checked");
    swTope.appendChild(chkTope); swTope.appendChild(el("span", { class: "slider" }));
    topeRow.appendChild(swTope);
    topeCard.appendChild(topeRow);

    var fieldQty = el("div", { class: "modal-field" });
    fieldQty.appendChild(el("label", {}, ["Máximo de eventos acreditados por miembro por mes"]));
    var inputQty = el("input", { type: "number", min: "1", step: "1", value: String(asis.period_cap_qty || 8), style: "width:100px;" });
    fieldQty.appendChild(inputQty);
    topeCard.appendChild(fieldQty);
    root.appendChild(topeCard);

    if (soloLectura) { chkTope.disabled = true; inputQty.disabled = true; }

    // --- Matriz ---------------------------------------------------------------
    var tw = el("div", { class: "table-wrap", style: "margin-top:16px;" });
    var headRow = el("tr", {}, [el("th", {}, ["Tipo de actividad"])].concat(
      global.NG_DATA.puntaje.NIVELES.map(function (n) { return el("th", { style: "text-align:center;" }, [ETIQUETAS_NIVEL[n]]); })
    ));
    var table = el("table", {}, [headRow]);
    var inputs = {}; // key "tipo|nivel" -> input

    global.NG_DATA.puntaje.TIPOS_ACTIVIDAD.forEach(function (tipo) {
      var celdas = global.NG_DATA.puntaje.NIVELES.map(function (nivel) {
        var registro = asis.matrix.find(function (m) { return m.tipo_actividad === tipo && m.nivel_organizador === nivel; });
        var valor = registro ? registro.amount : null;
        var input = el("input", { type: "number", min: "0", step: "1", class: "matriz-input", placeholder: "—", value: valor != null ? String(valor) : "" });
        if (soloLectura) input.setAttribute("disabled", "disabled");
        inputs[tipo + "|" + nivel] = input;
        return el("td", { style: "text-align:center;" }, [input]);
      });
      table.appendChild(el("tr", {}, [el("td", {}, [ETIQUETAS_TIPO[tipo]])].concat(celdas)));
    });
    tw.appendChild(table);
    root.appendChild(tw);

    if (!soloLectura) {
      var saveBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar matriz de asistencia"]);
      saveBtn.addEventListener("click", function () {
        var celdas = [];
        Object.keys(inputs).forEach(function (key) {
          var parts = key.split("|");
          var raw = inputs[key].value;
          var amount = raw === "" ? null : Math.max(0, Math.round(Number(raw)));
          celdas.push({ tipo_actividad: parts[0], nivel_organizador: parts[1], amount: amount });
        });
        var capQty = chkTope.checked ? Math.max(1, Math.round(Number(inputQty.value) || 8)) : null;
        var capWindow = chkTope.checked ? "MONTH" : "NONE";
        saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
        global.NG_DATA.puntaje.guardarAsistencia(asis.rule_id, capQty, capWindow, celdas)
          .then(function () { global.NG_TOAST.show("Matriz de asistencia guardada.", "success"); global.NG_ROUTER.route(); })
          .catch(function (err) { saveBtn.disabled = false; saveBtn.textContent = "Guardar matriz de asistencia"; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      root.appendChild(el("div", { style: "margin-top:14px;" }, [saveBtn]));
    }
  }

  // =========================================================================
  // TAB: PUNTAJE — RESULTADOS Y VIGENCIA
  // =========================================================================
  function pintarResultadosVigencia(root, reglamento) {
    root.appendChild(encabezadoVersion(reglamento, "Puntaje: Entrega de resultados y vigencia"));

    var soloLectura = avisoSoloLectura(reglamento, root, function () { crearNuevaVersion(reglamento); });

    // --- Entrega de resultados ------------------------------------------------
    root.appendChild(el("div", { class: "section-title" }, ["Entrega de resultados (RESULTS_DELIVERED)"]));
    root.appendChild(el("p", { style: "color:var(--text-soft);margin:-8px 0 12px;font-size:13px;" }, [
      "Origen nuevo: premia a quien entrega y sustenta el resultado de una actividad, además del puntaje de asistencia. Monto = multiplicador × valor de asistencia del mismo evento, con techo."
    ]));
    var res = reglamento.resultados;
    if (!res) {
      root.appendChild(el("div", { class: "empty-state" }, ["La regla RESULTS_DELIVERED no existe en esta versión."]));
    } else {
      var cardRes = el("div", { class: "card" });
      var inputMult = campoNumero(cardRes, "Multiplicador sobre el valor de asistencia del evento", res.multiplicador, "0.1", soloLectura);
      var inputTecho = campoNumero(cardRes, "Techo máximo de puntos por entrega (vacío = sin techo)", res.techo, "1", soloLectura);
      var inputPlazo = campoNumero(cardRes, "Plazo en días naturales desde el cierre del evento", res.plazo_dias, "1", soloLectura);
      root.appendChild(cardRes);

      if (!soloLectura) {
        var saveResBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar entrega de resultados"]);
        saveResBtn.addEventListener("click", function () {
          var mult = Number(inputMult.value);
          if (!mult || mult <= 0) { global.NG_TOAST.show("El multiplicador debe ser mayor a 0.", "error"); return; }
          var techo = inputTecho.value === "" ? null : Math.max(0, Math.round(Number(inputTecho.value)));
          var plazo = inputPlazo.value === "" ? null : Math.max(0, Math.round(Number(inputPlazo.value)));
          saveResBtn.disabled = true; saveResBtn.textContent = "Guardando…";
          global.NG_DATA.puntaje.guardarResultados(res.rule_id, mult, techo, plazo)
            .then(function () { global.NG_TOAST.show("Entrega de resultados guardada.", "success"); global.NG_ROUTER.route(); })
            .catch(function (err) { saveResBtn.disabled = false; saveResBtn.textContent = "Guardar entrega de resultados"; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
        });
        root.appendChild(el("div", { style: "margin-bottom:26px;" }, [saveResBtn]));
      }
    }

    // --- Vigencia --------------------------------------------------------------
    root.appendChild(el("div", { class: "section-title", style: "margin-top:26px;" }, ["Vigencia de esta versión"]));
    root.appendChild(el("p", { style: "color:var(--text-soft);margin:-8px 0 12px;font-size:13px;" }, [
      "Mientras el estado sea BORRADOR, ningún valor de esta versión acredita puntos reales (reglamento, sección 2). Pasar a VIGENTE requiere acta/resolución y hash del documento aprobado."
    ]));

    var v = reglamento.version;
    var cardVig = el("div", { class: "card" });

    var fieldActa = el("div", { class: "modal-field" });
    fieldActa.appendChild(el("label", {}, ["Acta / resolución de aprobación"]));
    var inputActa = el("input", { type: "text", value: v.approval_reference || "" });
    fieldActa.appendChild(inputActa);
    cardVig.appendChild(fieldActa);

    var fieldNotas = el("div", { class: "modal-field" });
    fieldNotas.appendChild(el("label", {}, ["Notas"]));
    var inputNotas = el("textarea", { rows: "2", style: "width:100%;" });
    inputNotas.value = v.notas || "";
    fieldNotas.appendChild(inputNotas);
    cardVig.appendChild(fieldNotas);

    var fechasRow = el("div", { style: "display:flex;gap:14px;flex-wrap:wrap;" });
    var fieldDesde = el("div", { class: "modal-field", style: "flex:1;min-width:160px;" });
    fieldDesde.appendChild(el("label", {}, ["Vigente desde"]));
    var inputDesde = el("input", { type: "date", value: v.effective_from ? v.effective_from.substring(0, 10) : "" });
    fieldDesde.appendChild(inputDesde);
    var fieldHasta = el("div", { class: "modal-field", style: "flex:1;min-width:160px;" });
    fieldHasta.appendChild(el("label", {}, ["Vigente hasta (opcional)"]));
    var inputHasta = el("input", { type: "date", value: v.effective_until ? v.effective_until.substring(0, 10) : "" });
    fieldHasta.appendChild(inputHasta);
    fechasRow.appendChild(fieldDesde); fechasRow.appendChild(fieldHasta);
    cardVig.appendChild(fechasRow);

    var fieldHashTexto = el("div", { class: "modal-field" });
    fieldHashTexto.appendChild(el("label", {}, ["Pega aquí el texto del reglamento aprobado para calcular su hash SHA-256"]));
    var inputHashTexto = el("textarea", { rows: "3", style: "width:100%;" });
    fieldHashTexto.appendChild(inputHashTexto);
    cardVig.appendChild(fieldHashTexto);

    var hashRow = el("div", { style: "display:flex;gap:10px;align-items:center;margin-bottom:10px;" });
    var btnHash = el("button", { class: "btn btn-ghost", type: "button" }, ["Calcular hash SHA-256"]);
    var inputHash = el("input", { type: "text", value: v.document_hash_sha256 || "", readonly: "readonly", style: "flex:1;font-family:'IBM Plex Mono',monospace;font-size:12px;" });
    btnHash.addEventListener("click", async function () {
      var texto = inputHashTexto.value.trim();
      if (!texto) { global.NG_TOAST.show("Pega el texto del reglamento antes de calcular el hash.", "error"); return; }
      try {
        var hash = await calcularSHA256(texto);
        inputHash.value = hash;
        global.NG_TOAST.show("Hash calculado. No olvides guardar.", "success");
      } catch (err) {
        global.NG_TOAST.show("No se pudo calcular el hash en este navegador.", "error");
      }
    });
    hashRow.appendChild(btnHash); hashRow.appendChild(inputHash);
    cardVig.appendChild(hashRow);

    root.appendChild(cardVig);

    var guardarDatosBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Guardar datos de vigencia"]);
    guardarDatosBtn.addEventListener("click", function () {
      var campos = {
        approval_reference: inputActa.value.trim() || null,
        notas: inputNotas.value.trim() || null,
        effective_from: inputDesde.value ? new Date(inputDesde.value).toISOString() : null,
        effective_until: inputHasta.value ? new Date(inputHasta.value).toISOString() : null,
        document_hash_sha256: inputHash.value.trim() || null
      };
      guardarDatosBtn.disabled = true; guardarDatosBtn.textContent = "Guardando…";
      global.NG_DATA.puntaje.guardarDatosVersion(v.version_id, campos)
        .then(function () { global.NG_TOAST.show("Datos de vigencia guardados.", "success"); global.NG_ROUTER.route(); })
        .catch(function (err) { guardarDatosBtn.disabled = false; guardarDatosBtn.textContent = "Guardar datos de vigencia"; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
    });
    root.appendChild(el("div", { style: "margin-bottom:20px;" }, [guardarDatosBtn]));

    // --- Cambiar estado ---------------------------------------------------------
    var estadoRow = el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center;" });
    if (v.status === "BORRADOR") {
      var btnActivar = el("button", { class: "btn btn-accent", type: "button" }, ["Marcar como VIGENTE"]);
      btnActivar.addEventListener("click", function () {
        if (!v.approval_reference && !inputActa.value.trim()) {
          if (!window.confirm("No hay acta/resolución registrada. ¿Marcar VIGENTE de todas formas?")) return;
        } else if (!window.confirm("Esto cierra cualquier otra versión VIGENTE y deja esta como la oficial. ¿Continuar?")) return;
        global.NG_DATA.puntaje.cambiarEstadoVersion(v.version_id, "VIGENTE")
          .then(function () { global.NG_TOAST.show("Versión marcada como VIGENTE.", "success"); global.NG_ROUTER.route(); })
          .catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      estadoRow.appendChild(btnActivar);
    } else if (v.status === "VIGENTE") {
      var btnCerrar = el("button", { class: "btn btn-ghost", type: "button" }, ["Cerrar esta versión (CERRADA)"]);
      btnCerrar.addEventListener("click", function () {
        if (!window.confirm("¿Cerrar esta versión? Dejará de estar vigente.")) return;
        global.NG_DATA.puntaje.cambiarEstadoVersion(v.version_id, "CERRADA")
          .then(function () { global.NG_TOAST.show("Versión cerrada.", "success"); global.NG_ROUTER.route(); })
          .catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      estadoRow.appendChild(btnCerrar);
    }
    estadoRow.appendChild(el("button", { class: "btn btn-ghost", type: "button" }, ["Crear nueva versión (duplicar valores)"]));
    estadoRow.lastChild.addEventListener("click", function () { crearNuevaVersion(reglamento); });
    root.appendChild(estadoRow);
  }

  function campoNumero(card, label, valor, step, disabled) {
    var field = el("div", { class: "modal-field" });
    field.appendChild(el("label", {}, [label]));
    var input = el("input", { type: "number", min: "0", step: step, value: valor != null ? String(valor) : "" });
    if (disabled) input.setAttribute("disabled", "disabled");
    field.appendChild(input);
    card.appendChild(field);
    return input;
  }

  async function calcularSHA256(texto) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.configuracion = viewConfiguracion;
})(window);
