-- =====================================================================
-- SCHEMA.SQL — Sistema de Comisiones "Nueva Generación"
-- ---------------------------------------------------------------------
-- Convenciones seguidas (ver ARCHITECTURE.md secc. "Buenas prácticas"):
--   · snake_case en tablas y columnas, siempre en plural para tablas.
--   · UUID como PK (gen_random_uuid()), nunca IDs autoincrementales
--     expuestos al cliente (evita enumeración de IDs).
--   · created_at / updated_at en toda tabla transaccional.
--   · El ROL no es un atributo fijo del usuario: vive en la tabla
--     `membresias` (usuario ↔ comando), porque una misma persona puede
--     ser Coordinador en un comando y Miembro en otro (ver spec secc. 3).
--   · Nada de lógica crítica en el cliente: el estado de una tarea solo
--     cambia por UPDATE controlado por RLS, nunca borrando/insertando filas.
--   · Parámetros de negocio (nombre org, colores, plazos) NO se
--     hardcodean: viven en la tabla `configuracion`, editable desde el
--     nuevo módulo de Configuración (solo Dirección).
-- Orden de ejecución: 1) este archivo  2) rls-policies.sql  3) (opcional)
-- seed-demo.sql. Los mismos 3 archivos existen versionados y numerados
-- dentro de assets/sql/migrations/.
-- =====================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUMS — controlan los valores válidos a nivel de base de datos
-- (más seguro que validar "estado" como texto libre desde el cliente).
-- ---------------------------------------------------------------------
do $$ begin
  create type rol_membresia as enum ('coordinador','secretario','miembro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_tarea as enum ('pendiente','en_curso','hecho');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alcance_contenido as enum ('general','comision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_usuario as enum ('activo','pendiente_activacion','suspendido','desaprobado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_tema_foro as enum ('abierto','en_debate','con_conclusion','cerrado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. USUARIOS — extiende auth.users (Supabase Auth) con datos de perfil.
--    El id ES el mismo id de auth.users: 1 fila por cuenta autenticada.
--    Se crea automáticamente vía trigger al registrarse (ver abajo).
-- ---------------------------------------------------------------------
create table if not exists usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null unique,
  nombre         text not null,
  telefono       text,
  dni            text, -- (2026-07-28) para invitación masiva desde la base de simpatizantes
  avatar_url     text,
  es_direccion   boolean not null default false, -- rol global "Dirección General"
  estado         estado_usuario not null default 'pendiente_activacion',
  motivo_rechazo text, -- (2026-08-16) solo tiene sentido si estado='desaprobado'; opcional
  rechazado_por  uuid references usuarios(id) on delete set null,
  rechazado_en   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table usuarios is 'Perfil de cada persona autenticada. es_direccion=true = Dirección General (acceso total).';
comment on column usuarios.estado is 'pendiente_activacion = recién se registró; activo = aprobado por un Líder; suspendido = miembro activo al que se le quitó el acceso; desaprobado = solicitud de ingreso rechazada (ver motivo_rechazo/rechazado_por).';

-- ---------------------------------------------------------------------
-- 2. COMISIONES — las 5 comisiones fijas (Comunidad, Organización, etc.)
-- ---------------------------------------------------------------------
create table if not exists comisiones (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nombre      text not null,
  color       text not null default '#8A93A6', -- hex, usado en UI (calendario, chips)
  mision      text,
  lider_id    uuid references usuarios(id) on delete set null,
  orden       integer not null default 0, -- orden de despliegue en la UI
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table comisiones is 'Las 5 comisiones de trabajo. lider_id = único Líder de Comisión (rol fijo por comisión).';

-- ---------------------------------------------------------------------
-- 3. COMANDOS — comandos operativos / subgrupos dentro de una comisión.
--    Organización tiene 1 por región (27); las demás, 1 o pocos.
-- ---------------------------------------------------------------------
create table if not exists comandos (
  id           uuid primary key default gen_random_uuid(),
  comision_id  uuid not null references comisiones(id) on delete cascade,
  slug         text not null,
  nombre       text not null,
  region       text, -- solo aplica a comandos de la comisión Organización
  enlace_url   text, -- link del grupo de coordinación del comando (WhatsApp u otro), opcional
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (comision_id, slug)
);
comment on table comandos is 'Comando operativo (subgrupo) dentro de una comisión. 27 filas para Organización, generadas por loop en seed-demo.sql.';
comment on column comandos.enlace_url is 'Enlace directo del grupo de coordinación de ESTE comando (ej. link de WhatsApp). Distinto de la tabla "enlaces", que es la biblioteca de recursos de la comisión entera.';

-- ---------------------------------------------------------------------
-- 4. MEMBRESÍAS — usuario ↔ comando, con el rol CONTEXTUAL a ese comando.
--    Un usuario puede tener varias filas (una por comando al que pertenece).
-- ---------------------------------------------------------------------
create table if not exists membresias (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  comando_id   uuid not null references comandos(id) on delete cascade,
  rol          rol_membresia not null default 'miembro',
  created_at   timestamptz not null default now(),
  unique (usuario_id, comando_id)
);
comment on table membresias is 'Relación usuario-comando. El rol vive aquí, no en usuarios, porque es distinto por comando.';
create index if not exists idx_membresias_usuario on membresias(usuario_id);
create index if not exists idx_membresias_comando on membresias(comando_id);

-- ---------------------------------------------------------------------
-- 5. TAREAS — tablero kanban de cada comando.
-- ---------------------------------------------------------------------
create table if not exists tareas (
  id            uuid primary key default gen_random_uuid(),
  comando_id    uuid not null references comandos(id) on delete cascade,
  titulo        text not null,
  descripcion   text,
  asignado_id   uuid references usuarios(id) on delete set null,
  estado        estado_tarea not null default 'pendiente',
  fecha_limite  date,
  created_by    uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table tareas is 'El estado solo se cambia por UPDATE controlado por RLS (ver fn de permisos "editar" en rls-policies.sql).';
comment on column tareas.asignado_id is 'DEPRECADO desde que existe tarea_asignados (multi-asignado). Se deja nullable por compatibilidad; el código nuevo no lo usa.';
create index if not exists idx_tareas_comando on tareas(comando_id);
create index if not exists idx_tareas_asignado on tareas(asignado_id);
create index if not exists idx_tareas_estado on tareas(estado);

-- ---------------------------------------------------------------------
-- 5.1 TAREA_ASIGNADOS — una tarea puede tener VARIAS personas asignadas
--     (reemplaza a tareas.asignado_id, que solo permitía una). Tabla
--     puente clásica muchos-a-muchos, PK compuesta evita duplicados.
-- ---------------------------------------------------------------------
create table if not exists tarea_asignados (
  tarea_id    uuid not null references tareas(id) on delete cascade,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tarea_id, usuario_id)
);
comment on table tarea_asignados is 'Asignación múltiple de personas a una tarea. Quién puede escribir aquí: mismas reglas que crear/editar la tarea (ver rls-policies.sql).';
create index if not exists idx_tarea_asignados_usuario on tarea_asignados(usuario_id);

-- ---------------------------------------------------------------------
-- 6. EVENTOS — calendario compartido.
-- ---------------------------------------------------------------------
create table if not exists eventos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descripcion  text,
  fecha        date not null,
  hora         time,
  alcance      alcance_contenido not null default 'general',
  comision_id  uuid references comisiones(id) on delete cascade,
  created_by   uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_eventos_fecha on eventos(fecha);
create index if not exists idx_eventos_comision on eventos(comision_id);

-- ---------------------------------------------------------------------
-- 7. COMUNICADOS — feed de anuncios.
-- ---------------------------------------------------------------------
create table if not exists comunicados (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  cuerpo       text not null,
  alcance      alcance_contenido not null default 'general',
  comision_id  uuid references comisiones(id) on delete cascade,
  autor_id     uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_comunicados_comision on comunicados(comision_id);

-- ---------------------------------------------------------------------
-- 8. ENLACES — biblioteca de recursos compartidos.
-- ---------------------------------------------------------------------
create table if not exists enlaces (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  url          text not null,
  descripcion  text,
  comision_id  uuid references comisiones(id) on delete cascade, -- null = general
  autor_id     uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_enlaces_comision on enlaces(comision_id);

-- ---------------------------------------------------------------------
-- 8.1 FORO — espacio de debate abierto, sin etiqueta de comisión ni de
--     línea política. Un tema plantea UN problema concreto de la
--     sociedad; el hilo de comentarios busca converger en una
--     "conclusion" + "ruta_accion" (qué se va a hacer, no solo opinar).
--     Cualquier persona autenticada (incluido Colaborador) puede abrir
--     temas y comentar — es intencionalmente el espacio más abierto del
--     sistema. Cerrar con conclusión sí está más controlado (ver
--     rls-policies.sql): autor del tema, Dirección o cualquier Líder.
-- ---------------------------------------------------------------------
create table if not exists foro_temas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  problema     text not null, -- el problema social concreto que el tema busca resolver
  autor_id     uuid references usuarios(id) on delete set null,
  comision_id  uuid references comisiones(id) on delete set null, -- opcional: liga el tema a una comisión afín
  estado       estado_tema_foro not null default 'abierto',
  conclusion   text, -- se llena cuando el debate converge en un acuerdo
  ruta_accion  text, -- pasos concretos para resolverlo: qué, quién, cuándo
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table foro_temas is 'Temas de debate del Foro de Ideas. estado avanza abierto -> en_debate (automático al primer comentario) -> con_conclusion (manual, con conclusion+ruta_accion).';
create index if not exists idx_foro_temas_comision on foro_temas(comision_id);
create index if not exists idx_foro_temas_estado on foro_temas(estado);

create table if not exists foro_comentarios (
  id            uuid primary key default gen_random_uuid(),
  tema_id       uuid not null references foro_temas(id) on delete cascade,
  autor_id      uuid references usuarios(id) on delete set null,
  cuerpo        text not null,
  es_propuesta  boolean not null default false, -- marca el comentario como "propuesta de solución concreta" (se resalta distinto en la UI)
  created_at    timestamptz not null default now()
);
create index if not exists idx_foro_comentarios_tema on foro_comentarios(tema_id);

create table if not exists foro_votos (
  comentario_id  uuid not null references foro_comentarios(id) on delete cascade,
  usuario_id     uuid not null references usuarios(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (comentario_id, usuario_id)
);
comment on table foro_votos is '"Apoyo" a un comentario/propuesta puntual — mide qué tanto consenso junta cada idea dentro del hilo.';

-- ---------------------------------------------------------------------
-- 8.2 FLYERS — piezas gráficas de la landing pública (index.html): lo
--     primero que ve cualquiera con cuenta que todavía no fue aprobada
--     por un Líder (rol "pendiente"), junto con fundadores (configuracion)
--     y eventos/comunicados alcance='general'. Gestión exclusiva de
--     Dirección (ver rls-policies.sql).
-- ---------------------------------------------------------------------
create table if not exists flyers (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descripcion  text,
  imagen_url   text not null, -- sube la imagen al bucket "flyers" en Supabase Storage y pega el link público aquí
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_by   uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_flyers_orden on flyers(orden);
comment on table flyers is 'Piezas gráficas mostradas en la landing pública (index.html).';

-- ---------------------------------------------------------------------
-- 9. CONFIGURACION — parámetros de negocio editables por Dirección desde
--    el módulo "Configuración" de la UI. Clave/valor en jsonb para no
--    tener que migrar el esquema cada vez que se agrega un parámetro.
-- ---------------------------------------------------------------------
create table if not exists configuracion (
  clave            text primary key,
  valor            jsonb not null,
  descripcion      text,
  actualizado_por  uuid references usuarios(id) on delete set null,
  updated_at       timestamptz not null default now()
);
comment on table configuracion is 'Cero hardcode: todo parámetro que Dirección pueda querer cambiar vive aquí, no en el código.';

-- Valores iniciales — ver ARCHITECTURE.md para el detalle de cada clave.
insert into configuracion (clave, valor, descripcion) values
  ('organizacion.nombre', '"Nueva Generación"', 'Nombre mostrado en sidebar, login y título del sitio'),
  ('organizacion.eslogan', '"Sistema de Comisiones"', 'Subtítulo debajo del nombre'),
  ('marca.color_primario', '"#16213E"', 'Color ink/primario de la interfaz (sidebar, botones primarios)'),
  ('marca.color_acento', '"#D9A426"', 'Color de acento (botones destacados, hoy en calendario)'),
  ('negocio.dias_aviso_vencimiento', '3', 'Días de anticipación para avisar que una tarea está por vencer'),
  ('negocio.max_contactos_por_persona', '10', 'Tope de contactos a levantar por persona en campañas de Organización'),
  ('notificaciones.activas', 'true', 'Interruptor global de notificaciones in-app (placeholder para futura integración push/WhatsApp)')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 10. AUDITORÍA — trazabilidad de cambios sensibles (ej. estado de tareas).
--     Se llena vía trigger (ver más abajo), nunca por INSERT directo del
--     cliente — así el registro es confiable.
-- ---------------------------------------------------------------------
create table if not exists auditoria (
  id                 bigint generated always as identity primary key,
  usuario_id         uuid references usuarios(id) on delete set null,
  tabla              text not null,
  registro_id        uuid,
  accion             text not null,
  datos_anteriores   jsonb,
  datos_nuevos       jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists idx_auditoria_tabla on auditoria(tabla, registro_id);

-- ---------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------

-- 10.1 updated_at automático en toda tabla que lo tenga.
create or replace function fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['usuarios','comisiones','comandos','tareas'] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on %1$s;
       create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function fn_set_updated_at();', t);
  end loop;
end $$;

-- 10.2 Alta automática en `usuarios` cuando alguien se registra en
--      Supabase Auth (register.html hace supabase.auth.signUp()).
--      El bloque interno "begin...exception when others" es a propósito
--      (2026-07-26): este proyecto comparte auth.users con otras apps en
--      el mismo Supabase (ej. una app de tarjetas de presentación con su
--      propio trigger). CUALQUIER trigger sobre auth.users que no atrape
--      sus errores puede tumbar el signUp() de TODAS las apps que
--      comparten esa tabla, no solo la suya — pasó exactamente eso y
--      causó un 500 "Database error saving new user" en todos los
--      registros nuevos. Por eso esta función nunca debe dejar escapar
--      una excepción: si algo falla, se registra como warning y el
--      registro de la persona sigue su curso con normalidad.
--
--      "public.usuarios" (con el esquema explícito) es OBLIGATORIO acá,
--      no cosmético: un trigger disparado desde auth.users corre con el
--      search_path de ese contexto, que NO incluye "public" por defecto.
--      Escribir solo "usuarios" (sin el esquema) daba el error real que
--      quedaba atrapado en silencio por el bloque de arriba: "relation
--      usuarios does not exist" — la tabla existe, pero no la encontraba.
create or replace function fn_nuevo_usuario_auth()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  begin
    -- (2026-07-28) También precarga teléfono/DNI si vienen en los metadatos
    -- de la cuenta (ej. invitación masiva vía Admin API con `data: {nombre,
    -- telefono, dni}`) — antes solo el nombre se copiaba, el resto se
    -- quedaba vacío hasta que la persona lo llenara a mano en "Mi perfil".
    insert into public.usuarios (id, email, nombre, telefono, dni, estado)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
      new.raw_user_meta_data->>'telefono',
      new.raw_user_meta_data->>'dni',
      'pendiente_activacion'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'fn_nuevo_usuario_auth() falló para % (no se detuvo el registro): %', new.email, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_nuevo_usuario_auth on auth.users;
create trigger trg_nuevo_usuario_auth
  after insert on auth.users
  for each row execute function fn_nuevo_usuario_auth();

-- 10.3 Auditoría automática de cambios de estado en tareas.
create or replace function fn_auditar_cambio_tarea()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'UPDATE' and new.estado is distinct from old.estado) then
    insert into auditoria (usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos)
    values (auth.uid(), 'tareas', new.id, 'update_estado',
            jsonb_build_object('estado', old.estado),
            jsonb_build_object('estado', new.estado));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auditar_cambio_tarea on tareas;
create trigger trg_auditar_cambio_tarea
  after update on tareas
  for each row execute function fn_auditar_cambio_tarea();

-- =====================================================================
-- 11. SISTEMA DE PUNTAJE — catálogo de reglas (Etapa 7, migración 0012).
--     Ver assets/sql/migrations/0012_sistema_puntaje_reglas.sql para el
--     detalle comentado de cada tabla y la semilla de valores aprobada
--     en PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md. El motor que acredita
--     puntos de verdad (eventos, asistencia, entrega de resultados,
--     libro mayor) es una etapa aparte (migración 0013 en adelante).
-- =====================================================================
do $$ begin
  create type estado_version_puntaje as enum ('BORRADOR','VIGENTE','CERRADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_actividad_puntaje as enum ('territorial','virtual','presencial','hibrida','capacitacion','asamblea');
exception when duplicate_object then null; end $$;

do $$ begin
  create type nivel_organizador_puntaje as enum ('subcomision','comision','nacional');
exception when duplicate_object then null; end $$;

create table if not exists scoring_rule_versions (
  version_id           uuid primary key default gen_random_uuid(),
  version_code         text not null unique,
  document_hash_sha256  text,
  approval_reference    text,
  approving_authority   text not null default 'Directiva Nacional',
  approved_at           timestamptz,
  effective_from        timestamptz,
  effective_until       timestamptz,
  status                estado_version_puntaje not null default 'BORRADOR',
  notas                 text,
  created_by            uuid references usuarios(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table scoring_rule_versions is 'Versiones del Reglamento de Puntajes. Mientras status=BORRADOR, ningún valor de sus reglas acredita puntos reales.';
create unique index if not exists idx_una_version_vigente on scoring_rule_versions ((true)) where status = 'VIGENTE';

create table if not exists scoring_rules (
  rule_id                  uuid primary key default gen_random_uuid(),
  rule_code                text not null,
  origin_type              text not null,
  version_id               uuid not null references scoring_rule_versions(version_id) on delete cascade,
  etiqueta                 text not null,
  eligibility_condition     text not null,
  evidence_type            text not null,
  idempotency_key_template  text not null,
  period_cap_qty            int,
  period_cap_window         text,
  effective_from            timestamptz,
  effective_until           timestamptz,
  invalidation_condition    text not null default '',
  reversal_policy           text not null default '',
  notification_policy       text not null default '',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (version_id, rule_code)
);
comment on table scoring_rules is 'Catálogo de orígenes de puntaje del reglamento, uno por versión de scoring_rule_versions.';

create table if not exists rule_fixed_value (
  rule_id  uuid primary key references scoring_rules(rule_id) on delete cascade,
  amount   int not null check (amount >= 0)
);

create table if not exists rule_value_matrix (
  matrix_id         uuid primary key default gen_random_uuid(),
  rule_id           uuid not null references scoring_rules(rule_id) on delete cascade,
  tipo_actividad    tipo_actividad_puntaje not null,
  nivel_organizador nivel_organizador_puntaje not null,
  amount            int check (amount is null or amount >= 0),
  unique (rule_id, tipo_actividad, nivel_organizador)
);

create table if not exists rule_multiplier_value (
  rule_id       uuid primary key references scoring_rules(rule_id) on delete cascade,
  multiplicador numeric not null check (multiplicador > 0),
  techo         int check (techo is null or techo >= 0),
  plazo_dias    int check (plazo_dias is null or plazo_dias >= 0)
);

create index if not exists idx_scoring_rules_version on scoring_rules(version_id);
create index if not exists idx_rule_value_matrix_rule on rule_value_matrix(rule_id);

do $$
declare t text;
begin
  foreach t in array array['scoring_rule_versions','scoring_rules'] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on %1$s;
       create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function fn_set_updated_at();', t);
  end loop;
end $$;

-- Semilla: versión '1.0.0-borrador.2' con los valores propuestos en
-- PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md, aprobados por la Directiva
-- para esta 1ª etapa. Idempotente (no repite si ya existe la versión).
do $$
declare
  v_version_id uuid;
  v_rule_account uuid;
  v_rule_identity uuid;
  v_rule_territory uuid;
  v_rule_contact uuid;
  v_rule_education uuid;
  v_rule_about uuid;
  v_rule_attendance uuid;
  v_rule_results uuid;
begin
  select version_id into v_version_id from scoring_rule_versions where version_code = '1.0.0-borrador.2';

  if v_version_id is null then
    insert into scoring_rule_versions (version_code, status, notas)
    values ('1.0.0-borrador.2', 'BORRADOR', 'Semilla desde PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md — pendiente de acta, hash y fecha de vigencia.')
    returning version_id into v_version_id;

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_ACCOUNT', 'PROFILE', v_version_id, 'Cuenta', 'Correo verificado + aceptaciones', 'Ninguna (automática)', 'usuario+PROFILE_ACCOUNT+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual si se detecta cuenta indebida', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_account;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_account, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_IDENTITY', 'PROFILE', v_version_id, 'Identidad', 'Nombres, apellidos y DNI completados', 'Autorizada por Dirección/Líder', 'usuario+PROFILE_IDENTITY+version', null, 'NONE', 'Si se corrige y deja de cumplir la condición', 'Reverso con motivo', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_identity;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_identity, 20);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_TERRITORY', 'PROFILE', v_version_id, 'Territorio', 'Región/provincia/distrito completados', 'Ninguna (automática)', 'usuario+PROFILE_TERRITORY+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_territory;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_territory, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_CONTACT', 'PROFILE', v_version_id, 'Contacto', 'Correo + teléfono completados', 'Automática (1er corte)', 'usuario+PROFILE_CONTACT+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_contact;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_contact, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_EDUCATION_OCCUPATION', 'PROFILE', v_version_id, 'Formación y ocupación', 'Formación académica + ocupación completadas', 'Ninguna (automática)', 'usuario+PROFILE_EDUCATION_OCCUPATION+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_education;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_education, 15);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_ABOUT', 'PROFILE', v_version_id, 'Acerca de mí', 'Biografía completada', 'Moderación posterior si es observada', 'usuario+PROFILE_ABOUT+version', null, 'NONE', 'Si es observada por moderación', 'Reverso con motivo', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_about;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_about, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('ATTENDANCE_VALIDATED', 'ATTENDANCE', v_version_id, 'Asistencia validada', 'Presente en lista de asistencia auditada al 100% y validada', 'Lista de asistencia validada por la autoridad del nivel del evento', 'usuario+evento+version', 8, 'MONTH', 'Si la lista se invalida tras auditoría', 'Reverso automático si se invalida la lista', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_attendance;

    insert into rule_value_matrix (rule_id, tipo_actividad, nivel_organizador, amount) values
      (v_rule_attendance, 'territorial',   'subcomision', 10),
      (v_rule_attendance, 'territorial',   'comision',    15),
      (v_rule_attendance, 'territorial',   'nacional',    null),
      (v_rule_attendance, 'virtual',       'subcomision', 12),
      (v_rule_attendance, 'virtual',       'comision',    20),
      (v_rule_attendance, 'virtual',       'nacional',    35),
      (v_rule_attendance, 'presencial',    'subcomision', 15),
      (v_rule_attendance, 'presencial',    'comision',    25),
      (v_rule_attendance, 'presencial',    'nacional',    45),
      (v_rule_attendance, 'hibrida',       'subcomision', 14),
      (v_rule_attendance, 'hibrida',       'comision',    22),
      (v_rule_attendance, 'hibrida',       'nacional',    40),
      (v_rule_attendance, 'capacitacion',  'subcomision', 18),
      (v_rule_attendance, 'capacitacion',  'comision',    30),
      (v_rule_attendance, 'capacitacion',  'nacional',    50),
      (v_rule_attendance, 'asamblea',      'subcomision', null),
      (v_rule_attendance, 'asamblea',      'comision',    null),
      (v_rule_attendance, 'asamblea',      'nacional',    70);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('RESULTS_DELIVERED', 'RESULTS', v_version_id, 'Entrega de resultados', 'Evidencia de resultado cargada y validada dentro del plazo desde el cierre del evento', 'Documento/informe de resultados referenciado (no se publica en el ranking)', 'responsable+evento+version', null, 'NONE', 'Si la evidencia es rechazada', 'Reverso con motivo, enlazado al crédito original', 'Notificar al responsable al validarse')
    returning rule_id into v_rule_results;
    insert into rule_multiplier_value (rule_id, multiplicador, techo, plazo_dias) values (v_rule_results, 2.5, 100, 7);
  end if;
end $$;

-- =====================================================================
-- =====================================================================
-- 12. MOTOR DE ACREDITACIÓN — Etapa 8, migración 0013. Ver
--     assets/sql/migrations/0013_motor_acreditacion.sql para el detalle
--     comentado. Campos de perfil, extensión de eventos, tablas de
--     asistencia/entrega de resultados y el libro mayor con sus
--     triggers de acreditación automática.
--
-- Ejecuta esto en el SQL Editor de Supabase, DESPUÉS de 0012. Es
-- idempotente (create table/policy if not exists + drop policy if
-- exists + create or replace function).
-- =====================================================================

-- 1. CAMPOS DE PERFIL que faltaban para el wizard "Completar perfil" y
--    para poder evaluar las condiciones PROFILE_TERRITORY / PROFILE_
--    EDUCATION_OCCUPATION / PROFILE_ABOUT.
-- ---------------------------------------------------------------------
alter table usuarios add column if not exists region text;
alter table usuarios add column if not exists provincia text;
alter table usuarios add column if not exists distrito text;
alter table usuarios add column if not exists formacion_academica text;
alter table usuarios add column if not exists ocupacion text;
alter table usuarios add column if not exists acerca_de_mi text;
alter table usuarios add column if not exists intereses_civicos text[];
comment on column usuarios.region is 'Territorio de residencia del miembro (distinto de comandos.region, que es el ámbito de un comando operativo). Alimenta PROFILE_TERRITORY.';

-- 1.1. PAÍS (migración 0014) — 'Perú' por defecto. Decide en el cliente
--      si región/provincia/distrito son selects del catálogo peruano o
--      texto libre (otros países); no afecta a PROFILE_TERRITORY.
alter table usuarios add column if not exists pais text not null default 'Perú';
comment on column usuarios.pais is 'País de residencia del miembro. Perú por defecto. Determina si región/provincia/distrito se llenan con el catálogo peruano (selects) o como texto libre (otros países). No afecta al motor de puntaje.';

-- ---------------------------------------------------------------------
-- 2. EVENTOS — agrega tipo de actividad y comando (para eventos a nivel
--    subcomisión). nivel_organizador se deriva solo: si tiene comando_id
--    es 'subcomision'; si tiene comision_id (sin comando) es 'comision';
--    si no tiene ninguno es 'nacional' — igual criterio que alcance
--    'general' ya usado para comunicados/eventos de toda la organización.
-- ---------------------------------------------------------------------
alter table eventos add column if not exists comando_id uuid references comandos(id) on delete set null;
alter table eventos add column if not exists tipo_actividad tipo_actividad_puntaje;
alter table eventos add column if not exists cancelado boolean not null default false;

do $$ begin
  alter table eventos add column nivel_organizador nivel_organizador_puntaje
    generated always as (
      case when comando_id is not null then 'subcomision'::nivel_organizador_puntaje
           when comision_id is not null then 'comision'::nivel_organizador_puntaje
           else 'nacional'::nivel_organizador_puntaje end
    ) stored;
exception when duplicate_column then null; end $$;

comment on column eventos.tipo_actividad is 'Tipo de actividad para el motor de puntaje (territorial/virtual/presencial/hibrida/capacitacion/asamblea). NULL = evento no acreditable (ej. un simple recordatorio).';
comment on column eventos.nivel_organizador is 'Derivado automáticamente de quién organiza: comando_id → subcomisión, comision_id (sin comando) → comisión, ninguno → Directiva Nacional.';

-- ---------------------------------------------------------------------
-- 3. ASISTENCIA — listas cargadas por la autoridad del ámbito del
--    evento, auditadas y validadas (reglamento sección 8).
-- ---------------------------------------------------------------------
create table if not exists attendance_lists (
  list_id      uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references eventos(id) on delete cascade,
  uploaded_by  uuid references usuarios(id) on delete set null,
  audited_pct  numeric not null default 0 check (audited_pct >= 0 and audited_pct <= 100),
  validated_at timestamptz,
  validated_by uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
comment on table attendance_lists is 'Una lista por evento. Se acredita puntaje recién cuando validated_at se llena (ver fn_acreditar_asistencia).';

create table if not exists attendance_entries (
  entry_id     uuid primary key default gen_random_uuid(),
  list_id      uuid not null references attendance_lists(list_id) on delete cascade,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  resolved_at  timestamptz not null default now(),
  unique (list_id, usuario_id)
);
create index if not exists idx_attendance_entries_usuario on attendance_entries(usuario_id);

-- ---------------------------------------------------------------------
-- 4. ENTREGA DE RESULTADOS — origen nuevo (RESULTS_DELIVERED).
-- ---------------------------------------------------------------------
create table if not exists result_deliveries (
  delivery_id   uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references eventos(id) on delete cascade,
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  evidence_ref  text not null,
  status        text not null default 'PENDIENTE' check (status in ('PENDIENTE','VALIDADO','RECHAZADO')),
  validated_by  uuid references usuarios(id) on delete set null,
  validated_at  timestamptz,
  motivo_rechazo text,
  created_at    timestamptz not null default now(),
  unique (evento_id, usuario_id)
);
comment on table result_deliveries is 'Un responsable entrega evidencia por evento; se acredita cuando status pasa a VALIDADO (ver fn_acreditar_resultado).';

-- ---------------------------------------------------------------------
-- 5. LIBRO MAYOR — credit_events (evento acreditable) + ledger_movements
--    (movimientos, inmutables). El saldo vive en member_score_balances y
--    SIEMPRE se recalcula sumando el libro, nunca se edita directo.
-- ---------------------------------------------------------------------
create table if not exists credit_events (
  credit_event_id  uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references usuarios(id) on delete cascade,
  rule_id          uuid not null references scoring_rules(rule_id),
  version_id       uuid not null references scoring_rule_versions(version_id),
  source_type      text not null check (source_type in ('attendance_entry','profile_section','result_delivery')),
  source_ref_id    uuid not null,
  idempotency_key  text not null,
  status           text not null default 'ACREDITADO' check (status in ('ACREDITADO','INVALIDADO')),
  evidence_ref     text,
  created_at       timestamptz not null default now(),
  unique (idempotency_key)
);
create index if not exists idx_credit_events_usuario on credit_events(usuario_id, created_at);
create index if not exists idx_credit_events_rule on credit_events(rule_id);

create table if not exists ledger_movements (
  movement_id        uuid primary key default gen_random_uuid(),
  credit_event_id    uuid not null references credit_events(credit_event_id) on delete cascade,
  usuario_id         uuid not null references usuarios(id) on delete cascade,
  amount             int not null,
  movement_type      text not null check (movement_type in ('CREDITO','REVERSO')),
  linked_movement_id uuid references ledger_movements(movement_id),
  version_id         uuid not null references scoring_rule_versions(version_id),
  reason             text,
  requested_by       uuid references usuarios(id) on delete set null,
  reviewed_by        uuid references usuarios(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_ledger_movements_usuario on ledger_movements(usuario_id, created_at);
comment on table ledger_movements is 'Inmutable: nunca se hace UPDATE/DELETE, solo INSERT. Un reverso es un movimiento nuevo con amount negativo, enlazado al original.';

create table if not exists member_score_balances (
  usuario_id       uuid primary key references usuarios(id) on delete cascade,
  balance          int not null default 0,
  score_reached_at timestamptz not null default now()
);
comment on table member_score_balances is 'Proyección del saldo por miembro. score_reached_at = última vez que cambió el saldo, para desempate en el ranking (reglamento sección 13.1).';

-- ---------------------------------------------------------------------
-- 6. HELPERS del motor
-- ---------------------------------------------------------------------

-- Versión VIGENTE actual (o NULL si ninguna lo está — mientras el
-- reglamento siga en BORRADOR, todo el motor queda inactivo a propósito).
create or replace function fn_version_vigente_id()
returns uuid language sql stable as $$
  select version_id from scoring_rule_versions where status = 'VIGENTE' limit 1;
$$;

-- Suma (o resta) al saldo de un miembro y refresca score_reached_at.
create or replace function fn_sumar_balance(p_usuario_id uuid, p_amount int)
returns void language plpgsql security definer as $$
begin
  insert into member_score_balances (usuario_id, balance, score_reached_at)
  values (p_usuario_id, p_amount, now())
  on conflict (usuario_id) do update
    set balance = member_score_balances.balance + excluded.balance,
        score_reached_at = now();
end;
$$;

-- Inserta un credit_event + su ledger_movement si la idempotency_key no
-- existe todavía. Devuelve true si acreditó, false si ya existía.
create or replace function fn_acreditar(
  p_usuario_id uuid, p_rule_id uuid, p_version_id uuid, p_source_type text,
  p_source_ref_id uuid, p_idempotency_key text, p_amount int, p_evidence_ref text default null
) returns boolean language plpgsql security definer as $$
declare v_credit_event_id uuid;
begin
  if p_amount is null or p_amount <= 0 then return false; end if;

  insert into credit_events (usuario_id, rule_id, version_id, source_type, source_ref_id, idempotency_key, evidence_ref)
  values (p_usuario_id, p_rule_id, p_version_id, p_source_type, p_source_ref_id, p_idempotency_key, p_evidence_ref)
  on conflict (idempotency_key) do nothing
  returning credit_event_id into v_credit_event_id;

  if v_credit_event_id is null then return false; end if; -- ya existía

  insert into ledger_movements (credit_event_id, usuario_id, amount, movement_type, version_id)
  values (v_credit_event_id, p_usuario_id, p_amount, 'CREDITO', p_version_id);

  perform fn_sumar_balance(p_usuario_id, p_amount);
  return true;
end;
$$;

-- Reverso manual de un crédito (uso de Dirección — sin UI propia todavía,
-- pensado para correrse desde el SQL Editor o una futura pantalla admin).
create or replace function fn_revertir_credito(p_credit_event_id uuid, p_motivo text, p_revisado_por uuid)
returns void language plpgsql security definer as $$
declare v_ce record;
begin
  select * into v_ce from credit_events where credit_event_id = p_credit_event_id and status = 'ACREDITADO';
  if not found then raise exception 'Crédito % no existe o ya fue invalidado', p_credit_event_id; end if;

  update credit_events set status = 'INVALIDADO' where credit_event_id = p_credit_event_id;

  insert into ledger_movements (credit_event_id, usuario_id, amount, movement_type, linked_movement_id, version_id, reason, reviewed_by)
  select p_credit_event_id, v_ce.usuario_id, -lm.amount, 'REVERSO', lm.movement_id, lm.version_id, p_motivo, p_revisado_por
  from ledger_movements lm where lm.credit_event_id = p_credit_event_id and lm.movement_type = 'CREDITO';

  perform fn_sumar_balance(v_ce.usuario_id, (
    select -amount from ledger_movements where credit_event_id = p_credit_event_id and movement_type = 'CREDITO' limit 1
  ));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. PERFIL — acredita PROFILE_* cuando la condición se cumple. Corre en
--    cada UPDATE de usuarios (barato: una fila, unos pocos SELECT
--    indexados) y también en el INSERT inicial (por si ya trae datos
--    precargados, ej. invitación masiva con dni).
-- ---------------------------------------------------------------------
create or replace function fn_acreditar_perfil()
returns trigger language plpgsql security definer as $$
declare
  v_version_id uuid;
  v_rule record;
begin
  v_version_id := fn_version_vigente_id();
  if v_version_id is null then return new; end if; -- reglamento sigue en BORRADOR

  -- PROFILE_ACCOUNT: se acredita cuando la cuenta queda 'activo' (aprobada).
  if new.estado = 'activo' then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_ACCOUNT';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_ACCOUNT|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_IDENTITY: nombre + DNI completos.
  if new.nombre is not null and new.dni is not null and length(trim(new.dni)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_IDENTITY';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_IDENTITY|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_TERRITORY: región + provincia + distrito.
  if new.region is not null and new.provincia is not null and new.distrito is not null then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_TERRITORY';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_TERRITORY|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_CONTACT: correo + teléfono.
  if new.email is not null and new.telefono is not null and length(trim(new.telefono)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_CONTACT';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_CONTACT|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_EDUCATION_OCCUPATION: formación + ocupación.
  if new.formacion_academica is not null and length(trim(new.formacion_academica)) > 0
     and new.ocupacion is not null and length(trim(new.ocupacion)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_EDUCATION_OCCUPATION';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_EDUCATION_OCCUPATION|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_ABOUT: biografía.
  if new.acerca_de_mi is not null and length(trim(new.acerca_de_mi)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_ABOUT';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_ABOUT|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_acreditar_perfil on usuarios;
create trigger trg_acreditar_perfil
  after insert or update on usuarios
  for each row execute function fn_acreditar_perfil();

-- ---------------------------------------------------------------------
-- 8. ASISTENCIA — al validar una lista (validated_at pasa de NULL a un
--    valor), acredita ATTENDANCE_VALIDATED a cada persona de la lista,
--    respetando el tope mensual (period_cap_qty/period_cap_window).
-- ---------------------------------------------------------------------
create or replace function fn_acreditar_asistencia()
returns trigger language plpgsql security definer as $$
declare
  v_version_id uuid;
  v_rule record;
  v_evento record;
  v_amount int;
  v_entry record;
  v_ya_este_mes int;
begin
  if new.validated_at is null or old.validated_at is not null then return new; end if; -- solo en la transición a validado
  if new.audited_pct < 100 then
    raise exception 'No se puede validar una lista de asistencia con auditoría menor al 100%% (actual: %)', new.audited_pct;
  end if;

  v_version_id := fn_version_vigente_id();
  if v_version_id is null then return new; end if;

  select rule_id, period_cap_qty, period_cap_window into v_rule
  from scoring_rules where version_id = v_version_id and rule_code = 'ATTENDANCE_VALIDATED';
  if v_rule.rule_id is null then return new; end if;

  select tipo_actividad, nivel_organizador into v_evento from eventos where id = new.evento_id;
  if v_evento.tipo_actividad is null then return new; end if; -- evento no clasificado, no acreditable

  select amount into v_amount from rule_value_matrix
  where rule_id = v_rule.rule_id and tipo_actividad = v_evento.tipo_actividad and nivel_organizador = v_evento.nivel_organizador;
  if v_amount is null then return new; end if; -- "No aplica" esa combinación

  for v_entry in select * from attendance_entries where list_id = new.list_id loop
    if v_rule.period_cap_qty is not null and v_rule.period_cap_window = 'MONTH' then
      select count(*) into v_ya_este_mes from credit_events
      where usuario_id = v_entry.usuario_id and rule_id = v_rule.rule_id and status = 'ACREDITADO'
        and created_at >= date_trunc('month', now());
      if v_ya_este_mes >= v_rule.period_cap_qty then continue; end if; -- tope alcanzado, se salta esta entrada
    end if;

    perform fn_acreditar(v_entry.usuario_id, v_rule.rule_id, v_version_id, 'attendance_entry', v_entry.entry_id,
      v_entry.usuario_id || '|ATTENDANCE|' || new.evento_id || '|' || v_version_id, v_amount);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_acreditar_asistencia on attendance_lists;
create trigger trg_acreditar_asistencia
  after update on attendance_lists
  for each row execute function fn_acreditar_asistencia();

-- ---------------------------------------------------------------------
-- 9. ENTREGA DE RESULTADOS — al validar (status pasa a VALIDADO),
--    acredita RESULTS_DELIVERED = multiplicador × valor de asistencia
--    del mismo evento, con techo.
-- ---------------------------------------------------------------------
create or replace function fn_acreditar_resultado()
returns trigger language plpgsql security definer as $$
declare
  v_version_id uuid;
  v_rule_att record;
  v_rule_res record;
  v_mult record;
  v_evento record;
  v_base int;
  v_amount int;
begin
  if new.status is distinct from 'VALIDADO' or old.status = 'VALIDADO' then return new; end if;

  v_version_id := fn_version_vigente_id();
  if v_version_id is null then return new; end if;

  select rule_id into v_rule_att from scoring_rules where version_id = v_version_id and rule_code = 'ATTENDANCE_VALIDATED';
  select rule_id into v_rule_res from scoring_rules where version_id = v_version_id and rule_code = 'RESULTS_DELIVERED';
  if v_rule_att.rule_id is null or v_rule_res.rule_id is null then return new; end if;

  select tipo_actividad, nivel_organizador into v_evento from eventos where id = new.evento_id;
  if v_evento.tipo_actividad is null then return new; end if;

  select amount into v_base from rule_value_matrix
  where rule_id = v_rule_att.rule_id and tipo_actividad = v_evento.tipo_actividad and nivel_organizador = v_evento.nivel_organizador;
  if v_base is null then return new; end if;

  select multiplicador, techo into v_mult from rule_multiplier_value where rule_id = v_rule_res.rule_id;
  if v_mult.multiplicador is null then return new; end if;

  v_amount := round(v_base * v_mult.multiplicador);
  if v_mult.techo is not null and v_amount > v_mult.techo then v_amount := v_mult.techo; end if;

  perform fn_acreditar(new.usuario_id, v_rule_res.rule_id, v_version_id, 'result_delivery', new.delivery_id,
    new.usuario_id || '|RESULTS|' || new.evento_id || '|' || v_version_id, v_amount, new.evidence_ref);

  return new;
end;
$$;

drop trigger if exists trg_acreditar_resultado on result_deliveries;
create trigger trg_acreditar_resultado
  after update on result_deliveries
  for each row execute function fn_acreditar_resultado();

-- Inicializa member_score_balances en 0 para todo usuario que ya exista
-- (idempotente: on conflict do nothing).
insert into member_score_balances (usuario_id, balance)
select id, 0 from usuarios
on conflict (usuario_id) do nothing;

-- =====================================================================
-- ADICIONES — Migración 0015: inscripción pública a eventos (link + QR)
-- =====================================================================
-- Un evento puede activar "inscripción pública": se le genera un
-- codigo_publico único que arma un link (inscripcion.html?e=<codigo>) y
-- su QR. Cualquiera con cuenta en el sistema (incluida una recién creada,
-- todavía "pendiente" de aprobación) puede abrir ese link, iniciar sesión
-- o crear su cuenta, y confirmar su asistencia — eso NO acredita puntos
-- por sí solo: el organizador decide cuándo "cargar" los inscritos
-- confirmados a la lista de Asistencia ya existente (attendance_entries),
-- que es la que de verdad dispara fn_acreditar_asistencia al validarse.
alter table eventos add column if not exists inscripcion_publica boolean not null default false;
alter table eventos add column if not exists codigo_publico text unique;
alter table eventos add column if not exists flyer_id uuid references flyers(id) on delete set null;

comment on column eventos.inscripcion_publica is 'true = tiene link/QR público de inscripción activo (ver assets/js/views/eventos.js).';
comment on column eventos.codigo_publico is 'Código corto único para el link público (inscripcion.html?e=<codigo>). Se genera al activar inscripcion_publica; se conserva al desactivar, por si se reactiva (mismo link/QR).';
comment on column eventos.flyer_id is 'Flyer (ya publicado en el módulo Flyers) que se muestra en la página pública de inscripción de este evento. Opcional.';

create table if not exists event_inscripciones (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references eventos(id) on delete cascade,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  estado       text not null default 'confirmado' check (estado in ('confirmado','cancelado')),
  created_at   timestamptz not null default now(),
  unique (evento_id, usuario_id)
);
create index if not exists idx_event_inscripciones_evento on event_inscripciones(evento_id);
create index if not exists idx_event_inscripciones_usuario on event_inscripciones(usuario_id);

comment on table event_inscripciones is 'Autoservicio: alguien confirma su asistencia desde el link/QR público de un evento. Tabla separada de attendance_entries a propósito (esa sigue siendo solo del organizador) — no acredita puntos por sí sola.';
