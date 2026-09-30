# ARCHITECTURE — Documentación técnica

## 1. Flujo de datos (capas)

```
┌─────────────────────────────────────────────────────────┐
│  UI LAYER — assets/js/views/*.js + modal-openers.js      │
│  Arma el DOM, escucha clics, pide datos a la capa de abajo│
└────────────┬────────────────────────────────────────────┘
             │  await NG_DATA.<entidad>.listar() / .crear()
┌────────────▼────────────────────────────────────────────┐
│  DATA LAYER — assets/js/data/*.js                        │
│  Si NG_DB existe → consulta Supabase real.                │
│  Si NG_DB es null → lee/escribe sobre NG_MOCK (memoria).  │
│  Es la ÚNICA capa que sabe si estamos en modo demo o real.│
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│  CLIENT LAYER — assets/js/supabase-client.js              │
│  Singleton: crea el cliente UNA vez si config.js tiene     │
│  credenciales reales; si no, NG_DB queda en null.          │
└─────────────────────────────────────────────────────────┘
```

`permissions.js` es una capa transversal: no decide nada por sí sola, solo espeja en el cliente lo que las políticas RLS ya deciden en el servidor, para poder ocultar botones que el usuario no podría usar de todas formas. **La seguridad real vive en `assets/sql/rls-policies.sql`, no en el JavaScript** — si alguien manipula el navegador, Supabase sigue rechazando lo que no le corresponde.

## 2. Flujo de información entre tipos de usuario y tablas

Esta sección traduce la sección 5 de `especificaciones-sistema-comisiones.md` a las tablas concretas que la implementan.

### Hacia abajo (directivas / contexto)

```
Dirección General ──▶ Líder de Comisión ──▶ Coordinador de Comando ──▶ Miembro
```

| Paso | Acción | Tabla que lo registra |
|---|---|---|
| Dirección publica un comunicado general | `INSERT comunicados` con `alcance='general'` | `comunicados` |
| Líder habilita un comando nuevo en su comisión | `INSERT comandos` | `comandos` |
| Líder asigna un Coordinador temporal | `INSERT membresias (rol='coordinador')` | `membresias` |
| Coordinador crea una tarea puntual | `INSERT tareas` | `tareas` |
| Miembro la ejecuta y cambia su estado | `UPDATE tareas SET estado=...` | `tareas` (con trigger de auditoría, ver más abajo) |

### Hacia arriba (reportes / estado)

```
Miembro (actualiza sus tareas) ──▶ Coordinador (ve su comando) ──▶ Líder (ve su comisión) ──▶ Dirección (ve todo)
```

Esto **no requiere tablas nuevas**: es enteramente un efecto de las políticas RLS de `SELECT` en `tareas` (ver `rls-policies.sql`, política `tareas_select`), que amplían el alcance de lectura según el rol sin necesitar una tabla de "resúmenes" separada. Los reportes (`views/directorio-reportes-perfil.js`) calculan los porcentajes de avance en el cliente a partir de los mismos datos ya filtrados por RLS.

### Lateral, dentro de una misma comisión

Cualquier Miembro o Coordinador puede *ver* (no editar) lo que hacen los demás comandos de su propia comisión. Se implementa con `fn_pertenece_comision()` en `rls-policies.sql`: la condición de `SELECT` en `tareas`/`comandos` no exige pertenecer al comando exacto, solo a la comisión.

### Transversal (Comunicaciones)

La spec marca esto como una excepción real de alcance cruzado (Comunicaciones necesita ver eventos/comunicados de las demás comisiones). **No implementada todavía como permiso especial** — hoy Comunicaciones ve lo mismo que cualquier otro Líder de su propia comisión. Queda registrada como pregunta abierta en la sección 4 de este documento.

### Ingreso de nuevos colaboradores

```
register.html (auth.signUp)
   └─▶ trigger fn_nuevo_usuario_auth() → INSERT en `usuarios` (estado='pendiente_activacion')
         └─▶ Comunidad lo contacta y lo deriva a una comisión/comando
               └─▶ Líder o Coordinador ejecuta INSERT en `membresias`
                     └─▶ el usuario gana acceso a Tareas/Directorio/Enlaces de esa comisión
                           (automático: las políticas RLS leen `membresias` en cada consulta)
```

