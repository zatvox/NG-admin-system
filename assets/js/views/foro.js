/* =====================================================================
 * views/foro.js — Foro de Ideas: lista de temas + detalle con hilo de
 * comentarios, voto de apoyo y cierre con conclusión/ruta de acción.
 * Reutiliza clases CSS ya existentes (card, post-*, badge-estado, chip)
 * en vez de inventar un set nuevo — ver ARCHITECTURE.md.
 * ===================================================================== */
(function (global) {
  "use strict";
  var q = global.NG_DOM.q, el = global.NG_DOM.el;
  var S = global.NG_SHARED, H = global.NG_VIEW_HELPERS, U = global.NG_UTILS;

  // Los 3 badges de tarea (pendiente/en_curso/hecho) ya existen en CSS —
  // se reutilizan aquí por color, no porque signifiquen lo mismo.
  var ESTADO_BADGE_CLASS = {
    abierto: "badge-pendiente",
    en_debate: "badge-en_curso",
    con_conclusion: "badge-hecho",
    cerrado: "badge-hecho"
  };

  async function viewForo() {
    H.setTitle("Foro de Ideas");
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var root = q("#view-root"); root.innerHTML = "";

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h1", {}, ["Foro de Ideas"]),
        el("p", {}, ["Plantea un problema concreto, debátelo con la comunidad y llévalo a una conclusión con ruta de acción — sin izquierda, derecha ni centro: solo soluciones, metas y resultados."])
      ]),
      S.actionBtn("+ Nuevo tema", function () { global.NG_openNuevoTemaForoModal(p, comisiones); })
    ]));

    if (!global.NG_DB) {
      root.appendChild(el("div", { class: "empty-state" }, ["El Foro necesita Supabase conectado — no tiene datos de ejemplo en modo demo."]));
      return;
    }

    var temas = await global.NG_DATA.foro.listarTemas(comisiones);

    var toolbar = el("div", { class: "toolbar" });
    var filterEstado = el("select", {}, [
      el("option", { value: "" }, ["Todos los estados"]),
      el("option", { value: "abierto" }, ["Abiertos a debate"]),
      el("option", { value: "en_debate" }, ["En debate"]),
      el("option", { value: "con_conclusion" }, ["Con conclusión"])
    ]);
    toolbar.appendChild(filterEstado);
    root.appendChild(toolbar);

    var container = el("div", { class: "grid grid-cols-2" });
    root.appendChild(container);

    function draw() {
      container.innerHTML = "";
      var f = filterEstado.value ? temas.filter(function (t) { return t.estado === filterEstado.value; }) : temas;
      if (!f.length) { container.appendChild(el("div", { class: "empty-state" }, ["Todavía no hay temas — sé el primero en plantear uno."])); return; }
      f.forEach(function (t) { container.appendChild(temaCard(t)); });
    }
    filterEstado.addEventListener("change", draw);
    draw();
  }

  function temaCard(t) {
    var card = el("div", { class: "card card-clickable post-card" });
    card.style.setProperty("--c", t.comisionColor || "var(--accent)");
    card.appendChild(el("div", { class: "post-head" }, [
      el("div", { class: "post-title" }, [t.titulo]),
      el("span", { class: "badge-estado " + (ESTADO_BADGE_CLASS[t.estado] || "badge-pendiente") }, [global.NG_DATA.foro.ESTADOS_LABEL[t.estado] || t.estado])
    ]));
    if (t.comisionNombre) card.appendChild(el("span", { class: "chip" }, [t.comisionNombre]));
    var resumen = t.problema.length > 160 ? (t.problema.slice(0, 160) + "…") : t.problema;
    card.appendChild(el("div", { class: "post-body" }, [resumen]));
    card.appendChild(el("div", { class: "post-meta" }, [
      (t.autor || "—") + " · " + U.fmtFecha(t.fecha) + " · " + t.totalComentarios + " comentario" + (t.totalComentarios === 1 ? "" : "s")
    ]));
    card.addEventListener("click", function () { location.hash = "#/foro/" + t.id; });
    return card;
  }

  async function viewForoDetalle(id) {
    var p = global.NG_STATE.persona;
    var comisiones = await global.NG_DATA.comisiones.listar();
    var tema = await global.NG_DATA.foro.obtenerTema(id, comisiones);
    var root = q("#view-root"); root.innerHTML = "";
    if (!tema) { H.setTitle("Tema no encontrado"); root.innerHTML = '<div class="empty-state">Este tema no existe.</div>'; return; }

    H.setTitle(tema.titulo, "Foro de Ideas");
    root.appendChild(H.crumbs([{ label: "Foro de Ideas", href: "#/foro" }, { label: tema.titulo }]));

    root.appendChild(el("div", { class: "view-head" }, [
      el("div", {}, [
        el("h1", {}, [tema.titulo]),
        el("p", {}, [(tema.autor || "—") + " · " + U.fmtFecha(tema.fecha) + (tema.comisionNombre ? " · " + tema.comisionNombre : "")])
      ]),
      el("span", { class: "badge-estado " + (ESTADO_BADGE_CLASS[tema.estado] || "badge-pendiente") }, [global.NG_DATA.foro.ESTADOS_LABEL[tema.estado] || tema.estado])
    ]));

    root.appendChild(el("div", { class: "section-title" }, ["El problema"]));
    root.appendChild(el("div", { class: "card" }, [el("p", {}, [tema.problema])]));

    // Espejo de foro_temas_update (rls-policies.sql): esto solo decide si
    // se muestra el botón — RLS es quien de verdad lo protege server-side.
    var puedeCerrar = global.NG_PERMS.canCerrarTemaForo(p, tema);

    if (tema.estado === "con_conclusion" && tema.conclusion) {
      root.appendChild(el("div", { class: "section-title" }, ["Conclusión y ruta de acción"]));
      root.appendChild(el("div", { class: "card", style: "border-left:3px solid var(--ok);" }, [
        el("p", { style: "font-weight:600;margin-bottom:8px;" }, [tema.conclusion]),
        el("p", { style: "color:var(--text-soft);" }, [tema.rutaAccion || ""])
      ]));
    } else if (puedeCerrar) {
      var closeBtn = el("button", { class: "btn btn-ghost", type: "button", style: "margin-bottom:16px;" }, ["Cerrar con conclusión y ruta de acción"]);
      closeBtn.addEventListener("click", function () {
        global.NG_openCerrarTemaForoModal(tema);
      });
      root.appendChild(closeBtn);
    }

    root.appendChild(el("div", { class: "section-title" }, ["Debate"]));
    var comentariosWrap = el("div", {});
    root.appendChild(comentariosWrap);

    async function redraw() {
      var comentarios = await global.NG_DATA.foro.listarComentarios(tema.id);
      comentariosWrap.innerHTML = "";
      if (!comentarios.length) comentariosWrap.appendChild(el("div", { class: "empty-state" }, ["Todavía nadie comentó — abre el debate."]));
      comentarios.forEach(function (c) { comentariosWrap.appendChild(comentarioCard(c, redraw)); });
      comentariosWrap.appendChild(formularioComentario());
    }

    function formularioComentario() {
      var formWrap = el("div", { class: "card", style: "margin-top:14px;" });
      var textarea = el("textarea", { placeholder: "Escribe tu idea, argumento o propuesta de solución…", rows: "3", style: "width:100%;" });
      var propuestaCheck = el("input", { type: "checkbox", id: "foro-es-propuesta" });
      var propuestaLabel = el("label", { for: "foro-es-propuesta", style: "display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-soft);margin-top:8px;cursor:pointer;" }, [
        propuestaCheck, "Marcar como propuesta de solución concreta"
      ]);
      var sendBtn = el("button", { class: "btn btn-accent", type: "button", style: "margin-top:10px;" }, ["Comentar"]);
      sendBtn.addEventListener("click", function () {
        var texto = textarea.value.trim();
        if (!texto) { global.NG_TOAST.show("Escribe algo antes de comentar.", "error"); return; }
        sendBtn.disabled = true; sendBtn.textContent = "Enviando…";
        global.NG_DATA.foro.comentar(tema.id, texto, propuestaCheck.checked)
          .then(function () {
            // El primer comentario "abre" el debate: pasa de "abierto" a
            // "en_debate" para que la lista distinga de un vistazo qué
            // temas siguen sin ninguna respuesta.
            if (tema.estado === "abierto") {
              return global.NG_DATA.foro.marcarEnDebate(tema.id).then(function () { tema.estado = "en_debate"; });
            }
          })
          .then(function () { redraw(); })
          .catch(function (err) {
            sendBtn.disabled = false; sendBtn.textContent = "Comentar";
            global.NG_TOAST.show(global.NG_ERR.format(err), "error");
          });
      });
      formWrap.appendChild(textarea); formWrap.appendChild(propuestaLabel); formWrap.appendChild(sendBtn);
      return formWrap;
    }

    redraw();
  }

  function comentarioCard(c, onVoteChange) {
    var card = el("div", { class: "card", style: "margin-bottom:10px;" + (c.esPropuesta ? "border-left:3px solid var(--accent);" : "") });
    var headBits = [
      el("span", { style: "font-weight:600;font-size:13px;color:var(--ink);" }, [c.autor]),
      el("span", { style: "color:var(--text-faint);font-size:11.5px;margin-left:8px;" }, [U.fmtFecha(c.fecha)])
    ];
    if (c.esPropuesta) headBits.push(el("span", { class: "chip", style: "margin-left:8px;" }, ["Propuesta"]));
    card.appendChild(el("div", {}, headBits));
    card.appendChild(el("p", { style: "margin-top:6px;" }, [c.cuerpo]));

    var voteBtn = el("button", { class: "btn btn-ghost", type: "button", style: "font-size:12px;padding:5px 10px;margin-top:8px;" },
      [(c.yoVote ? "✓ Apoyado" : "Apoyar") + " (" + c.votos + ")"]);
    voteBtn.addEventListener("click", function () {
      voteBtn.disabled = true;
      var accion = c.yoVote ? global.NG_DATA.foro.quitarVoto(c.id) : global.NG_DATA.foro.votar(c.id);
      accion.then(onVoteChange).catch(function (err) {
        voteBtn.disabled = false;
        global.NG_TOAST.show(global.NG_ERR.format(err), "error");
      });
    });
    card.appendChild(voteBtn);
    return card;
  }

  global.NG_VIEWS = global.NG_VIEWS || {};
  global.NG_VIEWS.foro = viewForo;
  global.NG_VIEWS.foroDetalle = viewForoDetalle;
})(window);
