# Handoff — Sistema de Comisiones (Nueva Generación)

## 1. Objetivo
Sistema web (vanilla JS + Supabase) para una organización política/social: gestión de comisiones, comandos y miembros, calendario/tareas/foro/directorio, y (esta sesión) un **sistema de puntaje** que acredita créditos verificables por participación (perfil completo, asistencia validada, entrega de resultados).

## 2. Estado actual

**Sistema de Puntaje — Etapas 1, 2 y 3 completas y probadas en vivo:**
- **Etapa 1 (motor de reglamento):** catálogo de reglas (`scoring_rule_versions`/`scoring_rules`/`rule_fixed_value`/`rule_value_matrix`/`rule_multiplier_value`), con ciclo de vida BORRADOR → VIGENTE → CERRADA. Configurable desde Configuración → 3 tabs nuevas (Puntaje: Perfil / Asistencia / Resultados y Vigencia). Verificado en vivo: los 4 tabs cargan datos reales, un guardado real de valores de perfil confirmó el camino de escritura.
- **Etapa 2 (motor de acreditación):** `credit_events` + `ledger_movements` + `member_score_balances`, con 3 triggers `SECURITY DEFINER` (`fn_acreditar_perfil`, `fn_acreditar_asistencia`, `fn_acreditar_resultado`) que solo acreditan si existe una versión VIGENTE. 4 pantallas nuevas (Asistencia, Entrega de resultados, Mi puntuación, Ranking). Verificado en vivo de punta a punta con el reglamento en BORRADOR: evento de prueba clasificado, lista de asistencia creada/auditada/validada, resultado entregado/validado — confirmado por consulta directa a `credit_events`/`ledger_movements` que **cero créditos se generaron** mientras el reglamento no esté VIGENTE (el candado funciona).
- **Etapa 3 (wizard de perfil):** `#/completar-perfil`, 5 pasos (Identidad, Territorio, Contacto, Formación y ocupación, Acerca de mí), cada paso se guarda por separado. CTA agregado en "Mi perfil" (resumen de puntaje + botón) y en "Mi puntuación". `auth.js` extendido para traer los campos nuevos de `usuarios` en el objeto `persona`.
- **Territorio con País + catálogo peruano (agregado después, misma sesión ampliada):** el paso Territorio ahora arranca con un select de **País** (Perú por defecto, 196 países listados). Si es Perú, región/provincia/distrito son 3 selects en cascada con el catálogo oficial completo (`assets/js/data/ubigeo-peru.js`, dataset abierto empaquetado como archivo estático — 25 regiones/196 provincias/1892 distritos, sin tocar Supabase porque es data geográfica que casi no cambia). Si el país es otro, esos 3 campos pasan a texto libre y se vuelven obligatorios.

**Bug encontrado y corregido durante las pruebas de esta sesión:**
- `data/resultados.js` fallaba ("Algo salió mal") al listar entregas — `result_deliveries` tiene DOS FK a `usuarios` (`usuario_id` y `validated_by`), y el `.select("usuarios(nombre)")` quedaba ambiguo para PostgREST. Corregido especificando la constraint exacta (`usuarios!result_deliveries_usuario_id_fkey`). Verificado funcionando después del fix.

