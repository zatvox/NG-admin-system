/* =====================================================================
 * invitar.js — Invitación masiva desde un Excel a Supabase Auth.
 *
 * QUÉ HACE, POR CADA FILA:
 *   1. Lee nombre/correo/teléfono/DNI/región/distrito de la hoja indicada.
 *   2. Salta filas sin correo válido, con correo repetido EN EL ARCHIVO, o
 *      con correo que YA existe en la tabla "usuarios" (consulta a Supabase
 *      antes de invitar a nadie) — así puedes correr el mismo Excel varias
 *      veces sin re-invitar a quien ya se invitó en una tanda anterior.
 *      Esto es clave porque Brevo (gratis) solo manda 300 correos/día: se
 *      piensa para correr en tandas diarias con --limite, retomando donde
 *      quedó la tanda de ayer sin repetir a nadie.
 *   3. Llama a supabase.auth.admin.inviteUserByEmail(correo, {...}) —
 *      esto crea la cuenta YA en auth.users y dispara el correo de
 *      invitación (vía el SMTP de Brevo configurado en Supabase).
 *   4. El trigger fn_nuevo_usuario_auth (ver migración 0007) copia
 *      automáticamente nombre/teléfono/DNI a la tabla "usuarios".
 *   5. Si la región/zona de la fila coincide con el campo `region` de
 *      algún comando de la comisión "organizacion" (Lima Norte/Centro/
 *      Este/Sur), inserta la membresía como "miembro" de una vez. Si no
 *      hay coincidencia, la persona queda sin comando (se une ella
 *      misma después con "+ Enlistarse").
 *   6. Escribe 3 CSV de resultado en ./resultados/ — éxitos, errores y
 *      descartadas (inválidas, duplicadas o ya invitadas antes) — para
 *      tener registro de qué pasó con cada fila.
 *
 * REQUISITOS (una sola vez):
 *   cd scripts/invitacion-masiva
 *   npm install
 *   cp .env.example .env      # y completa los 2 valores (ver abajo)
 *
 * USO:
 *   node invitar.js --archivo ./base.xlsx --hoja "Base Enriquecida" --limite 3
 *
 *   --archivo   ruta al Excel (obligatorio)
 *   --hoja      nombre exacto de la hoja (default: "Base Enriquecida")
 *   --limite    procesa solo las primeras N filas NUEVAS (que no tengan ya
 *               cuenta). Pensado para tandas diarias, ej. --limite 280
 *               (deja margen bajo las 300/día gratis de Brevo). Sin este
 *               flag, procesa TODAS las filas nuevas del archivo de una vez
 *               — solo úsalo así si ya tienes SMTP sin ese límite.
 *   --sin-envio modo simulación: no invita a nadie, solo muestra qué
 *               haría con cada fila (para revisar antes de disparar).
 *
 * TANDAS DIARIAS (recomendado con Brevo gratis):
 *   Día 1: node invitar.js --archivo ./base.xlsx --limite 280
 *   Día 2: node invitar.js --archivo ./base.xlsx --limite 280   (mismo comando)
 *   El script salta automáticamente a quien ya se invitó ayer — no hace
 *   falta llevar la cuenta a mano ni cortar el Excel en pedazos.
 *
 * IMPORTANTE — SEGURIDAD:
 *   La SUPABASE_SERVICE_ROLE_KEY del .env puede hacer CUALQUIER cosa en
 *   tu base de datos, sin RLS de por medio. Este archivo .env está en
 *   .gitignore — jamás lo subas al repo, ni lo pegues en el chat, ni lo
 *   compartas. Este script se corre SOLO desde tu computadora.
 * ===================================================================== */
"use strict";
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

// ---------------------------------------------------------------------
// 0. Argumentos de línea de comandos
// ---------------------------------------------------------------------
function leerArgs() {
  const args = process.argv.slice(2);
  const out = { archivo: null, hoja: "Base Enriquecida", limite: null, sinEnvio: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--archivo") out.archivo = args[++i];
    else if (args[i] === "--hoja") out.hoja = args[++i];
    else if (args[i] === "--limite") out.limite = parseInt(args[++i], 10);
    else if (args[i] === "--sin-envio") out.sinEnvio = true;
  }
  return out;
}

