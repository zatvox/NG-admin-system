-- =====================================================================
-- Migración 0015 — Inscripción pública a eventos (link + QR)
-- =====================================================================
-- Un evento puede activar "inscripción pública": se le genera un
-- codigo_publico único que arma un link (inscripcion.html?e=<codigo>) y
-- su QR. Cualquiera con cuenta en el sistema (incluida una recién creada,
-- todavía "pendiente" de aprobación) puede abrir ese link, iniciar sesión
-- o crear su cuenta, y confirmar su asistencia — eso NO acredita puntos
-- por sí solo: el organizador decide cuándo "cargar" los inscritos
-- confirmados a la lista de Asistencia ya existente (attendance_entries),
-- que es la que de verdad dispara fn_acreditar_asistencia al validarse.
-- Este archivo es AUTOCONTENIDO: DDL + RLS juntos, para correrlo de una
-- sola vez en el SQL Editor de Supabase (mismo criterio que fix_0007 y
-- 0014: bloques aislados, no re-correr archivos completos).
-- =====================================================================

-- 1. EVENTOS — 3 columnas nuevas.
alter table eventos add column if not exists inscripcion_publica boolean not null default false;
alter table eventos add column if not exists codigo_publico text unique;
alter table eventos add column if not exists flyer_id uuid references flyers(id) on delete set null;

comment on column eventos.inscripcion_publica is 'true = tiene link/QR público de inscripción activo (ver assets/js/views/eventos.js).';
comment on column eventos.codigo_publico is 'Código corto único para el link público (inscripcion.html?e=<codigo>). Se genera al activar inscripcion_publica; se conserva al desactivar, por si se reactiva (mismo link/QR).';
comment on column eventos.flyer_id is 'Flyer (ya publicado en el módulo Flyers) que se muestra en la página pública de inscripción de este evento. Opcional — reutiliza flyers existentes en vez de subir una imagen aparte.';

-- 2. EVENT_INSCRIPCIONES — quién confirmó asistencia desde el link público.
--    Tabla separada de attendance_entries a propósito: esta es
--    autoservicio (cualquiera inserta SU PROPIA fila), attendance_entries
--    sigue siendo de uso exclusivo del organizador. El organizador "carga"
--    los confirmados a attendance_entries con un botón desde el módulo
--    Eventos — un paso explícito, no automático.
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

comment on table event_inscripciones is 'Autoservicio: alguien confirma su asistencia desde el link/QR público de un evento. No acredita puntos por sí sola.';

alter table event_inscripciones enable row level security;

-- 3. RLS

-- 3.1. eventos_select se reemplaza para agregar la rama pública (mismo
--      criterio que "alcance=general": visible aunque la cuenta esté
--      "pendiente" — el objetivo es también captar gente nueva). No
--      expone nada de otros eventos: sigue exigiendo sesión.
drop policy if exists eventos_select on eventos;
create policy eventos_select on eventos for select using (
  auth.uid() is not null and (
    alcance = 'general' or fn_esta_activo(auth.uid())
    or (inscripcion_publica and codigo_publico is not null and not cancelado)
  )
);

-- 3.2. event_inscripciones: cualquier autenticado inserta SU PROPIA fila
--      (sin exigir fn_esta_activo — a propósito, ver arriba); ver todas
--      las de un evento es del organizador o Dirección; cada quien solo
--      puede actualizar (cancelar) su propia fila.
drop policy if exists event_inscripciones_select on event_inscripciones;
drop policy if exists event_inscripciones_insert on event_inscripciones;
drop policy if exists event_inscripciones_update on event_inscripciones;
drop policy if exists event_inscripciones_delete on event_inscripciones;

create policy event_inscripciones_select on event_inscripciones for select using (
  usuario_id = auth.uid()
  or fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = event_inscripciones.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);

create policy event_inscripciones_insert on event_inscripciones for insert with check (
  usuario_id = auth.uid()
  and exists (
    select 1 from eventos ev where ev.id = event_inscripciones.evento_id
      and ev.inscripcion_publica and not ev.cancelado
  )
);

create policy event_inscripciones_update on event_inscripciones for update using (
  usuario_id = auth.uid()
) with check (
  usuario_id = auth.uid()
);

create policy event_inscripciones_delete on event_inscripciones for delete using (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = event_inscripciones.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);
