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

## 5. Escalabilidad

- `NG_DATA.comisiones.listar()` arma el árbol completo (comisiones → comandos → tareas) con 4 consultas y las junta en el cliente. Es simple y suficiente para ~30 comandos; si la organización crece mucho más, es candidato a convertirse en una vista SQL (`CREATE VIEW`) o función RPC para que el join ocurra en Postgres.
- Los 27 comandos regionales ya están indexados por `comision_id` (`idx_membresias_comando`, etc.) — las consultas de lectura no deberían degradarse notablemente incluso si cada comando llega a tener decenas de tareas.
- Supabase Realtime no está conectado todavía (el sistema recarga datos al navegar, no en vivo). Es la próxima pieza natural para que el tablero kanban y el calendario se actualicen solos — no requiere cambios de esquema, solo agregar `.channel()` en `data/*.js`.

## 6. Roadmap hacia "app móvil" (APK)

Por pedido explícito: **no se desarrolla todavía**. Lo que sí se dejó listo para no tener que rehacer nada cuando se aborde esa etapa:
- El sitio ya es una PWA instalable (`site.webmanifest` + diseño responsive), que cubre buena parte de la necesidad de "app en el celular" sin pasar por una tienda.
- El stack (HTML/CSS/JS vanilla + Supabase) es compatible con herramientas de empaquetado tipo Capacitor/Cordova sin reescribir la lógica de negocio — solo se envuelve el sitio existente.