// ---------------------------------------------------------------------
// 1. Config / cliente admin de Supabase
// ---------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// A dónde manda el link del correo: la misma página que ya usa "olvidé mi
// contraseña" (reset-password.html), porque el link de invitación de
// Supabase abre una sesión de tipo "recovery" igual que ese flujo — la
// persona llega ahí y pone su contraseña por primera vez.
const REDIRECT_TO = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, "") + "/reset-password.html" : null;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env — revisa .env.example.");
  process.exit(1);
}
if (!REDIRECT_TO) {
  console.error("Falta SITE_URL en .env (ej. https://zatvox.github.io/NG-admin-system/sistema-web) — sin esto el link del correo no sirve.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ---------------------------------------------------------------------
// 2. Leer el Excel
// ---------------------------------------------------------------------
function leerFilas(archivo, hoja) {
  const wb = xlsx.readFile(archivo);
  const ws = wb.Sheets[hoja];
  if (!ws) {
    console.error('No encontré la hoja "' + hoja + '". Hojas disponibles: ' + wb.SheetNames.join(", "));
    process.exit(1);
  }
  return xlsx.utils.sheet_to_json(ws, { defval: "" });
}

// Encabezados esperados en "Base Enriquecida" (ver revisión previa):
// "Nombre Completo", "DNI", "Celular WhatsApp", "Correo", "Región",
// "Provincia / Zona", "Distrito / Ciudad".
function normalizarFila(raw) {
  return {
    nombre: String(raw["Nombre Completo"] || "").trim(),
    dni: String(raw["DNI"] || "").trim(),
    telefono: String(raw["Celular WhatsApp"] || "").trim(),
    correo: String(raw["Correo"] || "").trim().toLowerCase(),
    region: String(raw["Región"] || "").trim(),
    zona: String(raw["Provincia / Zona"] || "").trim(),
    distrito: String(raw["Distrito / Ciudad"] || "").trim()
  };
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------
// 3. Deduplicar por correo + filtrar filas inválidas (esto es solo dentro
//    del archivo; el chequeo contra la base de datos va aparte, ver
//    filtrarYaExistentes más abajo — necesita consultar Supabase).
// ---------------------------------------------------------------------
function prepararFilas(rawFilas) {
  const vistos = new Set();
  const validas = [];
  const descartadas = [];
  rawFilas.forEach(function (raw, idx) {
    const f = normalizarFila(raw);
    f._fila = idx + 2; // +2: fila 1 es encabezado, index base 0
    if (!f.correo || !RE_CORREO.test(f.correo)) {
      descartadas.push(Object.assign({}, f, { motivo: "correo vacío o inválido" }));
      return;
    }
    if (vistos.has(f.correo)) {
      descartadas.push(Object.assign({}, f, { motivo: "correo duplicado en el archivo" }));
      return;
    }
    vistos.add(f.correo);
    validas.push(f);
  });
  return { validas, descartadas };
}

// ---------------------------------------------------------------------
// 3.1 Quitar filas cuyo correo YA tiene cuenta en "usuarios" — así el
//     mismo Excel se puede correr varios días seguidos (tandas por el
//     límite de Brevo) sin re-invitar ni marcar error a quien ya entró.
//     Se consulta en bloques de 200 correos para no mandar una URL enorme.
// ---------------------------------------------------------------------
async function filtrarYaExistentes(validas) {
  const existentes = new Set();
  const TAM_BLOQUE = 200;
  for (let i = 0; i < validas.length; i += TAM_BLOQUE) {
    const bloque = validas.slice(i, i + TAM_BLOQUE).map(function (f) { return f.correo; });
    const { data, error } = await supabase.from("usuarios").select("email").in("email", bloque);
    if (error) throw error;
    (data || []).forEach(function (u) { existentes.add(String(u.email).toLowerCase()); });
  }
  const nuevas = [];
  const yaExistian = [];
  validas.forEach(function (f) {
    if (existentes.has(f.correo)) yaExistian.push(Object.assign({}, f, { motivo: "ya tiene cuenta (invitado en una tanda anterior)" }));
    else nuevas.push(f);
  });
  return { nuevas, yaExistian };
}

// ---------------------------------------------------------------------
// 4. Cache de comandos de "organizacion" para el auto-match por zona
// ---------------------------------------------------------------------
async function cargarComandosOrganizacion() {
  const { data: comision, error: e1 } = await supabase.from("comisiones").select("id").eq("slug", "organizacion").maybeSingle();
  if (e1) throw e1;
  if (!comision) return {};
  const { data: comandos, error: e2 } = await supabase.from("comandos").select("id, region").eq("comision_id", comision.id);
  if (e2) throw e2;
  const porRegion = {};
  (comandos || []).forEach(function (c) {
    if (c.region) porRegion[c.region.trim().toLowerCase()] = c.id;
  });
  return porRegion;
}

// ---------------------------------------------------------------------
// 5. Invitar una fila
// ---------------------------------------------------------------------
async function invitarFila(f, comandosPorZona, sinEnvio) {
  if (sinEnvio) {
    const comandoId = comandosPorZona[f.zona.toLowerCase()];
    return { ok: true, simulado: true, comandoAsignado: comandoId || null };
  }
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(f.correo, {
    data: { nombre: f.nombre, telefono: f.telefono, dni: f.dni },
    redirectTo: REDIRECT_TO
  });
  if (error) throw error;
  const usuarioId = data && data.user ? data.user.id : null;

  const comandoId = comandosPorZona[f.zona.toLowerCase()];
  if (usuarioId && comandoId) {
    const { error: eMemb } = await supabase.from("membresias").insert({
      usuario_id: usuarioId, comando_id: comandoId, rol: "miembro"
    });
    // No detenemos el flujo si falla la membresía (ej. ya existía) — la
    // cuenta ya se creó, que es lo importante; se puede asignar a mano.
    if (eMemb) return { ok: true, usuarioId, comandoAsignado: comandoId, avisoMembresia: eMemb.message };
  }
  return { ok: true, usuarioId, comandoAsignado: comandoId || null };
}

// ---------------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------------
async function main() {
  const args = leerArgs();
  if (!args.archivo) {
    console.error("Falta --archivo <ruta.xlsx>. Ejemplo:\n  node invitar.js --archivo ./base.xlsx --limite 3");
    process.exit(1);
  }
  const rawFilas = leerFilas(args.archivo, args.hoja);
  const { validas, descartadas: descartadasArchivo } = prepararFilas(rawFilas);

  console.log("Filas leídas: " + rawFilas.length);
  console.log("Filas válidas (correo ok, sin duplicar en el archivo): " + validas.length);
  console.log("Consultando cuáles ya tienen cuenta (tandas anteriores)...");
  const { nuevas, yaExistian } = args.sinEnvio ? { nuevas: validas, yaExistian: [] } : await filtrarYaExistentes(validas);
  console.log("Ya invitadas antes: " + yaExistian.length + " | Nuevas por invitar: " + nuevas.length);

  const descartadas = descartadasArchivo.concat(yaExistian);
  const procesar = args.limite ? nuevas.slice(0, args.limite) : nuevas;
  const pendientesParaOtroDia = nuevas.length - procesar.length;

  console.log("Se van a procesar ahora: " + procesar.length + (args.limite ? " (límite aplicado)" : "") + (args.sinEnvio ? " — MODO SIMULACIÓN, no se invita a nadie" : ""));
  if (pendientesParaOtroDia > 0) console.log("Quedan " + pendientesParaOtroDia + " filas nuevas para una próxima tanda (vuelve a correr el mismo comando otro día).");
  console.log("");

  const comandosPorZona = await cargarComandosOrganizacion();

  const exitos = [];
  const errores = [];

  for (let i = 0; i < procesar.length; i++) {
    const f = procesar[i];
    process.stdout.write("[" + (i + 1) + "/" + procesar.length + "] " + f.correo + " ... ");
    try {
      const r = await invitarFila(f, comandosPorZona, args.sinEnvio);
      console.log(r.simulado ? "SIMULADO ✓" + (r.comandoAsignado ? " (comando: " + r.comandoAsignado + ")" : "") : "OK ✓" + (r.comandoAsignado ? " (comando asignado)" : ""));
      exitos.push(Object.assign({}, f, { comandoAsignado: r.comandoAsignado || "", avisoMembresia: r.avisoMembresia || "" }));
    } catch (err) {
      console.log("ERROR ✕ " + (err.message || err));
      errores.push(Object.assign({}, f, { error: err.message || String(err) }));
    }
    // Pausa entre invitaciones para no saturar el SMTP/rate limit.
    if (!args.sinEnvio) await new Promise(function (r) { setTimeout(r, 400); });
  }

  const dirSalida = path.join(__dirname, "resultados");
  if (!fs.existsSync(dirSalida)) fs.mkdirSync(dirSalida);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  escribirCsv(path.join(dirSalida, "exitos_" + ts + ".csv"), exitos);
  escribirCsv(path.join(dirSalida, "errores_" + ts + ".csv"), errores);
  escribirCsv(path.join(dirSalida, "descartadas_" + ts + ".csv"), descartadas);

  console.log("");
  console.log("Listo. Éxitos: " + exitos.length + " | Errores: " + errores.length + " | Descartadas: " + descartadas.length);
  console.log("Detalle guardado en: " + dirSalida);
}

function escribirCsv(ruta, filas) {
  if (!filas.length) { fs.writeFileSync(ruta, ""); return; }
  const cols = Object.keys(filas[0]);
  const lineas = [cols.join(",")].concat(
    filas.map(function (f) { return cols.map(function (c) { return csvEscape(f[c]); }).join(","); })
  );
  fs.writeFileSync(ruta, lineas.join("\n"), "utf8");
}
function csvEscape(v) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

main().catch(function (err) {
  console.error("Error fatal:", err);
  process.exit(1);
});
