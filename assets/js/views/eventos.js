/* =====================================================================
 * views/eventos.js — Módulo "Eventos" (2026-09-30): inscripción pública
 * a un evento vía link + QR (migración 0015). Complementa a Asistencia
 * (views/puntaje.js) sin tocarla: acá se administra quién SE INSCRIBIÓ
 * solo desde inscripcion.html; pasar esos inscritos a la lista real de
 * Asistencia (attendance_entries, la que sí acredita puntos) es una
 * acción explícita del organizador ("Cargar a Asistencia" más abajo).
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var H = global.NG_VIEW_HELPERS, S = global.NG_SHARED, P = global.NG_PERMS;

  function fmtFecha(iso) { return global.NG_UTILS ? global.NG_UTILS.fmtFecha(iso) : iso; }

  function urlInscripcion(evento) {
    // Misma carpeta que index.html/app.html — inscripcion.html vive en la
    // raíz del sitio junto a ellos.
    var base = window.location.origin + window.location.pathname.replace(/app\.html.*$/, "");
    return base + "inscripcion.html?e=" + encodeURIComponent(evento.codigoPublico);
  }

  // =========================================================================
  // LISTA — todos los eventos, con su estado de inscripción pública.
  // =========================================================================
  async function viewEventos(eventoId) {
    if (eventoId) return viewEventoDetalle(eventoId);

    H.setTitle("Eventos", "Inscripción pública — link y QR para confirmar asistencia");
    var root = q("#view-root"); root.innerHTML = "";
    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, ["Eventos"]), el("p", {}, ["Activa un link + código QR de inscripción pública por evento y revisa quiénes confirmaron."])])
    ]));

    var eventos = await global.NG_DATA.eventos.listar();
    eventos = eventos.filter(function (e) { return !e.cancelado; }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    if (!eventos.length) {
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay eventos. Créalos desde Calendario."]));
      return;
    }

    var conteos = {};
    await Promise.all(eventos.filter(function (e) { return e.inscripcionPublica; }).map(function (e) {
      return global.NG_DATA.inscripciones.listarDeEvento(e.id).then(function (list) {
        conteos[e.id] = list.filter(function (r) { return r.estado === "confirmado"; }).length;
      }).catch(function () { conteos[e.id] = 0; });
    }));

    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Evento"]), el("th", {}, ["Fecha"]), el("th", {}, ["Inscripción pública"]), el("th", {}, ["Confirmados"]), el("th", {}, [""])])]);
    eventos.forEach(function (e) {
      var btn = el("button", { class: "btn btn-ghost", type: "button" }, ["Ver detalle"]);
      btn.addEventListener("click", function () { location.hash = "#/eventos/" + e.id; });
      table.appendChild(el("tr", {}, [
        el("td", {}, [e.titulo]), el("td", { class: "mono" }, [fmtFecha(e.fecha)]),
        el("td", {}, [el("span", { class: "badge-estado " + (e.inscripcionPublica ? "badge-hecho" : "badge-pendiente") }, [e.inscripcionPublica ? "Activa" : "Inactiva"])]),
        el("td", {}, [e.inscripcionPublica ? String(conteos[e.id] || 0) : "—"]),
        el("td", {}, [btn])
      ]));
    });
    tw.appendChild(table); root.appendChild(tw);
  }

  // =========================================================================
  // DETALLE — activar/desactivar, link + QR, tabla de inscritos, "cargar a
  // Asistencia".
  // =========================================================================
  async function viewEventoDetalle(eventoId) {
    H.setTitle("Eventos", "Detalle del evento");
    var root = q("#view-root"); root.innerHTML = "";
    var persona = global.NG_STATE.persona;

    var eventos = await global.NG_DATA.eventos.listar();
    var evento = eventos.find(function (e) { return e.id === eventoId; });
    if (!evento) { root.appendChild(el("div", { class: "empty-state" }, ["Este evento ya no existe."])); return; }

    var back = el("button", { class: "btn btn-ghost", type: "button", style: "margin-bottom:10px;" }, ["← Volver a Eventos"]);
    back.addEventListener("click", function () { location.hash = "#/eventos"; });
    root.appendChild(back);

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [el("h1", {}, [evento.titulo]), el("p", {}, [fmtFecha(evento.fecha)])])
    ]));

    var puedeGestionar = P.canManageEnlaceOEvento(persona, evento);

    root.appendChild(el("div", { class: "section-title" }, ["Inscripción pública"]));
    var card = el("div", { class: "card" });

    if (!evento.inscripcionPublica) {
      card.appendChild(el("p", { style: "color:var(--text-soft);font-size:13px;margin-bottom:12px;" }, [
        "Todavía no está activa. Al activarla se genera un link único con código QR: cualquiera con sesión en el sistema (cuenta aprobada o pendiente) podrá abrirlo y confirmar su asistencia a este evento."
      ]));
      if (puedeGestionar) {
        var activarBtn = el("button", { class: "btn btn-accent", type: "button" }, ["Activar inscripción pública"]);
        activarBtn.addEventListener("click", function () {
          activarBtn.disabled = true;
          global.NG_DATA.eventos.activarInscripcionPublica(evento.id)
            .then(function () { global.NG_ROUTER.route(); })
            .catch(function (err) { activarBtn.disabled = false; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
        });
        card.appendChild(activarBtn);
      } else {
        card.appendChild(el("p", { style: "font-size:12.5px;color:var(--text-faint);" }, ["Solo Dirección, el Líder de la comisión o su Coordinador pueden activarla."]));
      }
      root.appendChild(card);
      return;
    }

    var link = urlInscripcion(evento);
    var linkRow = el("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;" });
    var linkInput = el("input", { type: "text", readonly: "readonly", value: link, style: "flex:1;min-width:220px;font-family:'IBM Plex Mono',monospace;font-size:12px;" });
    var copiarBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Copiar link"]);
    copiarBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(link).then(function () {
        global.NG_TOAST.show("Link copiado.", "success");
      }).catch(function () { linkInput.select(); document.execCommand("copy"); });
    });
    linkRow.appendChild(linkInput); linkRow.appendChild(copiarBtn);
    card.appendChild(linkRow);

    var qrWrap = el("div", { style: "display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px;" });
    var qrContainerId = "evento-qr-" + evento.id;
    var qrDiv = el("div", { id: qrContainerId });
    var qrBox = el("div", { style: "background:#fff;padding:10px;border-radius:10px;border:1px solid var(--border);min-width:180px;min-height:180px;display:flex;align-items:center;justify-content:center;" }, [qrDiv]);
    var descargarBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Descargar QR"]);
    descargarBtn.style.display = "none";
    qrWrap.appendChild(qrBox); qrWrap.appendChild(descargarBtn);
    card.appendChild(qrWrap);

    // (2026-09-30) qrcodejs vía cdnjs, cargada dinámica — mismo patrón
    // probado en otros sistemas del usuario (ver assets/js/qr.js).
    global.NG_QR.renderizar(qrDiv, link).then(function () {
      descargarBtn.style.display = "inline-block";
      descargarBtn.addEventListener("click", function () {
        global.NG_QR.descargar(qrContainerId, (evento.titulo || "evento").replace(/[^a-z0-9]+/gi, "-") + "-qr");
      });
    }).catch(function (err) {
      qrBox.appendChild(el("p", { style: "font-size:12px;color:var(--text-faint);text-align:center;" }, ["No se pudo cargar el generador de QR. Revisa tu conexión o algún bloqueador de anuncios."]));
      console.error(err);
    });

    if (puedeGestionar) {
      var desactivarBtn = el("button", { class: "btn btn-ghost", type: "button" }, ["Desactivar inscripción pública"]);
      desactivarBtn.addEventListener("click", function () {
        if (!window.confirm("¿Desactivar la inscripción pública? El link dejará de aceptar nuevas confirmaciones (el mismo código se reutiliza si la vuelves a activar).")) return;
        desactivarBtn.disabled = true;
        global.NG_DATA.eventos.desactivarInscripcionPublica(evento.id)
          .then(function () { global.NG_ROUTER.route(); })
          .catch(function (err) { desactivarBtn.disabled = false; global.NG_TOAST.show(global.NG_ERR.format(err), "error"); });
      });
      card.appendChild(desactivarBtn);
    }
    root.appendChild(card);

    // -----------------------------------------------------------------
    // Inscritos
    // -----------------------------------------------------------------
    root.appendChild(el("div", { class: "section-title", style: "margin-top:24px;" }, ["Inscritos"]));
    var inscritos = await global.NG_DATA.inscripciones.listarDeEvento(evento.id);
    var confirmados = inscritos.filter(function (r) { return r.estado === "confirmado"; });

    if (!inscritos.length) {
      root.appendChild(el("div", { class: "empty-state" }, ["Todavía nadie se ha inscrito."]));
      return;
    }

    if (puedeGestionar && confirmados.length) {
      var cargarBtn = S.actionBtn("Cargar los " + confirmados.length + " inscritos a Asistencia", function () {
        cargarInscritosAAsistencia(evento, confirmados, cargarBtn);
      });
      root.appendChild(el("div", { style: "margin-bottom:14px;" }, [cargarBtn]));
    }

    var tw = el("div", { class: "table-wrap" });
    var table = el("table", {}, [el("tr", {}, [el("th", {}, ["Nombre"]), el("th", {}, ["Provincia / Distrito"]), el("th", {}, ["Inscrito el"]), el("th", {}, ["Estado"])])]);
    inscritos.forEach(function (r) {
      var ubicacion = [r.provincia, r.distrito].filter(Boolean).join(" / ") || "—";
      table.appendChild(el("tr", {}, [
        el("td", {}, [r.nombre]), el("td", {}, [ubicacion]),
        el("td", { class: "mono" }, [new Date(r.createdAt).toLocaleDateString("es-PE")]),
        el("td", {}, [el("span", { class: "badge-estado " + (r.estado === "confirmado" ? "badge-hecho" : "badge-en_curso") }, [r.estado === "confirmado" ? "Confirmado" : "Cancelado"])])
      ]));
    });
    tw.appendChild(table); root.appendChild(tw);
  }

  // Reutiliza EXACTAMENTE el mismo camino que la pantalla de Asistencia
  // (crearLista si hace falta + agregarAsistentes) — así lo que llega acá
  // queda sujeto a la misma auditoría/validación de siempre, en vez de
  // acreditar puntos directo desde la inscripción pública.
  async function cargarInscritosAAsistencia(evento, confirmados, btn) {
    btn.disabled = true; btn.textContent = "Cargando…";
    try {
      var lista = await global.NG_DATA.asistencia.obtenerListaDeEvento(evento.id);
      if (!lista) lista = await global.NG_DATA.asistencia.crearLista(evento.id);
      var yaEnLista = {};
      (await global.NG_DATA.asistencia.listarAsistentes(lista.listId)).forEach(function (a) { yaEnLista[a.usuarioId] = true; });
      var nuevos = confirmados.map(function (r) { return r.usuarioId; }).filter(function (uid) { return !yaEnLista[uid]; });
      if (nuevos.length) await global.NG_DATA.asistencia.agregarAsistentes(lista.listId, nuevos);
      global.NG_TOAST.show(nuevos.length ? (nuevos.length + " inscrito(s) agregado(s) a la lista de Asistencia.") : "Ya estaban todos en la lista de Asistencia.", "success");
      location.hash = "#/asistencia/" + evento.id;
    } catch (err) {
      btn.disabled = false; btn.textContent = "Cargar los " + confirmados.length + " inscritos a Asistencia";
      global.NG_TOAST.show(global.NG_ERR.format(err), "error");
    }
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.eventos = viewEventos;
})(window);
