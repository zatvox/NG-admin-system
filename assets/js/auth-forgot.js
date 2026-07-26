/* =====================================================================
 * auth-forgot.js — Lógica de forgot-password.html.
 * Envía el correo de recuperación vía Supabase Auth (resetPasswordForEmail).
 * ===================================================================== */
(function () {
  "use strict";
  var q = window.NG_DOM.q;

  document.addEventListener("DOMContentLoaded", function () {
    if (window.NG_AUTH.isDemo) {
      q("#demo-banner").style.display = "block";
      q("#forgot-form").style.display = "none";
      return;
    }

    q("#forgot-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = q("#forgot-email").value.trim();
      var errorBox = q("#forgot-error");
      errorBox.style.display = "none";
      var btn = q("#forgot-btn");
      btn.disabled = true; btn.textContent = "Enviando…";

      // (2026-07-26) Iba a login.html — pero esa página no sabe leer el
      // token de recuperación que trae el link del correo, así que el
      // usuario llegaba a un login normal, sin forma real de poner una
      // contraseña nueva. Debe ir a reset-password.html, que sí procesa
      // esa sesión especial y muestra el formulario de "nueva contraseña".
      var redirectTo = window.location.origin + window.location.pathname.replace("forgot-password.html", "reset-password.html");
      window.NG_AUTH.forgotPassword(email, redirectTo)
        .then(function () {
          q("#forgot-form").style.display = "none";
          q("#forgot-success").style.display = "block";
        })
        .catch(function (err) {
          btn.disabled = false; btn.textContent = "Enviar enlace de recuperación";
          errorBox.textContent = window.NG_ERR.format(err);
          errorBox.style.display = "block";
        });
    });
  });
})();