**Pendiente / sin verificar en vivo:**
- **`assets/sql/migrations/0007_dni_usuarios.sql` nunca se corrió en producción** — la columna `usuarios.dni` no existe en la base real, aunque sí está en `schema.sql` (documento de referencia) y en el trigger de registro `fn_nuevo_usuario_auth`. Esto bloquea el Paso 1 del wizard (Identidad) y, por lo tanto, la regla `PROFILE_IDENTITY`. Se le envió a Luis un archivo aislado (`fix_0007_dni_faltante.sql`, contenido idéntico a la migración 0007 original) para correr en el SQL Editor de Supabase — **es el único paso que falta para que el wizard funcione al 100%.**
- **`assets/sql/migrations/0014_pais_usuarios.sql` (nueva) tampoco se ha corrido todavía** — agrega `usuarios.pais` (default `'Perú'`, NOT NULL), necesaria para el nuevo selector de País del paso Territorio. Sin ella, guardar el paso Territorio falla (columna inexistente). Es independiente de la 0007 — hay que correr ambas.
- El resto del wizard (pasos 2-5: Territorio, Contacto, Formación, Acerca de mí) se verificó funcionando correctamente por consola (llamando directo a `NG_DATA.usuarios.actualizarPerfilExtendido`) porque el paso 1 bloqueaba el click-through normal de la UI — falta repetir la prueba completa clickeando los 5 pasos en orden una vez corrida la migración 0007.
- El Reglamento de Puntajes sigue en **BORRADOR** — es intencional, a la espera de aprobación formal de la Directiva Nacional (ver `especificaciones-sistema-comisiones.md` sección 12.4). Ningún punto se acredita todavía en producción.
- Sin pantalla de administración para `fn_revertir_credito` (reverso manual de un crédito) — existe y está probada como función SQL, pero no tiene UI. Ver `ARCHITECTURE.md` sección 4, pregunta 5.

## 3. Archivos y cambios (esta sesión)

**Wizard "Completar mi perfil" (Etapa 3):**
- `assets/js/views/completar-perfil.js` — **nuevo.** Wizard de 5 pasos, guardado incremental por paso, chips de intereses cívicos (opcional), barra de progreso, puntos de cada paso mostrados en vivo desde el reglamento cargado.
- `assets/js/data/usuarios.js` — nueva función `actualizarPerfilExtendido(payload)`, guarda solo las columnas que le pasen (permite guardado parcial por paso).
- `assets/js/auth.js` — `cargarPersonaReal()` ahora incluye `dni, region, provincia, distrito, formacionAcademica, ocupacion, acercaDeMi, interesesCivicos` en el objeto `persona`.
- `assets/js/views/directorio-reportes-perfil.js` — `viewPerfil()` agrega una tarjeta de resumen (saldo + % de perfil completo) con CTA a "Completar mi perfil" o a "Mi puntuación" según corresponda.
- `assets/js/router.js` — ruta `#/completar-perfil` (sin entrada en el menú lateral, a propósito — solo se llega por CTA).
- `app.html` — agregado `<script src="assets/js/views/completar-perfil.js">`.

**País + catálogo peruano en Territorio (agregado después):**
- `assets/js/data/ubigeo-peru.js` — **nuevo.** Catálogo estático región→provincia→distrito (25/196/1892), descargado del dataset abierto `RitchieRD/ubigeos-peru-data` (INEI/RENIEC, actualizado 2024) y normalizado a Title Case. Expone `NG_DATA.ubigeo.{regiones, provincias, distritos}`.
- `assets/js/data/paises.js` — **nuevo.** Lista de 196 países en español, Perú primero (valor por defecto). Expone `NG_DATA.paises.listar()`.
- `assets/js/views/completar-perfil.js` — paso Territorio rediseñado: select de País arriba; si es Perú, 3 selects en cascada del catálogo; si no, 3 inputs de texto libre obligatorios (validación agregada en `nextBtn`).
- `assets/js/data/usuarios.js` — `actualizarPerfilExtendido` ahora también guarda `pais`.
- `assets/js/auth.js` — `cargarPersonaReal()` incluye `pais` en `persona`.
- `assets/sql/migrations/0014_pais_usuarios.sql` — **nuevo, sin correr todavía.** `alter table usuarios add column pais text not null default 'Perú'`.
- `assets/sql/schema.sql` — referencia actualizada con la misma columna.

**Fix de bug (Etapa 2, encontrado en pruebas):**
- `assets/js/data/resultados.js` — `usuarios(nombre)` → `usuarios!result_deliveries_usuario_id_fkey(nombre)` en el `.select()` de `listarEntregas()`.

