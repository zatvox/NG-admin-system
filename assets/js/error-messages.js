/* =====================================================================
 * error-messages.js — Traduce errores técnicos (Supabase, red, RLS) a
 * un mensaje corto + una acción concreta que la persona pueda seguir.
 * Se usa en TODAS las pantallas que muestran errores: login, registro,
 * recuperar contraseña, modales de creación, y carga de vistas.
 *
 * Uso: NG_ERR.friendly(err) -> { titulo, accion }
 *      NG_ERR.format(err)   -> "Titulo — Acción." (listo para mostrar)
 * ===================================================================== */
(function (global) {
  "use strict";

  var REGLAS = [
    { test: /PERFIL_NO_ENCONTRADO/, titulo: "Perfil no encontrado", accion: "Pide a Dirección que revise tu cuenta." },
    { test: /invalid login credentials/i, titulo: "Credenciales incorrectas", accion: "Revisa tu correo y contraseña." },
    { test: /email not confirmed/i, titulo: "Correo sin confirmar", accion: "Revisa tu bandeja y confirma tu correo." },
    { test: /already registered|user already exists/i, titulo: "Correo ya registrado", accion: "Inicia sesión o recupera tu contraseña." },
    { test: /password.*(least|characters|corta)/i, titulo: "Contraseña muy corta", accion: "Usa al menos 8 caracteres." },
    { test: /failed to fetch|networkerror|load failed|network request failed/i, titulo: "Sin conexión", accion: "Revisa tu internet e inténtalo de nuevo." },
    { test: /infinite recursion/i, titulo: "Error de configuración en el servidor", accion: "Avisa a soporte técnico; no es un problema de tu cuenta." },
    { test: /permission denied|rls|policy/i, titulo: "Sin permiso", accion: "Pide acceso a tu Líder o Coordinador." },
    { test: /jwt|token|session/i, titulo: "Sesión vencida", accion: "Vuelve a iniciar sesión." },
    { test: /required|obligator/i, titulo: "Faltan datos", accion: "Completa los campos obligatorios." },
    { test: /rate limit|too many requests/i, titulo: "Demasiados intentos", accion: "Espera un minuto y vuelve a intentar." },
    { test: /500|internal server error/i, titulo: "Error del servidor", accion: "Reintenta en unos segundos; si sigue, avisa a soporte." },
    { test: /not found|no existe|no se encontr/i, titulo: "No encontrado", accion: "Verifica el dato e inténtalo de nuevo." }
  ];

  function friendly(err) {
    var msg = (err && (err.code || err.message)) ? String(err.code || "") + " " + String(err.message || err) : String(err || "");
    for (var i = 0; i < REGLAS.length; i++) {
      if (REGLAS[i].test.test(msg)) return { titulo: REGLAS[i].titulo, accion: REGLAS[i].accion, detalle: err && err.message };
    }
    return { titulo: "Algo salió mal", accion: "Intenta de nuevo en unos segundos.", detalle: err && err.message };
  }

  function format(err) {
    var f = friendly(err);
    return f.titulo + " — " + f.accion;
  }

  global.NG_ERR = { friendly: friendly, format: format };
})(window);