## 3. Buenas prácticas seguidas

### Base de datos

- **snake_case, plural, UUID como PK.** Nunca IDs autoincrementales expuestos (evita que alguien adivine `/tareas/124` y pruebe `/tareas/125`).
- **El rol no es un atributo del usuario, es un atributo de la relación** (`membresias.rol`), porque una persona puede ser Coordinador en un comando y Miembro en otro — modelarlo como columna en `usuarios` hubiera sido incorrecto desde el día 1.
- **Separación explícita ver/editar en cada política RLS** (dos políticas por tabla como mínimo), reflejando la tabla de roles de la spec en vez de tener un solo "es_admin" binario.
- **Cero hardcode de parámetros de negocio**: todo lo que Dirección pudiera querer cambiar (nombre, colores, plazos, topes) vive en la tabla `configuracion`, no en el código — ver el módulo de Configuración.
- **Auditoría por trigger, no por confianza en el cliente**: la tabla `auditoria` se llena con `SECURITY DEFINER`, nunca por un INSERT que el navegador pudiera falsear.
- **Generación por lote, no manual**: los 27 comandos regionales se crean con un loop SQL sobre un array de regiones (`seed-demo.sql`), no con 27 sentencias escritas a mano — así lo pedía explícitamente la spec.
- **Migraciones numeradas** en `assets/sql/migrations/` para que el historial de cambios de esquema quede versionado, no solo como "el estado actual de schema.sql".

### Frontend / JavaScript

- **Vanilla JS, sin build step**: consistente con el stack ya validado en otros proyectos del autor (JHIRO ERP), y evita que GitHub Pages necesite un paso de compilación.
- **Patrón de 3 capas** (UI → Data → Client) descrito arriba: cada vista pide datos con una función (`NG_DATA.tareas.crear(...)`), nunca escribe un `fetch` a Supabase directamente. Esto es lo que permite que el "modo demo" exista sin ensuciar las vistas con `if (hayBaseDeDatos)` por todos lados.
- **Un solo punto de verdad para permisos** (`permissions.js`): ninguna vista decide "quién puede editar esto" con su propia lógica ad-hoc.
- **Namespacing manual** (`window.NG_*`) en vez de un bundler: cada archivo es un IIFE que expone un único objeto global. Es más verboso que ES modules, pero evita problemas de CORS al abrir `file://` localmente y no requiere `type="module"` ni servidor de compilación.
- **Consolidación pragmática de vistas**: la spec original imaginaba ~12 archivos de vista, uno por módulo. Se agruparon en 5 archivos por dominio afín (`dashboard-comisiones.js`, `tareas-calendario.js`, `comunicaciones-enlaces.js`, `directorio-reportes-perfil.js`, `configuracion.js`) porque son vistas pequeñas y muy interdependientes (comparten `S.comisionCard`, `S.kanbanBoard`, etc.); 12 archivos de 40 líneas cada uno hubiera fragmentado más de lo que ordena. Si un dominio crece mucho, se separa cuando haga falta.
- **Comentario de cabecera en cada archivo** explicando su responsabilidad — pedido explícito de esta entrega.

### Diseño / mobile

- **Mobile-first en la práctica, no solo en la intención**: sidebar colapsable, tablero kanban a 1 columna en pantallas chicas, calendario con celdas reducidas — ver `assets/css/responsive.css` y los `@media` puntuales en `calendar.css`/`app.css`.
- **`site.webmanifest` ya incluido** para que el sitio se pueda "instalar" en el celular como PWA sin pasar por una tienda de aplicaciones — deja el camino listo para cuando se aborde la etapa de app nativa/APK (ver sección 6).

## 4. Preguntas abiertas / decisiones pendientes

