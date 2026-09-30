/* =====================================================================
 * data/puntaje.js — Backend del "Reglamento de Puntajes" (catálogo de
 * reglas: scoring_rule_versions, scoring_rules, rule_fixed_value,
 * rule_value_matrix, rule_multiplier_value — ver assets/sql/migrations/
 * 0012_sistema_puntaje_reglas.sql). Editable solo por Dirección desde
 * Configuración → tabs "Puntaje: …". El motor que ACREDITA puntos de
 * verdad (eventos, asistencia, entrega de resultados, libro mayor) es
 * una etapa aparte; este archivo solo lee/escribe el catálogo de
 * valores y el estado de vigencia.
 *
 * Modo demo (sin Supabase): misma filosofía que configuracion.js — una
 * copia en memoria, editable, que arranca con los valores de la semilla
 * aprobada en PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md y se pierde al
 * recargar.
 * ===================================================================== */
(function (global) {
  "use strict";
  var db = global.NG_DB;

  // Orden fijo de despliegue de las reglas PROFILE_* (igual que la tabla
  // de la sección 2 de la propuesta técnica).
  var ORDEN_PERFIL = ["PROFILE_ACCOUNT", "PROFILE_IDENTITY", "PROFILE_TERRITORY", "PROFILE_CONTACT", "PROFILE_EDUCATION_OCCUPATION", "PROFILE_ABOUT"];
  var TIPOS_ACTIVIDAD = ["territorial", "virtual", "presencial", "hibrida", "capacitacion", "asamblea"];
  var NIVELES = ["subcomision", "comision", "nacional"];

  function demoSemilla() {
    return {
      version: {
        version_id: "demo-v1", version_code: "1.0.0-borrador.2", status: "BORRADOR",
        document_hash_sha256: null, approval_reference: null, approving_authority: "Directiva Nacional",
        approved_at: null, effective_from: null, effective_until: null,
        notas: "Semilla desde PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md — pendiente de acta, hash y fecha de vigencia."
      },
      perfil: [
        { rule_id: "demo-account", rule_code: "PROFILE_ACCOUNT", etiqueta: "Cuenta", amount: 10 },
        { rule_id: "demo-identity", rule_code: "PROFILE_IDENTITY", etiqueta: "Identidad", amount: 20 },
        { rule_id: "demo-territory", rule_code: "PROFILE_TERRITORY", etiqueta: "Territorio", amount: 10 },
        { rule_id: "demo-contact", rule_code: "PROFILE_CONTACT", etiqueta: "Contacto", amount: 10 },
        { rule_id: "demo-education", rule_code: "PROFILE_EDUCATION_OCCUPATION", etiqueta: "Formación y ocupación", amount: 15 },
        { rule_id: "demo-about", rule_code: "PROFILE_ABOUT", etiqueta: "Acerca de mí", amount: 10 }
      ],
      asistencia: {
        rule_id: "demo-attendance", period_cap_qty: 8, period_cap_window: "MONTH",
        matrix: [
          { tipo_actividad: "territorial", nivel_organizador: "subcomision", amount: 10 },
          { tipo_actividad: "territorial", nivel_organizador: "comision", amount: 15 },
          { tipo_actividad: "territorial", nivel_organizador: "nacional", amount: null },
          { tipo_actividad: "virtual", nivel_organizador: "subcomision", amount: 12 },
          { tipo_actividad: "virtual", nivel_organizador: "comision", amount: 20 },
          { tipo_actividad: "virtual", nivel_organizador: "nacional", amount: 35 },
          { tipo_actividad: "presencial", nivel_organizador: "subcomision", amount: 15 },
          { tipo_actividad: "presencial", nivel_organizador: "comision", amount: 25 },
          { tipo_actividad: "presencial", nivel_organizador: "nacional", amount: 45 },
          { tipo_actividad: "hibrida", nivel_organizador: "subcomision", amount: 14 },
          { tipo_actividad: "hibrida", nivel_organizador: "comision", amount: 22 },
          { tipo_actividad: "hibrida", nivel_organizador: "nacional", amount: 40 },
          { tipo_actividad: "capacitacion", nivel_organizador: "subcomision", amount: 18 },
          { tipo_actividad: "capacitacion", nivel_organizador: "comision", amount: 30 },
          { tipo_actividad: "capacitacion", nivel_organizador: "nacional", amount: 50 },
          { tipo_actividad: "asamblea", nivel_organizador: "subcomision", amount: null },
          { tipo_actividad: "asamblea", nivel_organizador: "comision", amount: null },
          { tipo_actividad: "asamblea", nivel_organizador: "nacional", amount: 70 }
        ]
      },
      resultados: { rule_id: "demo-results", multiplicador: 2.5, techo: 100, plazo_dias: 7 }
    };
  }

  var demo = demoSemilla();

  // ---------------------------------------------------------------------
  // LECTURA
  // ---------------------------------------------------------------------

  // Trae la versión a mostrar/editar: la VIGENTE si existe; si no, la
  // BORRADOR más reciente (normalmente solo hay una a la vez).
  async function obtenerReglamento() {
    if (!db) return JSON.parse(JSON.stringify(demo));

    var { data: version, error: e1 } = await db
      .from("scoring_rule_versions")
      .select("*")
      .order("created_at", { ascending: false });
    if (e1) throw e1;
    if (!version || !version.length) return null;

    var vigente = version.find(function (v) { return v.status === "VIGENTE"; });
    var elegida = vigente || version[0];

    var { data: reglas, error: e2 } = await db.from("scoring_rules").select("*").eq("version_id", elegida.version_id);
    if (e2) throw e2;

    var reglaPerfil = {};
    var reglaAsistencia = (reglas || []).find(function (r) { return r.rule_code === "ATTENDANCE_VALIDATED"; });
    var reglaResultados = (reglas || []).find(function (r) { return r.rule_code === "RESULTS_DELIVERED"; });
    (reglas || []).forEach(function (r) { if (r.origin_type === "PROFILE") reglaPerfil[r.rule_code] = r; });

    var perfilIds = ORDEN_PERFIL.map(function (c) { return reglaPerfil[c] && reglaPerfil[c].rule_id; }).filter(Boolean);
    var { data: fijos } = perfilIds.length ? await db.from("rule_fixed_value").select("*").in("rule_id", perfilIds) : { data: [] };
    var fijosPorId = {};
    (fijos || []).forEach(function (f) { fijosPorId[f.rule_id] = f.amount; });

    var perfil = ORDEN_PERFIL.map(function (code) {
      var r = reglaPerfil[code];
      if (!r) return null;
      return { rule_id: r.rule_id, rule_code: code, etiqueta: r.etiqueta, amount: fijosPorId[r.rule_id] != null ? fijosPorId[r.rule_id] : 0 };
    }).filter(Boolean);

    var asistencia = null;
    if (reglaAsistencia) {
      var { data: matrizRaw } = await db.from("rule_value_matrix").select("*").eq("rule_id", reglaAsistencia.rule_id);
      asistencia = {
        rule_id: reglaAsistencia.rule_id,
        period_cap_qty: reglaAsistencia.period_cap_qty,
        period_cap_window: reglaAsistencia.period_cap_window,
        matrix: (matrizRaw || []).slice().sort(function (a, b) {
          return TIPOS_ACTIVIDAD.indexOf(a.tipo_actividad) - TIPOS_ACTIVIDAD.indexOf(b.tipo_actividad) || NIVELES.indexOf(a.nivel_organizador) - NIVELES.indexOf(b.nivel_organizador);
        })
      };
    }

    var resultados = null;
    if (reglaResultados) {
      var { data: mult } = await db.from("rule_multiplier_value").select("*").eq("rule_id", reglaResultados.rule_id).maybeSingle();
      resultados = { rule_id: reglaResultados.rule_id, multiplicador: mult ? Number(mult.multiplicador) : 2.5, techo: mult ? mult.techo : 100, plazo_dias: mult ? mult.plazo_dias : 7 };
    }

    return { version: elegida, perfil: perfil, asistencia: asistencia, resultados: resultados };
  }

  // Historial de versiones (para el selector de la pestaña Vigencia).
  async function listarVersiones() {
    if (!db) return [demo.version];
    var { data, error } = await db.from("scoring_rule_versions").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // ---------------------------------------------------------------------
  // ESCRITURA — todas exigen Dirección (reforzado también por RLS).
  // ---------------------------------------------------------------------

  async function guardarPerfil(cambios) {
    // cambios: [{ rule_id, amount }]
    if (!db) {
      cambios.forEach(function (c) {
        var row = demo.perfil.find(function (p) { return p.rule_id === c.rule_id; });
        if (row) row.amount = c.amount;
      });
      return;
    }
    var upserts = cambios.map(function (c) { return { rule_id: c.rule_id, amount: c.amount }; });
    var { error } = await db.from("rule_fixed_value").upsert(upserts);
    if (error) throw error;
  }

  async function guardarAsistencia(ruleId, periodCapQty, periodCapWindow, celdas) {
    // celdas: [{ tipo_actividad, nivel_organizador, amount }]
    if (!db) {
      demo.asistencia.period_cap_qty = periodCapQty;
      demo.asistencia.period_cap_window = periodCapWindow;
      celdas.forEach(function (c) {
        var row = demo.asistencia.matrix.find(function (m) { return m.tipo_actividad === c.tipo_actividad && m.nivel_organizador === c.nivel_organizador; });
        if (row) row.amount = c.amount;
      });
      return;
    }
    var { error: e1 } = await db.from("scoring_rules").update({ period_cap_qty: periodCapQty, period_cap_window: periodCapWindow }).eq("rule_id", ruleId);
    if (e1) throw e1;
    var upserts = celdas.map(function (c) { return { rule_id: ruleId, tipo_actividad: c.tipo_actividad, nivel_organizador: c.nivel_organizador, amount: c.amount }; });
    var { error: e2 } = await db.from("rule_value_matrix").upsert(upserts, { onConflict: "rule_id,tipo_actividad,nivel_organizador" });
    if (e2) throw e2;
  }

  async function guardarResultados(ruleId, multiplicador, techo, plazoDias) {
    if (!db) {
      demo.resultados.multiplicador = multiplicador;
      demo.resultados.techo = techo;
      demo.resultados.plazo_dias = plazoDias;
      return;
    }
    var { error } = await db.from("rule_multiplier_value").upsert({ rule_id: ruleId, multiplicador: multiplicador, techo: techo, plazo_dias: plazoDias });
    if (error) throw error;
  }

  // Actualiza acta/hash/fechas/notas de una versión, sin tocar su estado.
  async function guardarDatosVersion(versionId, campos) {
    if (!db) {
      Object.assign(demo.version, campos);
      return;
    }
    var { error } = await db.from("scoring_rule_versions").update(campos).eq("version_id", versionId);
    if (error) throw error;
  }

  // Cambia el estado de una versión. Si pasa a VIGENTE, primero cierra
  // (CERRADA) cualquier otra versión que estuviera VIGENTE — la base de
  // datos solo permite UNA vigente a la vez (índice único parcial), así
  // que si no se hace este paso antes, el UPDATE de abajo choca con esa
  // restricción.
  async function cambiarEstadoVersion(versionId, nuevoEstado) {
    if (!db) {
      demo.version.status = nuevoEstado;
      if (nuevoEstado === "VIGENTE") demo.version.approved_at = demo.version.approved_at || new Date().toISOString();
      return;
    }
    if (nuevoEstado === "VIGENTE") {
      var { error: eCierre } = await db.from("scoring_rule_versions").update({ status: "CERRADA" }).eq("status", "VIGENTE").neq("version_id", versionId);
      if (eCierre) throw eCierre;
    }
    var campos = { status: nuevoEstado };
    if (nuevoEstado === "VIGENTE") campos.approved_at = new Date().toISOString();
    var { error } = await db.from("scoring_rule_versions").update(campos).eq("version_id", versionId);
    if (error) throw error;
  }

  // Crea una nueva versión BORRADOR clonando todas las reglas/valores de
  // la versión origen (reglamento sección 9.3: todo cambio de valores
  // requiere una nueva versión, nunca editar una ya VIGENTE/CERRADA).
  async function duplicarVersion(versionOrigenId, nuevoCodigo) {
    if (!db) {
      demo.version = { version_id: "demo-v" + Date.now(), version_code: nuevoCodigo, status: "BORRADOR", document_hash_sha256: null, approval_reference: null, approving_authority: "Directiva Nacional", approved_at: null, effective_from: null, effective_until: null, notas: "Nueva versión, duplicada en modo demo." };
      return demo.version;
    }
    var { data: nueva, error: e1 } = await db.from("scoring_rule_versions").insert({ version_code: nuevoCodigo, status: "BORRADOR", notas: "Duplicada desde otra versión." }).select().single();
    if (e1) throw e1;

    var { data: reglasOrigen, error: e2 } = await db.from("scoring_rules").select("*").eq("version_id", versionOrigenId);
    if (e2) throw e2;

    for (var i = 0; i < (reglasOrigen || []).length; i++) {
      var r = reglasOrigen[i];
      var nuevaRegla = Object.assign({}, r);
      delete nuevaRegla.rule_id;
      nuevaRegla.version_id = nueva.version_id;
      var { data: reglaNueva, error: e3 } = await db.from("scoring_rules").insert(nuevaRegla).select().single();
      if (e3) throw e3;

      if (r.origin_type === "PROFILE") {
        var { data: fijo } = await db.from("rule_fixed_value").select("amount").eq("rule_id", r.rule_id).maybeSingle();
        if (fijo) await db.from("rule_fixed_value").insert({ rule_id: reglaNueva.rule_id, amount: fijo.amount });
      } else if (r.rule_code === "ATTENDANCE_VALIDATED") {
        var { data: matriz } = await db.from("rule_value_matrix").select("tipo_actividad, nivel_organizador, amount").eq("rule_id", r.rule_id);
        if (matriz && matriz.length) {
          await db.from("rule_value_matrix").insert(matriz.map(function (m) { return Object.assign({ rule_id: reglaNueva.rule_id }, m); }));
        }
      } else if (r.rule_code === "RESULTS_DELIVERED") {
        var { data: mult } = await db.from("rule_multiplier_value").select("multiplicador, techo, plazo_dias").eq("rule_id", r.rule_id).maybeSingle();
        if (mult) await db.from("rule_multiplier_value").insert(Object.assign({ rule_id: reglaNueva.rule_id }, mult));
      }
    }
    return nueva;
  }

  // ---------------------------------------------------------------------
  // LIBRO MAYOR (migración 0013) — lectura de saldo, movimientos propios,
  // y ranking. Los INSERT los hacen los triggers de la base de datos
  // (fn_acreditar_*); este archivo solo lee.
  // ---------------------------------------------------------------------

  var ORIGEN_LABEL = {
    PROFILE_ACCOUNT: "Cuenta", PROFILE_IDENTITY: "Identidad", PROFILE_TERRITORY: "Territorio",
    PROFILE_CONTACT: "Contacto", PROFILE_EDUCATION_OCCUPATION: "Formación y ocupación", PROFILE_ABOUT: "Acerca de mí",
    ATTENDANCE_VALIDATED: "Asistencia validada", RESULTS_DELIVERED: "Entrega de resultados"
  };

  async function obtenerMiBalance() {
    if (!db) return { balance: 0, scoreReachedAt: null };
    var { data: sessionData } = await db.auth.getSession();
    var uid = sessionData.session ? sessionData.session.user.id : null;
    if (!uid) return { balance: 0, scoreReachedAt: null };
    var { data, error } = await db.from("member_score_balances").select("*").eq("usuario_id", uid).maybeSingle();
    if (error) throw error;
    return { balance: data ? data.balance : 0, scoreReachedAt: data ? data.score_reached_at : null };
  }

  // Mis créditos, con la etiqueta legible del origen y el código de regla.
  async function listarMisMovimientos() {
    if (!db) return [];
    var { data: sessionData } = await db.auth.getSession();
    var uid = sessionData.session ? sessionData.session.user.id : null;
    if (!uid) return [];
    var { data, error } = await db.from("credit_events")
      .select("credit_event_id, status, created_at, evidence_ref, scoring_rules(rule_code, etiqueta), ledger_movements(amount, movement_type)")
      .eq("usuario_id", uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(function (c) {
      var credito = (c.ledger_movements || []).find(function (m) { return m.movement_type === "CREDITO"; });
      return {
        creditEventId: c.credit_event_id, status: c.status, createdAt: c.created_at,
        ruleCode: c.scoring_rules ? c.scoring_rules.rule_code : null,
        etiqueta: c.scoring_rules ? (c.scoring_rules.etiqueta || ORIGEN_LABEL[c.scoring_rules.rule_code] || c.scoring_rules.rule_code) : "—",
        amount: credito ? credito.amount : 0
      };
    });
  }

  // Ranking completo: saldo + nombre/región de cada miembro. El
  // enmascarado de identidad ("Miembro ****-1234" salvo la fila propia)
  // se hace en la vista (views/puntaje.js), no acá — este archivo solo
  // trae los datos crudos que RLS ya permite ver.
  async function listarRanking() {
    if (!db) return [];
    var { data: balances, error: e1 } = await db.from("member_score_balances").select("*").order("balance", { ascending: false });
    if (e1) throw e1;
    var ids = (balances || []).map(function (b) { return b.usuario_id; });
    if (!ids.length) return [];
    var { data: usuarios, error: e2 } = await db.from("usuarios").select("id, nombre, region").in("id", ids);
    if (e2) throw e2;
    var porId = {};
    (usuarios || []).forEach(function (u) { porId[u.id] = u; });
    return balances.map(function (b, i) {
      var u = porId[b.usuario_id] || {};
      return { posicion: i + 1, usuarioId: b.usuario_id, nombre: u.nombre || "—", region: u.region || null, balance: b.balance, scoreReachedAt: b.score_reached_at };
    });
  }

  global.NG_DATA = global.NG_DATA || {};
  global.NG_DATA.puntaje = {
    ORDEN_PERFIL: ORDEN_PERFIL, TIPOS_ACTIVIDAD: TIPOS_ACTIVIDAD, NIVELES: NIVELES, ORIGEN_LABEL: ORIGEN_LABEL,
    obtenerReglamento: obtenerReglamento,
    listarVersiones: listarVersiones,
    guardarPerfil: guardarPerfil,
    guardarAsistencia: guardarAsistencia,
    guardarResultados: guardarResultados,
    guardarDatosVersion: guardarDatosVersion,
    cambiarEstadoVersion: cambiarEstadoVersion,
    duplicarVersion: duplicarVersion,
    obtenerMiBalance: obtenerMiBalance,
    listarMisMovimientos: listarMisMovimientos,
    listarRanking: listarRanking
  };
})(window);
