/* =====================================================================
 * auth-login.js — Lógica de login.html.
 * Si Supabase no está configurado (config.js con placeholders) se
 * muestra el selector de "perfil de demo"; si está configurado, se
 * muestra el formulario real de email + contraseña.
 * ===================================================================== */
(function () {
  "use strict";
  var q = window.NG_DOM.q;

  document.addEventListener("DOMContentLoaded", function () {
    var demoBanner = q("#demo-banner");
    var demoBlock = q("#demo-block");
    var realBlock = q("#real-block");
    var demoSelect = q("#login-persona");

    if (window.NG_AUTH.isDemo) {
      demoBanner.style.display = "block";
      demoBlock.style.display = "block";
      realBlock.style.display = "none";

      demoSelect.innerHTML = window.NG_AUTH.demoPersonas.map(function (p) {
        return '<option value="' + p.id + '">' + window.NG_DOM.esc(p.nombre) + " — " + window.NG_DOM.esc(p.desc) + "</option>";
      }).join("");

      q("#demo-login-btn").addEventListener("click", function () {
        window.NG_AUTH.login(demoSelect.value)
          .then(function () { window.location.href = "app.html"; })
          .catch(function (err) { window.alert(window.NG_ERR.format(err)); });
      });
    } else {
      demoBanner.style.display = "none";
      demoBlock.style.display = "none";
      realBlock.style.display = "block";

      q("#real-login-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var email = q("#login-email").value.trim();
        var password = q("#login-password").value;
        var btn = q("#real-login-btn");
        var errorBox = q("#login-error");
        errorBox.style.display = "none";
        btn.disabled = true; btn.textContent = "Ingresando…";

        window.NG_AUTH.login(email, password)
          .then(function () { window.location.href = "app.html"; })
          .catch(function (err) {
            btn.disabled = false; btn.textContent = "Ingresar →";
            errorBox.textContent = window.NG_ERR.format(err);
            errorBox.style.display = "block";
          });
      });
    }

    // Si ya hay sesión activa, saltar directo a la app. Si falla (ej. la
    // cuenta existe en Auth pero su perfil en `usuarios` tiene un problema),
    // se avisa en vez de dejar la pantalla en blanco sin explicación.
    window.NG_AUTH.getSession()
      .then(function (persona) { if (persona) window.location.href = "app.html"; })
      .catch(function (err) {
        var errorBox = q("#login-error");
        if (errorBox) { errorBox.textContent = window.NG_ERR.format(err); errorBox.style.display = "block"; }
      });

    // Toggle mostrar/ocultar contraseña (mismo patrón en las 3 páginas de auth).
    var toggle = q("#password-toggle");
    if (toggle) {
      var ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
      var ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.6 20.6 0 0 1 4.22-5.44M9.9 4.24A9.7 9.7 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
      toggle.addEventListener("click", function () {
        var input = q("#login-password");
        var showing = input.type === "text";
        input.type = showing ? "password" : "text";
        toggle.innerHTML = showing ? ICON_EYE : ICON_EYE_OFF;
      });
    }
  });
})();
