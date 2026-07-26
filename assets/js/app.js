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
  function updateTopbarContext() {
    var box = q("#topbar-context");
    var enlistBtn = q("#topbar-enlistarse");
    var p = window.NG_STATE.persona;
    var rolLabel = ROL_LABELS[p.rol] || p.rol;

    if (enlistBtn) enlistBtn.style.display = (p.rol === "colaborador") ? "inline-flex" : "none";

    if (!p.comisionId) {
      box.innerHTML = esc(rolLabel) + " · Sin comisión asignada";
      box.style.display = "inline-flex";
      return;
    }
    window.NG_DATA.comisiones.listar().then(function (comisiones) {
      var c = comisiones.filter(function (x) { return x.id === p.comisionId; })[0];
      if (!c) { box.innerHTML = esc(rolLabel); box.style.display = "inline-flex"; return; }
      var sub = p.subgrupoId ? c.subgrupos.filter(function (s) { return s.id === p.subgrupoId; })[0] : null;
      box.innerHTML = esc(rolLabel) + ' · <span class="dot" style="background:' + c.color + ';width:6px;height:6px;"></span>' + esc(c.nombre) + (sub ? " · " + esc(sub.nombre) : "");
      box.style.display = "inline-flex";
    });
  }

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
      q("#sidebar-foot").textContent = window.NG_AUTH.isDemo ? "DEMO · sin base de datos" : "Conectado a Supabase";
      q("#app-shell").style.display = "flex";

      window.NG_DATA.configuracion.obtener().then(function (cfg) {
        window.NG_STATE.appConfig = cfg;
        applyBranding(cfg);
      });

      if (!location.hash) location.hash = "#/dashboard";
      window.NG_ROUTER.route();
    }).catch(function () {
      window.location.href = "login.html";
    });
  });

  window.addEventListener("hashchange", function () { window.NG_ROUTER.route(); });
})();
