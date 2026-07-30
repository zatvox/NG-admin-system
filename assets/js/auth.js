/* =====================================================================
 * auth.js — Autenticación real (Supabase Auth) + modo demo.
 * ---------------------------------------------------------------------
 * Expone NG_AUTH con las mismas funciones sin importar el modo, para
 * que login.html / register.html / forgot-password.html / app.html no
 * necesiten preguntar "¿estamos en demo o en real?" en cada llamada.
 *
 * "persona" = objeto normalizado que usa el resto de la app
 *   { id, nombre, email, rol, comisionId, subgrupoId, esDireccion }
 * En real: rol/comisionId/subgrupoId se derivan de `usuarios` +
 * `membresias` + `comisiones.lider_id` (ver fn cargarPersonaReal).
 * En demo: viene tal cual de NG_MOCK.PERSONAS.
 * ===================================================================== */
(function (global) {
  "use strict";
  var cfg = global.NG_CONFIG;
  var db = global.NG_DB;

  // ---- MODO DEMO ------------------------------------------------------
  function demoLogin(personaId) {
    var persona = global.NG_MOCK.PERSONAS.filter(function (p) { return p.id === personaId; })[0];
    if (!persona) throw new Error("Perfil de demo no encontrado");
    localStorage.setItem(cfg.DEMO_SESSION_KEY, personaId);
    return persona;
  }

  function demoSession() {
    var id = localStorage.getItem(cfg.DEMO_SESSION_KEY);
    if (!id) return null;
    return global.NG_MOCK.PERSONAS.filter(function (p) { return p.id === id; })[0] || null;
  }

  function demoLogout() {
    localStorage.removeItem(cfg.DEMO_SESSION_KEY);
  }

  // Pausa corta para reintentos (ver nota de "condición de carrera" abajo).
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Trae la fila de `usuarios`. Reintenta una vez tras una pausa: justo
  // después de un registro nuevo, el trigger fn_nuevo_usuario_auth() puede
  // tardar una fracción de segundo en confirmarse, y sin este reintento el
  // primer login inmediato fallaba con "perfil no encontrado" aunque el
  // registro sí se hubiera completado bien.
  async function buscarUsuarioConReintento(authUserId) {
    for (var intento = 0; intento < 2; intento++) {
      var res = await db.from("usuarios").select("*").eq("id", authUserId).maybeSingle();
      if (res.error) {
        var e = new Error("No se pudo leer tu perfil (" + res.error.message + ").");
        e.code = res.error.code;
        throw e;
      }
      if (res.data) return res.data;
      if (intento === 0) await esperar(700);
    }
    return null;
  }

  // ---- MODO REAL (Supabase Auth) --------------------------------------
  // (2026-07-30) Antes esta función solo traía UNA membresía (.limit(1)) y
  // asumía que una persona pertenece a una sola comisión/comando a la vez.
  // Eso rompía el caso real: alguien puede estar en un comando Macrodistrital
  // de Organización (por su distrito) Y, aparte, en un comando de Eventos o
  // Formación (por su oficio/habilidad) al mismo tiempo. Ahora se traen
  // TODAS las membresías en `persona.membresias` — permissions.js valida
  // acceso/edición contra esa lista completa, no contra un solo id.
  // `comisionId`/`subgrupoId` se mantienen (= primera membresía) solo para
  // que el Inicio y el chip del topbar tengan un contexto "principal" por
  // default; nunca se usan ya para decidir si algo se puede ver o editar.
  async function cargarPersonaReal(authUser) {
    var usuario = await buscarUsuarioConReintento(authUser.id);
    if (!usuario) {
      var err = new Error('Tu cuenta existe pero no tiene perfil todavía. Pide a Dirección que revise la tabla "usuarios" en Supabase.');
      err.code = "PERFIL_NO_ENCONTRADO";
      throw err;
    }
    var base = { id: usuario.id, nombre: usuario.nombre, email: usuario.email, telefono: usuario.telefono };

    if (usuario.es_direccion) {
      return Object.assign({}, base, { rol: "direccion", comisionId: null, subgrupoId: null, membresias: [], comisionesLideradas: [] });
    }

    // ¿Lidera alguna(s) comisión(es)? (normalmente 1, pero no se asume).
    var { data: liderDe, error: e2 } = await db.from("comisiones").select("id").eq("lider_id", usuario.id);
    if (e2) throw new Error("No se pudo verificar tu comisión (" + e2.message + ").");
    var comisionesLideradas = (liderDe || []).map(function (c) { return c.id; });

    // TODAS sus membresías de comando (no solo la primera). Se separa en dos
    // consultas simples (en vez de un embed "comandos!inner(...)") para no
    // depender de que Supabase ya haya refrescado el caché de relaciones
    // justo después de correr schema.sql — una causa común de errores 500
    // "recién instalado el sistema".
    var { data: membresiasRaw, error: e3 } = await db.from("membresias").select("rol, comando_id").eq("usuario_id", usuario.id).order("created_at", { ascending: true });
    if (e3) throw new Error("No se pudo verificar tus comandos (" + e3.message + ").");

    var comandoIds = (membresiasRaw || []).map(function (m) { return m.comando_id; });
    var comisionPorComando = {};
    if (comandoIds.length) {
      var { data: comandos, error: e4 } = await db.from("comandos").select("id, comision_id").in("id", comandoIds);
      if (e4) throw new Error("No se pudo verificar tus comisiones (" + e4.message + ").");
      (comandos || []).forEach(function (c) { comisionPorComando[c.id] = c.comision_id; });
    }
    var membresias = (membresiasRaw || []).map(function (m) {
      return {
        comandoId: m.comando_id,
        comisionId: comisionPorComando[m.comando_id] || null,
        rol: (m.rol === "secretario") ? "coordinador" : m.rol // secretario hereda permisos de coordinador
      };
    });

    var esLider = comisionesLideradas.length > 0;
    var rolGlobal; // solo para qué aparece en el menú lateral (ver permissions.js NAV)
    if (esLider) rolGlobal = "lider";
    else if (membresias.some(function (m) { return m.rol === "coordinador"; })) rolGlobal = "coordinador";
    else if (membresias.length) rolGlobal = "miembro";
    else rolGlobal = "colaborador"; // sin comisión ni comando asignado todavía (spec secc. 3)

    return Object.assign({}, base, {
      rol: rolGlobal,
      esLider: esLider,
      comisionesLideradas: comisionesLideradas,
      comisionId: esLider ? comisionesLideradas[0] : (membresias[0] ? membresias[0].comisionId : null),
      subgrupoId: membresias[0] ? membresias[0].comandoId : null,
      membresias: membresias
    });
  }

  async function realLogin(email, password) {
    var { data, error } = await db.auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    return cargarPersonaReal(data.user);
  }

  // redirectTo: a dónde manda el link del correo de confirmación. Si no se
  // pasa nada, Supabase usa el "Site URL" configurado en su panel — y si
  // ese valor está mal puesto (o el confirm link resultante no calza con
  // las Redirect URLs permitidas), el signUp() completo puede devolver 500
  // en vez de un error claro. Por eso se manda explícito, igual que ya
  // hace forgotPassword (ver auth-forgot.js).
  async function realRegister(email, password, nombre, redirectTo) {
    var opts = { data: { nombre: nombre } }; // el trigger fn_nuevo_usuario_auth() usa esto
    if (redirectTo) opts.emailRedirectTo = redirectTo;
    var { data, error } = await db.auth.signUp({ email: email, password: password, options: opts });
    if (error) throw error;
    return data;
  }

  async function realForgotPassword(email, redirectTo) {
    var { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
    if (error) throw error;
  }

  // El link del correo de recuperación abre una sesión especial de tipo
  // "recovery" (Supabase la arma solo con el token del link, sin pedir
  // contraseña). updateUser() es la única llamada válida para cerrar ese
  // flujo: cambia la contraseña de ESA sesión recién creada. Se usa desde
  // reset-password.html (ver auth-reset.js).
  async function realUpdatePassword(password) {
    var { error } = await db.auth.updateUser({ password: password });
    if (error) throw error;
  }

  async function realSession() {
    var { data } = await db.auth.getSession();
    if (!data || !data.session) return null;
    return cargarPersonaReal(data.session.user);
  }

  // Vuelve a derivar rol/comisionId/subgrupoId sin pedir contraseña de
  // nuevo. Se usa después de una acción que cambia la membresía de la
  // persona en caliente (ej. "Unirme a este comando"), para que el topbar
  // y el menú se actualicen sin forzar un logout/login.
  async function realRefresh() {
    var { data, error } = await db.auth.getUser();
    if (error) throw error;
    return cargarPersonaReal(data.user);
  }

  async function realLogout() {
    await db.auth.signOut();
  }

  // ---- API PÚBLICA (unifica demo / real) -------------------------------
  global.NG_AUTH = {
    isDemo: !cfg.IS_SUPABASE_CONFIGURED,

    // Perfiles de demo disponibles para el selector de login.html.
    demoPersonas: global.NG_MOCK ? global.NG_MOCK.PERSONAS : [],

    login: function (emailOrPersonaId, password) {
      return cfg.IS_SUPABASE_CONFIGURED ? realLogin(emailOrPersonaId, password) : Promise.resolve(demoLogin(emailOrPersonaId));
    },
    register: function (email, password, nombre, redirectTo) {
      if (!cfg.IS_SUPABASE_CONFIGURED) {
        return Promise.reject(new Error("El registro real requiere que Supabase esté conectado. Por ahora usa el selector de perfil de demo en el login."));
      }
      return realRegister(email, password, nombre, redirectTo);
    },
    forgotPassword: function (email, redirectTo) {
      if (!cfg.IS_SUPABASE_CONFIGURED) {
        return Promise.reject(new Error("La recuperación de contraseña requiere Supabase conectado. En modo demo no hace falta contraseña."));
      }
      return realForgotPassword(email, redirectTo);
    },
    updatePassword: function (password) {
      if (!cfg.IS_SUPABASE_CONFIGURED) {
        return Promise.reject(new Error("Esto requiere Supabase conectado."));
      }
      return realUpdatePassword(password);
    },
    getSession: function () {
      return cfg.IS_SUPABASE_CONFIGURED ? realSession() : Promise.resolve(demoSession());
    },
    refresh: function () {
      return cfg.IS_SUPABASE_CONFIGURED ? realRefresh() : Promise.resolve(demoSession());
    },
    logout: function () {
      return cfg.IS_SUPABASE_CONFIGURED ? realLogout() : Promise.resolve(demoLogout());
    }
  };
})(window);
