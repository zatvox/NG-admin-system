/* =====================================================================
 * views/puntaje.js — Pantallas del Reglamento de Puntajes para el día a
 * día (a diferencia de views/configuracion.js, que edita los VALORES).
 *   - Asistencia: gestionar listas por evento (Dirección/Líder/Coordinador).
 *   - Resultados: entregar y validar RESULTS_DELIVERED.
 *   - Mi puntuación: saldo propio + historial + progreso de perfil.
 *   - Ranking: tabla general, identidad enmascarada salvo la fila propia.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var H = global.NG_VIEW_HELPERS, S = global.NG_SHARED;

  var ETIQUETAS_TIPO = { territorial: "Actividad territorial", virtual: "Reunión virtual", presencial: "Reunión presencial", hibrida: "Reunión híbrida", capacitacion: "Capacitación", asamblea: "Asamblea" };
  var ETIQUETAS_NIVEL = { subcomision: "Subcomisión", comision: "Comisión", nacional: "Directiva Nacional" };

  function fmtFecha(iso) { return global.NG_UTILS ? global.NG_UTILS.fmtFecha(iso) : iso; }

  // =========================================================================
  // ASISTENCIA
  // =========================================================================
  async function viewAsistencia(eventoId) {
    if (eventoId) return viewAsistenciaDetalle(eventoId);

    H.setTitle("Asistencia", "Gestión de listas por evento");
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Asistencia"]), el("p", {}, ["Eventos clasificados con tipo de actividad — se acreditan puntos al validar su lista al 100%."])])
    ]));

    var eventos = await global.NG_DATA.eventos.listarAcreditables();
    if (!eventos.length) {
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay eventos con tipo de actividad asignado. Edítalo desde Calendario → Editar evento."]));
      return;
    }

    var listas = {};
    await Promise.all(eventos.map(function (e) {
      return global.NG_DATA.asistencia.obtenerListaDeEvento(e.id).then(function (l) { listas[e.id] = l; });
    }));

    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Evento"]), el("th", {}, ["Fecha"]), el("th", {}, ["Tipo"]), el("th", {}, ["Nivel"]), el("th", {}, ["Estado de la lista"]), el("th", {}, [""])])]);
    eventos.forEach(function (e) {
      var l = listas[e.id];
      var estado = !l ? "Sin lista" : (l.validatedAt ? "Validada (" + l.auditedPct + "%)" : "Auditoría " + l.auditedPct + "%");
      var btn = el("button", { class: "btn btn-ghost", type: "button" }, [l ? "Gestionar" : "Crear lista"]);
      btn.addEventListener("click", function () { location.hash = "#/asistencia/" + e.id; });
      table.appendChild(el("tr", {}, [
        el("td", {}, [e.titulo]), el("td", { class: "mono" }, [fmtFecha(e.fecha)]),
        el("td", {}, [ETIQUETAS_TIPO[e.tipoActividad] || e.tipoActividad]), el("td", {}, [ETIQUETAS_NIVEL[e.nivelOrganizador] || e.nivelOrganizador]),
        el("td", {}, [estado]), el("td", {}, [btn])
      ]));
    });
    tw.appendChild(table); root.appendChild(tw);
  }

  async function viewAsistenciaDetalle(eventoId) {
    H.setTitle("Asistencia", "Detalle del evento");
    var root = q("#view-root"); root.innerHTML = "";

    var eventos = await global.NG_DATA.eventos.listar();
    var evento = eventos.find(function (e) { return e.id === eventoId; });
    if (!evento) { root.appendChild(el("div", { class: "empty-state" }, ["Este evento ya no existe."])); return; }

    var back = el("button", { class: "btn btn-ghost", type: "button", style: "margin-bottom:10px;" }, ["← Volver a Asistencia"]);
    back.addEventListener("click", function () { location.hash = "#/asistencia"; });
    root.appendChild(back);

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, [evento.titulo]), el("p", {}, [fmtFecha(evento.fecha) + " · " + (ETIQUETAS_TIPO[evento.tipoActividad] || "") + " · " + (ETIQUETAS_NIVEL[evento.nivelOrganizador] || "")])])
    ]));

    var lista = await global.NG_DATA.asistencia.obtenerListaDeEvento(evento.id);
    if (!lista) {
      var crearBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Crear lista de asistencia"]);
      crearBtn.addEventListener("click", function () {
        crearBtn.disabled = true;
        global.NG_DATA.asistencia.crearLista(evento.id)
          .then(function () { global.NG_ROUTER.route(); })
          .catch(function (err) { crearBtn.disabled = false; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay lista para este evento.", el("div", { style: "margin-top:10px;" }, [crearBtn])]));
      return;
    }

    var usuarios = await global.NG_DATA.usuarios.listarTodos();
    var asistentes = await global.NG_DATA.asistencia.listarAsistentes(lista.listId);
    var yaEnLista = {}; asistentes.forEach(function (a) { yaEnLista[a.usuarioId] = true; });

    if (!lista.validatedAt) {
      var agregarBtn = S.actionBtn("+ Agregar asistentes", function () {
        global.NG_MODAL.openForm({
          title: "Agregar asistentes", entityLabel: "Asistencia",
          fields: [{
            name: "usuarios", label: "Miembros presentes", type: "userpicker", placeholder: "Buscar por nombre…",
            options: usuarios.filter(function (u) { return u.estado === "activo" && !yaEnLista[u.id]; }).map(function (u) { return { value: u.id, label: u.nombre }; })
          }],
          onSave: function (v) { return global.NG_DATA.asistencia.agregarAsistentes(lista.listId, v.usuarios); }
        });
      });
      root.appendChild(el("div", { style: "margin-bottom:14px;" }, [agregarBtn]));
    }

    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Miembro"]), el("th", {}, [""])])]);
    if (!asistentes.length) {
      table.appendChild(el("tr", {}, [el("td", { colspan: "2" }, ["Todavía no hay nadie en la lista."])]));
    }
    asistentes.forEach(function (a) {
      var quitarBtn = lista.validatedAt ? null : el("button", { class: "btn btn-ghost", type: "button", style: "font-size:12px;padding:6px 10px;" }, ["Quitar"]);
      if (quitarBtn) quitarBtn.addEventListener("click", function () {
        global.NG_DATA.asistencia.quitarAsistente(a.entryId).then(function () { global.NG_ROUTER.route(); }).catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      table.appendChild(el("tr", {}, [el("td", {}, [a.nombre]), el("td", {}, [quitarBtn].filter(Boolean))]));
    });
    tw.appendChild(table); root.appendChild(el("div", { style: "margin-top:10px;" }, [tw]));

    root.appendChild(el("div", { class: "section-title", style: "margin-top:24px;" }, ["Auditoría y validación"]));
    var card = el("div", { class: "card" });
    if (lista.validatedAt) {
      card.appendChild(S.rowKV("Estado", "Validada — " + lista.auditedPct + "% auditado"));
      card.appendChild(S.rowKV("Validada el", new Date(lista.validatedAt).toLocaleString("es-PE")));
      card.appendChild(el("p", { style: "color:var(--text-soft);font-size:12.5px;margin-top:8px;" }, ["Los puntos de asistencia de esta lista ya se acreditaron (si el reglamento estaba VIGENTE en ese momento)."]));
    } else {
      var field = el("div", { class: "modal-field" });
      field.appendChild(el("label", {}, ["% auditado (debe llegar a 100 para poder validar)"]));
      var pctInput = el("input", { type: "number", min: "0", max: "100", value: String(lista.auditedPct) });
      field.appendChild(pctInput);
      card.appendChild(field);

      var guardarPctBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Guardar % auditado"]);
      guardarPctBtn.addEventListener("click", function () {
        var pct = Math.max(0, Math.min(100, Number(pctInput.value) || 0));
        guardarPctBtn.disabled = true;
        global.NG_DATA.asistencia.actualizarAuditoria(lista.listId, pct)
          .then(function () { global.NG_ROUTER.route(); })
          .catch(function (err) { guardarPctBtn.disabled = false; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      card.appendChild(guardarPctBtn);

      var validarBtn = el("button", { class: "btn btn-accent", type: "button", style: "margin-left:8px;" }, ["Validar lista"]);
      validarBtn.disabled = lista.auditedPct < 100;
      validarBtn.title = lista.auditedPct < 100 ? "Necesita 100% de auditoría" : "";
      validarBtn.addEventListener("click", function () {
        if (!window.confirm("¿Validar esta lista? Se acreditarán los puntos de asistencia a cada asistente (si el reglamento está VIGENTE).")) return;
        validarBtn.disabled = true;
        global.NG_DATA.asistencia.validarLista(lista.listId)
          .then(function () { global.NG_TOAST.show("Lista validada.", "success"); global.NG_ROUTER.route(); })
          .catch(function (err) { validarBtn.disabled = false; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      card.appendChild(validarBtn);
    }
    root.appendChild(card);
  }

  // =========================================================================
  // ENTREGA DE RESULTADOS
  // =========================================================================
  var ESTADO_ENTREGA_LABEL = { PENDIENTE: "Pendiente", VALIDADO: "Validado", RECHAZADO: "Rechazado" };

  async function viewResultados() {
    H.setTitle("Entrega de resultados", "RESULTS_DELIVERED");
    var root = q("#view-root"); root.innerHTML = "";
    var p = global.NG_STATE.persona;

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Entrega de resultados"]), el("p", {}, ["Sustenta el resultado de una actividad para acreditar puntos adicionales a la asistencia."])]),
      S.actionBtn("+ Entregar resultado", abrirModalEntrega)
    ]));

    var entregas = await global.NG_DATA.resultados.listar();
    if (!entregas.length) {
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay entregas registradas."]));
      return;
    }

    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Evento"]), el("th", {}, ["Responsable"]), el("th", {}, ["Evidencia"]), el("th", {}, ["Estado"]), el("th", {}, [""])])]);
    entregas.forEach(function (d) {
      var acciones = [];
      if (d.status === "PENDIENTE" && (p.rol === "direccion" || p.rol === "lider" || p.rol === "coordinador")) {
        var okBtn = el("button", { class: "btn btn-accent", type: "button", style: "font-size:12px;padding:6px 10px;" }, ["Validar"]);
        okBtn.addEventListener("click", function () {
          global.NG_DATA.resultados.validar(d.deliveryId).then(function () { global.NG_TOAST.show("Entrega validada.", "success"); global.NG_ROUTER.route(); }).catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
        });
        var noBtn = el("button", { class: "btn btn-ghost", type: "button", style: "font-size:12px;padding:6px 10px;margin-left:6px;" }, ["Rechazar"]);
        noBtn.addEventListener("click", function () {
          var motivo = window.prompt("Motivo del rechazo (opcional):", "");
          global.NG_DATA.resultados.rechazar(d.deliveryId, motivo).then(function () { global.NG_TOAST.show("Entrega rechazada.", "success"); global.NG_ROUTER.route(); }).catch(function (err) { global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
        });
        acciones.push(okBtn, noBtn);
      }
      table.appendChild(el("tr", {}, [
        el("td", {}, [d.eventoTitulo || "—"]), el("td", {}, [d.usuarioNombre || "—"]),
        el("td", {}, [el("span", { style: "font-size:12.5px;color:var(--text-soft);" }, [d.evidenceRef])]),
        el("td", {}, [el("span", { class: "badge-estado " + (d.status === "VALIDADO" ? "badge-hecho" : d.status === "RECHAZADO" ? "badge-en_curso" : "badge-pendiente") }, [ESTADO_ENTREGA_LABEL[d.status]])]),
        el("td", {}, acciones)
      ]));
    });
    tw.appendChild(table); root.appendChild(tw);

    async function abrirModalEntrega() {
      var eventos = await global.NG_DATA.eventos.listarAcreditables();
      global.NG_MODAL.openForm({
        title: "Entregar resultado", entityLabel: "Entrega",
        fields: [
          { name: "evento", label: "Evento", type: "select", required: true, options: eventos.map(function (e) { return { value: e.id, label: e.titulo + " (" + fmtFecha(e.fecha) + ")" }; }) },
          { name: "evidencia", label: "Enlace o referencia del resultado (informe, acta, material...)", type: "text", required: true, placeholder: "https://…" }
        ],
        onSave: function (v) { return global.NG_DATA.resultados.crear(v.evento, v.evidencia); }
      });
    }
  }

  // =========================================================================
  // MI PUNTUACIÓN
  // =========================================================================
  async function viewMiPuntuacion() {
    H.setTitle("Mi puntuación");
    var root = q("#view-root"); root.innerHTML = "";

    var res = await Promise.all([
      global.NG_DATA.puntaje.obtenerMiBalance(),
      global.NG_DATA.puntaje.listarMisMovimientos(),
      global.NG_DATA.puntaje.obtenerReglamento()
    ]);
    var balance = res[0], movimientos = res[1], reglamento = res[2];

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Mi puntuación"]), el("p", {}, ["Créditos verificados por participación, según el Reglamento de Puntajes."])])
    ]));

    if (reglamento && reglamento.version.status !== "VIGENTE") {
      root.appendChild(el("div", { class: "empty-state", style: "text-align:left;" }, [
        "El Reglamento de Puntajes todavía está en " + reglamento.version.status + " — los puntos mostrados abajo (si los hay) son de pruebas anteriores; no se acreditan puntos nuevos hasta que la Directiva lo marque VIGENTE."
      ]));
    }

    root.appendChild(el("div", { class: "kpi-row" }, [
      S.kpi ? S.kpi("Puntaje acumulado", String(balance.balance) + " pts") : el("div", { class: "card" }, [el("div", {}, [String(balance.balance) + " pts"])])
    ]));

    if (reglamento && reglamento.perfil.length) {
      root.appendChild(el("div", { class: "section-title" }, ["Progreso de perfil"]));
      var acreditadosPerfil = {}; movimientos.forEach(function (m) { if (m.status === "ACREDITADO" && m.ruleCode && m.ruleCode.indexOf("PROFILE_") === 0) acreditadosPerfil[m.ruleCode] = true; });
      var card = el("div", { class: "card" });
      reglamento.perfil.forEach(function (r) {
        var hecho = !!acreditadosPerfil[r.rule_code];
        card.appendChild(S.rowKV(r.etiqueta + " (+" + r.amount + " pts)", hecho ? "✓ Acreditado" : "Pendiente"));
      });
      root.appendChild(card);
      var cta = el("button", { class: "btn btn-accent", type: "button", style: "margin-top:10px;" }, ["Completar mi perfil"]);
      cta.addEventListener("click", function () { location.hash = "#/completar-perfil"; });
      root.appendChild(cta);
    }

    root.appendChild(el("div", { class: "section-title", style: "margin-top:26px;" }, ["Historial"]));
    if (!movimientos.length) {
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía no tienes créditos acreditados."]));
      return;
    }
    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Origen"]), el("th", {}, ["Puntos"]), el("th", {}, ["Fecha"]), el("th", {}, ["Estado"])])]);
    movimientos.forEach(function (m) {
      table.appendChild(el("tr", {}, [
        el("td", {}, [m.etiqueta]), el("td", {}, ["+" + m.amount]),
        el("td", { class: "mono" }, [new Date(m.createdAt).toLocaleDateString("es-PE")]),
        el("td", {}, [el("span", { class: "badge-estado " + (m.status === "ACREDITADO" ? "badge-hecho" : "badge-en_curso") }, [m.status])])
      ]));
    });
    tw.appendChild(table); root.appendChild(tw);
  }

  // =========================================================================
  // RANKING
  // =========================================================================
  async function viewRanking() {
    H.setTitle("Ranking de participación");
    var root = q("#view-root"); root.innerHTML = "";
    var p = global.NG_STATE.persona;

    var ranking = await global.NG_DATA.puntaje.listarRanking();
    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Ranking de participación"]), el("p", {}, ["Posiciones de todos los miembros. Solo ves tu propio nombre — el resto aparece anonimizado."])])
    ]));

    if (!ranking.length) { root.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay puntajes acreditados."])); return; }

    var regiones = Array.from(new Set(ranking.map(function (r) { return r.region; }).filter(Boolean))).sort();
    var filterRegion = el("select", {});
    filterRegion.appendChild(el("option", { value: "" }, ["Todas las regiones"]));
    regiones.forEach(function (r) { filterRegion.appendChild(el("option", { value: r }, [r])); });
    root.appendChild(el("div", { style: "margin-bottom:14px;max-width:260px;" }, [filterRegion]));

    var miPosicion = ranking.find(function (r) { return r.usuarioId === p.id; });
    if (miPosicion) {
      root.appendChild(el("div", { class: "kpi-row" }, [
        el("div", { class: "card" }, [el("div", { style: "font-size:12px;color:var(--text-soft);" }, ["Tu posición"]), el("div", { style: "font-size:22px;font-weight:700;" }, ["#" + miPosicion.posicion + " de " + ranking.length])]),
        el("div", { class: "card" }, [el("div", { style: "font-size:12px;color:var(--text-soft);" }, ["Tu puntaje"]), el("div", { style: "font-size:22px;font-weight:700;" }, [miPosicion.balance + " pts"])])
      ]));
    }

    var tw = el("div", { class: "table-wrap" });
    root.appendChild(tw);

    function draw() {
      tw.innerHTML = "";
      var filtrado = ranking.filter(function (r) { return !filterRegion.value || r.region === filterRegion.value; });
      var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Posición"]), el("th", {}, ["Miembro"]), el("th", {}, ["Región"]), el("th", {}, ["Puntaje"])])]);
      filtrado.forEach(function (r) {
        var esYo = r.usuarioId === p.id;
        var nombreMostrado = esYo ? r.nombre + " (Tú)" : "Miembro ****-" + String(r.usuarioId).replace(/-/g, "").slice(-4);
        table.appendChild(el("tr", { style: esYo ? "background:var(--surface-2);font-weight:600;" : "" }, [
          el("td", {}, ["#" + r.posicion]), el("td", {}, [nombreMostrado]), el("td", {}, [r.region || "—"]), el("td", {}, [r.balance + " pts"])
        ]));
      });
      tw.appendChild(table);
    }
    filterRegion.addEventListener("change", draw);
    draw();
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.asistencia = viewAsistencia;
  global.NG_VIEWS.resultados = viewResultados;
  global.NG_VIEWS.puntuacion = viewMiPuntuacion;
  global.NG_VIEWS.ranking = viewRanking;
})(window);
