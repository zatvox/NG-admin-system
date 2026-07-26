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
  create type estado_usuario as enum ('activo','pendiente_activacion','suspendido');
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
  avatar_url     text,
  es_direccion   boolean not null default false, -- rol global "Dirección General"
  estado         estado_usuario not null default 'pendiente_activacion',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table usuarios is 'Perfil de cada persona autenticada. es_direccion=true = Dirección General (acceso total).';
comment on column usuarios.estado is 'pendiente_activacion = se registró pero nadie lo asignó a un comando todavía (=Colaborador en la spec).';

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
    insert into public.usuarios (id, email, nombre, estado)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
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