| # | Pregunta | Módulo que bloquea | Sugerencia |
|---|---|---|---|
| 1 | ¿Comunicaciones necesita permiso especial de "lector transversal" sobre eventos/comunicados de otras comisiones? | RLS de `eventos`/`comunicados` | Implementar como excepción explícita en `rls-policies.sql` cuando se confirme el flujo real con esa comisión. |
| 2 | El campo "Comando operativo" del formulario global de Nueva Tarea es texto libre (ver `modal-openers.js`, `openNuevaTareaModalGlobal`) porque requiere un selector dependiente dinámico (Comisión → Comando). | Vista Tareas (global) | Implementar `<select>` encadenado una vez validado el flujo con la directiva. |
| 3 | Reasignar Líder de Comisión o marcar a alguien como Dirección General todavía se hace por SQL directo (ver `SETUP.md` paso 5). | Módulo Configuración | Agregar un `<select>` en Configuración una vez que haya un flujo claro de "quién puede reasignar a quién". |
| 4 | Notificaciones reales (push / WhatsApp) — hoy solo existe el toggle de UI en Mi Perfil, sin backend detrás. | Perfil / Configuración | Ver roadmap en `especificaciones-sistema-comisiones.md` sección 9.2. |
| 5 | Revertir un crédito de puntaje otorgado por error (`fn_revertir_credito`) no tiene pantalla — se ejecuta manualmente vía SQL. | Sistema de Puntaje | Agregar una vista de administración en Configuración cuando haya casos reales que lo requieran. |

## 5. Escalabilidad

- `NG_DATA.comisiones.listar()` arma el árbol completo (comisiones → comandos → tareas) con 4 consultas y las junta en el cliente. Es simple y suficiente para ~30 comandos; si la organización crece mucho más, es candidato a convertirse en una vista SQL (`CREATE VIEW`) o función RPC para que el join ocurra en Postgres.
- Los 27 comandos regionales ya están indexados por `comision_id` (`idx_membresias_comando`, etc.) — las consultas de lectura no deberían degradarse notablemente incluso si cada comando llega a tener decenas de tareas.
- Supabase Realtime no está conectado todavía (el sistema recarga datos al navegar, no en vivo). Es la próxima pieza natural para que el tablero kanban y el calendario se actualicen solos — no requiere cambios de esquema, solo agregar `.channel()` en `data/*.js`.

## 6. Motor de acreditación de puntaje (nuevo — migraciones 0012/0013)

A diferencia del resto del sistema, aquí la capa de datos (`data/puntaje.js`, `data/asistencia.js`, `data/resultados.js`) **nunca calcula puntos** — solo hace INSERT/UPDATE de intención ("esta lista quedó validada", "esta sección de perfil se llenó"). Toda la aritmética vive en Postgres, en 3 funciones `SECURITY DEFINER` disparadas por trigger:

```
UPDATE usuarios (cambia región/DNI/etc.)
   └─▶ trigger fn_acreditar_perfil() → evalúa las 6 condiciones PROFILE_*
UPDATE attendance_lists SET validated_at=... (transición null → valor)
   └─▶ trigger fn_acreditar_asistencia() → exige audited_pct=100, recorre attendance_entries
UPDATE result_deliveries SET status='VALIDADO' (transición → VALIDADO)
   └─▶ trigger fn_acreditar_resultado() → monto = asistencia del evento × multiplicador, con techo
```

Las 3 funciones llaman a un único punto de entrada, `fn_acreditar(usuario, regla, version, ...)`, que:
1. Sale sin hacer nada si `fn_version_vigente_id()` devuelve NULL — mientras el reglamento esté en BORRADOR, los triggers corren pero no generan crédito real (ver especificaciones, sección 12.4).
2. Inserta en `credit_events` con `idempotency_key` única (`ON CONFLICT DO NOTHING`) — así reintentar la misma acción (ej. revalidar por error) nunca duplica puntos.
3. Si el insert fue nuevo, agrega el `ledger_movements` correspondiente y actualiza `member_score_balances` — el saldo **nunca se edita directo**, siempre se recalcula sumando el libro mayor.