**Documentación (Etapa 4):**
- `especificaciones-sistema-comisiones.md` — nueva sección 12 completa (Sistema de Puntaje: objetivo, orígenes, valores aprobados, ciclo de vida del reglamento, pantallas nuevas, guía paso a paso de cómo se acumulan los puntos, decisiones de alcance, verificación realizada); sección 4 (módulos) y 9 (próximos pasos) actualizadas.
- `ARCHITECTURE.md` — nueva sección 6 (motor de acreditación: diagrama de triggers, por qué la idempotency_key lleva un marcador de origen, columna generada `nivel_organizador`); pregunta abierta nueva sobre la UI de reversión.
- `README.md` — módulos nuevos listados, sección "Sistema de Puntaje" agregada.

Todos los archivos JS tocados se verificaron con `node --check` (sin errores de sintaxis) antes de entregarse.

## 4. Intentos fallidos / lecciones de esta sesión

- **No asumir que "sin rows returned" en Supabase es una falla.** Es el mensaje normal de un bloque `DO $$ ... $$` exitoso — la seña real de que algo no corrió es consultar la tabla directamente y ver que está vacía.
- **Un archivo RLS grande (700+ líneas) puede fallar a la mitad sin avisar claramente** cuál política quedó sin crear. Desde la Etapa 1 se adoptó el criterio de mandar bloques SQL aislados y pequeños (solo las tablas/políticas nuevas de esa etapa) en vez de pedir que se re-corra el archivo completo cada vez — más fácil de verificar que sí terminó bien.
- **Un `.select()` con `tabla_relacionada(campo)` falla en silencio-no-tan-silencioso si hay más de una FK hacia esa tabla** — PostgREST no adivina cuál seguir, hay que nombrar la constraint exacta (`tabla!nombre_constraint_fkey(campo)`). Vale la pena revisar cuántas FK hacia la misma tabla tiene cada tabla nueva antes de escribir el `.select()`.
- **Migraciones "olvidadas"**: `schema.sql` es el documento de referencia del estado ideal, pero no prueba que la base de datos real esté al día — la migración 0007 (columna `dni`) llevaba escrita desde antes de esta sesión sin haberse corrido nunca en producción. Vale la pena, al iniciar una sesión nueva, verificar contra la base real (no contra `schema.sql`) las columnas de las que depende una feature nueva, en vez de asumir que "ya debe estar" solo porque aparece en el documento.
- **No loguearse con credenciales de usuario** usando las herramientas de navegador — política sin excepciones, se mantuvo toda la sesión (todas las pruebas se hicieron contra la sesión ya autenticada de Luis, con herramientas de solo lectura + consultas directas de verificación vía consola).

## 5. Próximos pasos (en orden)

1. **Correr `fix_0007_dni_faltante.sql` y `assets/sql/migrations/0014_pais_usuarios.sql` en Supabase** (0007 ya enviado antes; 0014 es nueva) — agregan `usuarios.dni` y `usuarios.pais`, ambas columnas que faltan en producción. Sin esto, los pasos Identidad y Territorio del wizard no pueden guardar.
2. Repetir la prueba completa del wizard clickeando los 5 pasos en orden en la interfaz (no por consola) una vez corridas ambas migraciones, para confirmar el flujo de UI de punta a punta tal como lo verá un miembro real — incluyendo el cambio de País y el fallback a texto libre.
3. **Aprobación del Reglamento de Puntajes por la Directiva Nacional** — confirmar/ajustar los valores de `especificaciones-sistema-comisiones.md` sección 12.3, completar acta/hash/fechas desde Configuración → Puntaje: Resultados y Vigencia, y pasar la versión de BORRADOR a VIGENTE. Es el único paso que falta para que el sistema empiece a acreditar puntos reales — todo el motor ya está construido y probado.
4. Una vez VIGENTE, probar en vivo que un crédito real se genera (perfil, asistencia y resultado) y que el saldo/ranking lo reflejan correctamente — hasta ahora solo se probó que el candado de BORRADOR funciona, no el camino positivo con crédito real.
5. Considerar construir la pantalla de administración para `fn_revertir_credito` (hoy solo vía SQL) si empiezan a aparecer casos reales de corrección de créditos.
