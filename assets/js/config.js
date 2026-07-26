/* =====================================================================
 * config.js — Único archivo que hay que tocar para conectar Supabase.
 * ---------------------------------------------------------------------
 * Reemplaza SUPABASE_URL y SUPABASE_ANON_KEY por los de tu proyecto
 * (Supabase → Project Settings → API). El resto del sistema detecta
 * automáticamente si sigue en "modo demo" (placeholders) o ya está
 * conectado, sin que haya que tocar ningún otro archivo.
 *
 * IMPORTANTE: la anon key es pública por diseño (va protegida por RLS,
 * ver assets/sql/rls-policies.sql). NUNCA pongas aquí la service_role key.
 * ===================================================================== */
(function (global) {
  "use strict";

  var SUPABASE_URL = "https://xhhazsciafiurnshtvpk.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoaGF6c2NpYWZpdXJuc2h0dnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTEyMTgsImV4cCI6MjA5ODc2NzIxOH0.iGM88zyTGsy80LKwNh8rJmXE_z2zxa4JD1QisYD7uII";

  // Se considera "no configurado" mientras queden los placeholders de arriba.
  var IS_SUPABASE_CONFIGURED =
    SUPABASE_URL.indexOf("TU-PROYECTO") === -1 &&
    SUPABASE_ANON_KEY.indexOf("TU-ANON-KEY") === -1;

  // Valores de marca/organización por defecto — se usan ANTES de iniciar
  // sesión (login.html) y como respaldo si la tabla `configuracion` de
  // Supabase todavía no tiene datos. Una vez logueado, estos valores se
  // sobreescriben con lo que Dirección haya guardado en el módulo de
  // Configuración (ver assets/js/data/configuracion.js).
  var APP_DEFAULTS = {
    "organizacion.nombre": "Nueva Generación",
    "organizacion.eslogan": "Sistema de Comisiones",
    "marca.color_primario": "#16213E",
    "marca.color_acento": "#D9A426",
    "negocio.dias_aviso_vencimiento": 3,
    "negocio.max_contactos_por_persona": 10,
    "notificaciones.activas": true
  };

  global.NG_CONFIG = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    IS_SUPABASE_CONFIGURED: IS_SUPABASE_CONFIGURED,
    APP_DEFAULTS: APP_DEFAULTS,
    // Clave de localStorage donde se cachea la sesión en modo demo.
    DEMO_SESSION_KEY: "ng_demo_session"
  };
})(window);
