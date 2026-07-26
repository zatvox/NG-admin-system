/* =====================================================================
 * auth-reset.js — Lógica de reset-password.html.
 * ---------------------------------------------------------------------
 * El link del correo de recuperación (resetPasswordForEmail) trae el
 * token en el FRAGMENTO de la URL (#access_token=...&type=recovery).
 * supabase-js lo procesa solo al cargar la página (detectSessionInUrl,
 * activado por defecto) y arma una sesión especial de tipo "recovery".
 * Esta página espera ese evento (PASSWORD_RECOVERY) antes de mostrar el
 * formulario; si nunca llega (link viejo, ya usado, o abierto sin pasar
 * por el correo), muestra el aviso de "enlace inválido".
 * ===================================================================== */
(function () {
  "use strict";
  var q = window.NG_DOM.q;

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
    wireToggle("#reset-password", "#reset-password-toggle");
    wireToggle("#reset-password2", "#reset-password2-toggle");

    if (window.NG_AUTH.isDemo) {
      q("#demo-banner").style.display = "block";
      q("#reset-loading").style.display = "none";
      return;
    }

    var db = window.NG_DB;
    var loading = q("#reset-loading");
    var invalido = q("#link-invalido");
    var form = q("#reset-form");
    var yaMostrado = false;

    function mostrarFormulario() {
      if (yaMostrado) return;
      yaMostrado = true;
      loading.style.display = "none";
      invalido.style.display = "none";
      form.style.display = "block";
    }
    function mostrarInvalido() {
      if (yaMostrado) return;
      loading.style.display = "none";
      form.style.display = "none";
      invalido.style.display = "block";
    }

    db.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") mostrarFormulario();
    });

    // Respaldo por si el evento ya se disparó antes de conectar el
    // listener de arriba (carrera posible en conexiones lentas).
    db.auth.getSession().then(function (res) {
      if (res.data && res.data.session) mostrarFormulario();
    });

    // Si en 3 segundos no pasó nada, el link no era válido.
    setTimeout(function () { if (!yaMostrado) mostrarInvalido(); }, 3000);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var p1 = q("#reset-password").value;
      var p2 = q("#reset-password2").value;
      var errorBox = q("#reset-error");
      errorBox.style.display = "none";

      if (p1 !== p2) {
        errorBox.textContent = "Las contraseñas no coinciden.";
        errorBox.style.display = "block";
        return;
      }
      if (p1.length < 8) {
        errorBox.textContent = "La contraseña debe tener al menos 8 caracteres.";
        errorBox.style.display = "block";
        return;
      }

      var btn = q("#reset-btn");
      btn.disabled = true; btn.textContent = "Guardando…";
      window.NG_AUTH.updatePassword(p1)
        .then(function () {
          form.style.display = "none";
          q("#reset-success").style.display = "block";
        })
        .catch(function (err) {
          btn.disabled = false; btn.textContent = "Guardar contraseña nueva";
          errorBox.textContent = window.NG_ERR.format(err);
          errorBox.style.display = "block";
        });
    });
  });
})();
