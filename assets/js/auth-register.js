/* =====================================================================
 * auth-register.js — Lógica de register.html.
 * En modo demo no se puede registrar de verdad (no hay backend real);
 * se informa y se redirige a login.html para usar un perfil de demo.
 * ===================================================================== */
(function () {
  "use strict";
  var q = window.NG_DOM.q;

  // Toggle mostrar/ocultar contraseña (mismo patrón que login.html). Se
  // reutiliza para los dos campos del formulario (contraseña y repetir).
  var ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.6 20.6 0 0 1 4.22-5.44M9.9 4.24A9.7 9.7 0 0 1 12 4c7 0 11 7 11 7a20.6 20.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function wireToggle(inputId, btnId) {
    var toggle = q(btnId);
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var input = q(inputId);
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      toggle.innerHTML = showing ? ICON_EYE : ICON_EYE_OFF;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireToggle("#reg-password", "#reg-password-toggle");
    wireToggle("#reg-password2", "#reg-password2-toggle");

    if (window.NG_AUTH.isDemo) {
      q("#demo-banner").style.display = "block";
      q("#register-form").style.display = "none";
      return;
    }

    q("#register-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nombre = q("#reg-nombre").value.trim();
      var email = q("#reg-email").value.trim();
      var password = q("#reg-password").value;
      var password2 = q("#reg-password2").value;
      var errorBox = q("#register-error");
      errorBox.style.display = "none";

      if (password !== password2) {
        errorBox.textContent = "Las contraseñas no coinciden.";
        errorBox.style.display = "block";
        return;
      }
      if (password.length < 8) {
        errorBox.textContent = "La contraseña debe tener al menos 8 caracteres.";
        errorBox.style.display = "block";
        return;
      }

      var btn = q("#register-btn");
      btn.disabled = true; btn.textContent = "Creando cuenta…";

      // Mismo patrón que forgot-password.html: se manda explícito a dónde
      // debe volver el link del correo de confirmación, en vez de confiar
      // en que el "Site URL" del panel de Supabase esté bien puesto.
      var redirectTo = window.location.origin + window.location.pathname.replace("register.html", "login.html");
      window.NG_AUTH.register(email, password, nombre, redirectTo)
        .then(function () {
          q("#register-form").style.display = "none";
          q("#register-success").style.display = "block";
        })
        .catch(function (err) {
          btn.disabled = false; btn.textContent = "Crear cuenta";
          errorBox.textContent = window.NG_ERR.format(err);
          errorBox.style.display = "block";
        });
    });
  });
})();
