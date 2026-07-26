/* =====================================================================
 * supabase-client.js — Inicialización única (singleton) del cliente.
 * ---------------------------------------------------------------------
 * Depende de que la página haya cargado antes, en este orden:
 *   1) https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2  (UMD, expone
 *      window.supabase.createClient)
 *   2) config.js  (expone window.NG_CONFIG)
 *   3) este archivo (expone window.NG_DB)
 *
 * Si NG_CONFIG.IS_SUPABASE_CONFIGURED es false (placeholders sin
 * reemplazar), NG_DB queda en null y toda la capa de datos
 * (assets/js/data/*.js) cae automáticamente a datos de ejemplo en
 * memoria — así el sistema es usable desde el primer minuto, sin
 * bloquear la demo mientras se gestiona el proyecto Supabase real.
 * ===================================================================== */
(function (global) {
  "use strict";

  var cfg = global.NG_CONFIG;
  var client = null;

  if (cfg && cfg.IS_SUPABASE_CONFIGURED && global.supabase && global.supabase.createClient) {
    client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "ng-auth-session"
      }
    });
  }

  global.NG_DB = client; // null = "modo demo" (ver data/*.js)
})(window);
