/* =====================================================================
 * app.js — Bootstrap de la aplicación (app.html). Se ejecuta al final,
 * después de que todas las vistas ya se registraron en window.NG_VIEWS.
 * Responsabilidades: cargar la sesión (real o demo), pintar sidebar y
 * topbar según el rol, y arrancar el router.
 * ===================================================================== */
(function () {
  "use strict";
  var q = window.NG_DOM.q, el = window.NG_DOM.el, esc = window.NG_DOM.esc;
  var U = window.NG_UTILS;

  // Estado global compartido por todas las vistas (assets/js/views/*.js).
  var TODAY = new Date();
  window.NG_STATE = {
    persona: null,
    today: TODAY,
    calMonth: TODAY.getMonth(),
    calYear: TODAY.getFullYear(),
    appConfig: {} // se llena con data/configuracion.js al iniciar (nombre org, colores, etc.)
  };

  function initials(nombre) { return U.initials(nombre).toUpperCase(); }

  function renderNav() {
    var nav = q("#main-nav");
    var current = (location.hash.replace("#/", "").split("/")[0]) || "dashboard";
    nav.innerHTML = "";
    window.NG_PERMS.NAV.forEach(function (item) {
      if (item.roles.indexOf(window.NG_STATE.persona.rol) < 0) return;
      var div = el("div", { class: "nav-item" + (item.route === current ? " active" : "") }, [
        el("span", { class: "nav-dot" }), item.label
      ]);
      div.addEventListener("click", function () {
        location.hash = "#/" + item.route;
        closeSidebarMobile();
      });
      nav.appendChild(div);
    });
  }
  window.NG_renderNav = renderNav; // el router lo vuelve a llamar en cada navegación (resalta el activo)

  function closeSidebarMobile() {
    q("#sidebar").classList.remove("open");
    q("#overlay").classList.remove("show");
  }
  q("#hamburger").addEventListener("click", function () {
    q("#sidebar").classList.toggle("open");
    q("#overlay").classList.toggle("show");
  });
  q("#overlay").addEventListener("click", closeSidebarMobile);

  q("#topbar-enlistarse").addEventListener("click", function () {
    location.hash = "#/comisiones";
    window.NG_ROUTER.route();
    window.NG_TOAST.show('Elige una comisión y luego "Unirme a este comando" en el comando que quieras.', "info");
  });

  function applyBranding(cfg) {
    var nombre = cfg["organizacion.nombre"] || "Nueva Generación";
    var eslogan = cfg["organizacion.eslogan"] || "Sistema de Comisiones";
    q("#brand-title").textContent = nombre;
    q("#brand-sub").textContent = eslogan;
    document.title = nombre + " — " + eslogan;
    if (cfg["marca.color_primario"]) document.documentElement.style.setProperty("--ink", cfg["marca.color_primario"]);
    if (cfg["marca.color_acento"]) document.documentElement.style.setProperty("--accent", cfg["marca.color_acento"]);
  }
  window.NG_applyBrandingLive = applyBranding; // usado por views/configuracion.js tras guardar

  var ROL_LABELS = {
    direccion: "Dirección General", lider: "Líder de Comisión", coordinador: "Coordinador/a",
    miembro: "Miembro", colaborador: "Colaborador"
  };

  // El chip del topbar SIEMPRE se muestra (antes se ocultaba si no tenías
  // comisión, y por eso no se notaba en qué rol/estado estabas). El botón
  // "Enlistarse" solo aparece para Colaborador (= sin comando todavía).
  // (2026-07-27) Ahora es un <a> clickeable que lleva directo a tu comisión,
  // y usa el color real de la comisión como fondo (--c) en vez de gris fijo.
  function updateTopbarContext() {
    var box = q("#topbar-context");
    var enlistBtn = q("#topbar-enlistarse");
    var p = window.NG_STATE.persona;
    var rolLabel = ROL_LABELS[p.rol] || p.rol;

    if (enlistBtn) enlistBtn.style.display = (p.rol === "colaborador") ? "inline-flex" : "none";

    if (!p.comisionId) {
      box.innerHTML = esc(rolLabel) + " · Sin comisión asignada";
      box.style.display = "inline-flex";
      box.href = "#/comisiones";
      box.style.removeProperty("--c");
      return;
    }
    window.NG_DATA.comisiones.listar().then(function (comisiones) {
      var c = comisiones.filter(function (x) { return x.id === p.comisionId; })[0];
      if (!c) { box.innerHTML = esc(rolLabel); box.style.display = "inline-flex"; box.href = "#/comisiones"; return; }
      var sub = p.subgrupoId ? c.subgrupos.filter(function (s) { return s.id === p.subgrupoId; })[0] : null;
      box.innerHTML = esc(rolLabel) + ' · <span class="dot" style="background:' + c.color + ';width:6px;height:6px;"></span>' + esc(c.nombre) + (sub ? " · " + esc(sub.nombre) : "");
      box.style.display = "inline-flex";
      box.style.setProperty("--c", c.color);
      box.href = sub ? "#/subgrupo/" + sub.id : "#/comisiones/" + c.id;
    });
  }

  // =====================================================================
  // Buscador global — indexa tareas, comandos, miembros y temas del foro
  // en memoria (a partir de lo que ya trae comisiones.listar()/foro.
  // listarTemas(), sin pegarle a Supabase en cada tecla) y filtra por
  // substring insensible a mayúsculas, igual criterio que el userpicker
  // de asignación de tareas.
  // =====================================================================
  var searchIndex = null;
  // Se invalida desde router.js en cada navegación (barato: solo pone en
  // null una variable) para que, después de crear/editar algo en cualquier
  // vista, la próxima búsqueda ya lo incluya sin tener que recargar la página.
  window.NG_resetSearchIndex = function () { searchIndex = null; };
  function construirIndiceBusqueda() {
    if (searchIndex) return Promise.resolve(searchIndex);
    return window.NG_DATA.comisiones.listar().then(function (comisiones) {
      var items = [];
      var vistosMiembro = {};
      comisiones.forEach(function (c) {
        c.subgrupos.forEach(function (s) {
          items.push({ tipo: "Comando", label: s.nombre, sub: c.nombre, route: "#/subgrupo/" + s.id });
          (s.miembrosConId || []).forEach(function (m) {
            if (vistosMiembro[m.id]) return;
            vistosMiembro[m.id] = true;
            items.push({ tipo: "Miembro", label: m.nombre, sub: "Directorio", route: "#/directorio" });
          });
          (s.tareas || []).forEach(function (t) {
            items.push({ tipo: "Tarea", label: t.titulo, sub: c.nombre + " · " + s.nombre, route: "#/subgrupo/" + s.id });
          });
        });
      });
      var temasPromise = window.NG_DB ? window.NG_DATA.foro.listarTemas(comisiones) : Promise.resolve([]);
      return temasPromise.then(function (temas) {
        temas.forEach(function (t) {
          items.push({ tipo: "Foro", label: t.titulo, sub: window.NG_DATA.foro.ESTADOS_LABEL[t.estado] || t.estado, route: "#/foro/" + t.id });
        });
        searchIndex = items;
        return items;
      });
    });
  }

  function wireGlobalSearch() {
    var input = q("#topbar-search");
    var panel = q("#topbar-search-results");
    if (!input || !panel) return;

    function render(query) {
      var texto = query.trim().toLowerCase();
      if (!texto) { panel.classList.remove("open"); panel.innerHTML = ""; return; }
      construirIndiceBusqueda().then(function (items) {
        var encontrados = items.filter(function (it) { return it.label.toLowerCase().indexOf(texto) >= 0; }).slice(0, 30);
        panel.innerHTML = "";
        if (!encontrados.length) {
          panel.appendChild(el("div", { class: "topbar-panel-empty" }, ['Nada coincide con "' + query + '".']));
        } else {
          var grupos = {};
          encontrados.forEach(function (it) { (grupos[it.tipo] = grupos[it.tipo] || []).push(it); });
          Object.keys(grupos).forEach(function (tipo) {
            panel.appendChild(el("div", { class: "topbar-panel-group-label" }, [tipo]));
            grupos[tipo].slice(0, 6).forEach(function (it) {
              var row = el("div", { class: "topbar-panel-item" }, [it.label, el("span", { class: "sub" }, [it.sub])]);
              row.addEventListener("click", function () {
                location.hash = it.route;
                input.value = ""; panel.classList.remove("open"); panel.innerHTML = "";
              });
              panel.appendChild(row);
            });
          });
        }
        panel.classList.add("open");
      });
    }
    input.addEventListener("input", U.debounce(function () { render(input.value); }, 200));
    input.addEventListener("focus", function () { if (input.value.trim()) render(input.value); });
  }

  // =====================================================================
  // Crear rápido ("+"): mismos modales que ya usan las vistas, solo que
  // accesibles desde cualquier pantalla. Qué opciones aparecen respeta
  // exactamente los mismos criterios de rol que ya usan tareas-calendario.js
  // y modal-openers.js — esto es un atajo de navegación, no una puerta de
  // permisos nueva (la seguridad real sigue siendo RLS).
  // =====================================================================
  function wireQuickCreate() {
    var btn = q("#topbar-quickcreate-btn");
    var panel = q("#topbar-quickcreate-panel");
    if (!btn || !panel) return;

    function render() {
      var p = window.NG_STATE.persona;
      window.NG_DATA.comisiones.listar().then(function (comisiones) {
        panel.innerHTML = "";
        var comisionesVisibles = p.rol === "direccion" ? comisiones : comisiones.filter(function (c) { return c.id === p.comisionId; });

        var opciones = [];
        if (p.rol !== "miembro") {
          opciones.push({ label: "+ Nueva tarea", accion: function () { window.NG_openNuevaTareaModalGlobal(p, comisionesVisibles); } });
        }
        if (p.rol === "direccion" || p.rol === "lider" || p.rol === "coordinador") {
          opciones.push({ label: "+ Nuevo evento", accion: function () { window.NG_openNuevoEventoModal(p, comisiones); } });
        }
        if (window.NG_PERMS.canPostComunicado(p)) {
          opciones.push({ label: "+ Nuevo comunicado", accion: function () { window.NG_openNuevoComunicadoModal(p, comisiones); } });
        }
        if (window.NG_PERMS.canPostEnlaceOEvento(p)) {
          opciones.push({ label: "+ Nuevo enlace", accion: function () { window.NG_openNuevoEnlaceModal(p, comisiones); } });
        }
        opciones.push({ label: "+ Nuevo tema del Foro", accion: function () { window.NG_openNuevoTemaForoModal(p, comisiones); } });

        opciones.forEach(function (o) {
          var row = el("div", { class: "topbar-panel-item" }, [o.label]);
          row.addEventListener("click", function () { closeAllDropdowns(); o.accion(); });
          panel.appendChild(row);
        });
      });
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var abriendo = !panel.classList.contains("open");
      closeAllDropdowns();
      if (abriendo) { render(); panel.classList.add("open"); }
    });
  }

  // =====================================================================
  // Notificaciones — se calculan al vuelo cada vez que se abre el panel,
  // NO hay tabla de notificaciones ni estado de "leído" persistente
  // todavía (candidato a mejora futura si esto resulta útil). Cubre dos
  // cosas honestas de calcular con lo que ya existe: tareas propias por
  // vencer/vencidas, y comunicados publicados en los últimos 3 días.
  // =====================================================================
  function wireNotifications() {
    var btn = q("#topbar-notif-btn");
    var panel = q("#topbar-notif-panel");
    var badge = q("#topbar-notif-badge");
    if (!btn || !panel) return;

    function actualizarBadge() {
      if (!window.NG_DB) { badge.style.display = "none"; return; }
      var p = window.NG_STATE.persona;
      Promise.all([window.NG_DATA.comisiones.listar(), window.NG_DATA.comunicados.listar()]).then(function (res) {
        var n = contarNotificaciones(p, res[0], res[1]);
        if (n > 0) { badge.textContent = n > 9 ? "9+" : String(n); badge.style.display = "flex"; }
        else badge.style.display = "none";
      });
    }

    function contarNotificaciones(p, comisiones, comunicados) {
      var hoy = window.NG_STATE.today;
      var misTareas = window.NG_SHARED.allTareas(comisiones).filter(function (t) {
        if (t.estado === "hecho") return false;
        var mia = (t.asignados || []).some(function (a) { return a.id === p.id || a.nombre === p.nombre; });
        return mia && U.diasRestantes(t.fecha, hoy) <= 3;
      });
      var comunicadosRecientes = comunicados.filter(function (c) {
        var propio = c.alcance === "general" || c.comisionId === p.comisionId;
        return propio && U.diasRestantes(c.fecha, hoy) >= -3 && U.diasRestantes(c.fecha, hoy) <= 0;
      });
      return misTareas.length + comunicadosRecientes.length;
    }

    function render() {
      var p = window.NG_STATE.persona;
      if (!window.NG_DB) {
        panel.innerHTML = "";
        panel.appendChild(el("div", { class: "topbar-panel-empty" }, ["Las notificaciones requieren Supabase conectado."]));
        return;
      }
      Promise.all([window.NG_DATA.comisiones.listar(), window.NG_DATA.comunicados.listar()]).then(function (res) {
        var comisiones = res[0], comunicados = res[1];
        var hoy = window.NG_STATE.today;
        var misTareas = window.NG_SHARED.allTareas(comisiones).filter(function (t) {
          if (t.estado === "hecho") return false;
          var mia = (t.asignados || []).some(function (a) { return a.id === p.id || a.nombre === p.nombre; });
          return mia && U.diasRestantes(t.fecha, hoy) <= 3;
        }).sort(function (a, b) { return U.diasRestantes(a.fecha, hoy) - U.diasRestantes(b.fecha, hoy); });
        var comunicadosRecientes = comunicados.filter(function (c) {
          var propio = c.alcance === "general" || c.comisionId === p.comisionId;
          return propio && U.diasRestantes(c.fecha, hoy) >= -3 && U.diasRestantes(c.fecha, hoy) <= 0;
        });

        panel.innerHTML = "";
        if (!misTareas.length && !comunicadosRecientes.length) {
          panel.appendChild(el("div", { class: "topbar-panel-empty" }, ["Estás al día — nada pendiente por ahora."]));
          return;
        }
        if (misTareas.length) {
          panel.appendChild(el("div", { class: "topbar-panel-group-label" }, ["Tus tareas por vencer"]));
          misTareas.forEach(function (t) {
            var dias = U.diasRestantes(t.fecha, hoy);
            var cuando = dias < 0 ? "Vencida hace " + Math.abs(dias) + " día" + (Math.abs(dias) === 1 ? "" : "s")
              : dias === 0 ? "Vence hoy" : "Vence en " + dias + " día" + (dias === 1 ? "" : "s");
            var row = el("div", { class: "topbar-panel-item" }, [t.titulo, el("span", { class: "sub" }, [cuando + " · " + t.subgrupoNombre])]);
            row.addEventListener("click", function () { location.hash = "#/subgrupo/" + t.subgrupoId; closeAllDropdowns(); });
            panel.appendChild(row);
          });
        }
        if (comunicadosRecientes.length) {
          panel.appendChild(el("div", { class: "topbar-panel-group-label" }, ["Comunicados recientes"]));
          comunicadosRecientes.forEach(function (c) {
            var row = el("div", { class: "topbar-panel-item" }, [c.titulo, el("span", { class: "sub" }, [U.fmtFecha(c.fecha)])]);
            row.addEventListener("click", function () { location.hash = "#/comunicaciones"; closeAllDropdowns(); });
            panel.appendChild(row);
          });
        }
      });
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var abriendo = !panel.classList.contains("open");
      closeAllDropdowns();
      if (abriendo) { render(); panel.classList.add("open"); }
    });
    window.NG_refreshNotifBadge = actualizarBadge;
    actualizarBadge();
  }

  function closeAllDropdowns() {
    ["#topbar-quickcreate-panel", "#topbar-notif-panel", "#topbar-search-results"].forEach(function (sel) {
      var p = q(sel);
      if (p) p.classList.remove("open");
    });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || (!e.target.closest(".topbar-dropdown") && !e.target.closest(".topbar-search"))) closeAllDropdowns();
  });

  // Re-deriva la persona (rol/comisión/comando) sin pedir login de nuevo y
  // navega a `route` si se pasa. Se usa tras "Unirme a este comando" para
  // que el topbar, el menú lateral y los permisos se actualicen al toque.
  function refreshPersonaAndGo(route) {
    window.NG_AUTH.refresh().then(function (persona) {
      setPersona(persona);
      if (route) location.hash = route;
      window.NG_ROUTER.route();
    }).catch(function (err) {
      window.NG_TOAST.show(window.NG_ERR.format(err), "error");
    });
  }
  window.NG_refreshPersonaAndGo = refreshPersonaAndGo;

  function setPersona(persona) {
    window.NG_STATE.persona = persona;
    q("#topbar-avatar").textContent = initials(persona.nombre);
    updateTopbarContext();
    renderNav();
  }

  function wireTopbar() {
    if (window.NG_AUTH.isDemo) {
      q("#persona-switch").style.display = "flex";
      var select = q("#topbar-persona");
      select.innerHTML = window.NG_AUTH.demoPersonas.map(function (p) {
        return '<option value="' + p.id + '">' + esc(p.nombre) + " — " + esc(p.desc) + "</option>";
      }).join("");
      select.value = window.NG_STATE.persona.id;
      select.addEventListener("change", function (e) {
        window.NG_AUTH.login(e.target.value).then(function (persona) {
          setPersona(persona);
          var current = location.hash.replace("#/", "").split("/")[0] || "dashboard";
          if (!window.NG_PERMS.canAccess(current, persona)) location.hash = "#/dashboard";
          window.NG_ROUTER.route();
          window.NG_TOAST.show("Ahora estás viendo el sistema como " + persona.nombre + ".", "info");
        });
      });
    } else {
      q("#logout-btn").style.display = "inline-flex";
      q("#logout-btn").addEventListener("click", function () {
        window.NG_AUTH.logout().then(function () { window.location.href = "login.html"; });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    window.NG_AUTH.getSession().then(function (persona) {
      if (!persona) { window.location.href = "login.html"; return; }

      setPersona(persona);
      wireTopbar();
      wireGlobalSearch();
      wireQuickCreate();
      wireNotifications();
      q("#sidebar-foot").textContent = window.NG_AUTH.isDemo ? "DEMO · sin base de datos" : "Conectado a Supabase";
      q("#app-shell").style.display = "flex";

      window.NG_DATA.configuracion.obtener().then(function (cfg) {
        window.NG_STATE.appConfig = cfg;
        applyBranding(cfg);
      });

      // (2026-07-27) Bug de "todo se ve duplicado en Inicio la primera vez":
      // cuando NO había hash todavía, "location.hash = ..." dispara un
      // evento 'hashchange' (ver listener al final de este archivo), que
      // ya llama a route() por su cuenta — y la línea de abajo la llamaba
      // OTRA VEZ, de inmediato. Como viewDashboard() es async y solo limpia
      // #view-root una vez al principio (antes de sus propios awaits), las
      // dos ejecuciones se entrelazaban y cada bloque (KPIs, tarjetas de
      // comisión) terminaba apareciendo dos veces. Basta con NO llamar a
      // route() manualmente cuando ya sabemos que el cambio de hash la va
      // a disparar sola; solo se llama a mano cuando el hash YA tenía un
      // valor (ese caso no dispara 'hashchange', porque no cambia nada).
      if (!location.hash) {
        location.hash = "#/dashboard";
      } else {
        window.NG_ROUTER.route();
      }
    }).catch(function () {
      window.location.href = "login.html";
    });
  });

  window.addEventListener("hashchange", function () { window.NG_ROUTER.route(); });
})();