**Detalle de diseño importante:** `credit_events.idempotency_key` es única a nivel de TODA la tabla, no por regla — por eso cada trigger arma su llave con un marcador de origen (`'|ATTENDANCE|'`, `'|RESULTS|'`, `'|PROFILE_X|'`) además del `usuario_id`/`evento_id`/`version_id`. Sin ese marcador, alguien que asiste Y entrega resultado del mismo evento perdería uno de los dos créditos por colisión de llave — se detectó y corrigió antes de esta entrega.

`eventos.nivel_organizador` es una columna **generada** (`GENERATED ALWAYS AS ... STORED`): se deriva sola de si el evento tiene `comando_id` (subcomisión), solo `comision_id` (comisión) o ninguno (nacional) — nadie la escribe a mano, ni el cliente ni un trigger.

## 6bis. Inscripción pública a eventos — link + QR (migración 0015, 2026-09-30)

Cada evento puede activar un **link único + QR** (`eventos.codigo_publico`, generado con `crypto.randomUUID()` recortado a 10 caracteres) que lleva a `inscripcion.html?e=<codigo>`. Esta página sigue el mismo patrón de "no hay páginas 100% anónimas" que `index.html`: exige sesión (cualquier cuenta autenticada, **incluidas las `pendiente`** — ver `rls-policies.sql`, rama pública de `eventos_select`), y si no hay sesión redirige a `login.html?next=inscripcion.html?e=...` (y de ahí, si hace falta, a `register.html`, que también propaga `next`) para volver exactamente al evento tras loguearse/registrarse.

Tabla nueva `event_inscripciones` (autoservicio: cada usuario inserta/actualiza SU PROPIA fila, `unique(evento_id, usuario_id)`, `estado` en `confirmado`/`cancelado`). **Importante:** esto es deliberadamente independiente del motor de puntaje de la sección 6 — inscribirse acá NO acredita nada por sí solo. El organizador (Dirección / Líder de la comisión / Coordinador del comando, mismo criterio que `canManageEnlaceOEvento`) revisa los confirmados desde el nuevo módulo **Eventos** (`views/eventos.js`, sidebar propio) y, si quiere, los "carga" con un botón explícito a la lista real de Asistencia (`attendance_lists`/`attendance_entries`, sección 6) reutilizando `crearLista`/`agregarAsistentes` — desde ahí sigue el flujo normal de auditoría/validación que sí dispara `fn_acreditar_asistencia`.

**ADR — generación del QR (2026-09-30, ajustado tras probarlo en vivo):** el QR se genera 100% en el cliente, sin backend ni API de pago — igual criterio que otros sistemas propios del usuario. Se probó primero con el paquete npm `qrcode` cargado como `<script src>` fijo en `app.html` apuntando a `cdn.jsdelivr.net`; en la práctica esa request puede fallar (bloqueadores de anuncios, extensiones, redes restringidas) y al ser un `<script>` cargado siempre al inicio, si fallaba no había forma de reintentar sin recargar toda la página. Se cambió a `assets/js/qr.js`: librería `qrcodejs` (davidshimjs) servida por `cdnjs.cloudflare.com`, cargada **dinámicamente** (`renderizarQR` la inyecta la primera vez que hace falta, no antes) y memoizada para no pedirla dos veces. `descargarQR` no exporta el canvas de la librería tal cual — lo redibuja sobre un canvas nuevo con fondo blanco sólido y margen de "zona tranquila" alrededor, para que el PNG descargado siempre sea escaneable. No se guarda ninguna imagen en la base de datos: desactivar/reactivar la inscripción pública conserva `codigo_publico`, así que el link/QR ya compartido/impreso sigue funcionando igual.

## 7. Roadmap hacia "app móvil" (APK)

Por pedido explícito: **no se desarrolla todavía**. Lo que sí se dejó listo para no tener que rehacer nada cuando se aborde esa etapa:
- El sitio ya es una PWA instalable (`site.webmanifest` + diseño responsive), que cubre buena parte de la necesidad de "app en el celular" sin pasar por una tienda.
- El stack (HTML/CSS/JS vanilla + Supabase) es compatible con herramientas de empaquetado tipo Capacitor/Cordova sin reescribir la lógica de negocio — solo se envuelve el sitio existente.
