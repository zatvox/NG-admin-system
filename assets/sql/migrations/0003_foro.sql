-- =====================================================================
-- 0003_FORO.SQL — Módulo "Foro de Ideas"
-- ---------------------------------------------------------------------
-- Autocontenido: crea el enum, las 3 tablas nuevas, sus índices, activa
-- RLS y agrega sus políticas. Se puede correr solo, en cualquier momento
-- después de 0001/0002 — no toca ninguna tabla existente.
-- Ya está reflejado también en schema.sql y rls-policies.sql (la fuente
-- de verdad del proyecto), por si en algún momento se reinstala todo
-- desde cero.
-- =====================================================================

do $$ begin
  create type estado_tema_foro as enum ('abierto','en_debate','con_conclusion','cerrado');
exception when duplicate_object then null; end $$;

create table if not exists foro_temas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  problema     text not null,
  autor_id     uuid references usuarios(id) on delete set null,
  comision_id  uuid references comisiones(id) on delete set null,
  estado       estado_tema_foro not null default 'abierto',
  conclusion   text,
  ruta_accion  text,
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
  es_propuesta  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_foro_comentarios_tema on foro_comentarios(tema_id);

create table if not exists foro_votos (
  comentario_id  uuid not null references foro_comentarios(id) on delete cascade,
  usuario_id     uuid not null references usuarios(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (comentario_id, usuario_id)
);

create or replace function fn_es_lider_de_alguna(p_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from comisiones where lider_id = p_uid);
$$;

alter table foro_temas       enable row level security;
alter table foro_comentarios enable row level security;
alter table foro_votos       enable row level security;

drop policy if exists foro_temas_select       on foro_temas;
drop policy if exists foro_temas_insert       on foro_temas;
drop policy if exists foro_temas_update       on foro_temas;
drop policy if exists foro_temas_delete       on foro_temas;
drop policy if exists foro_comentarios_select on foro_comentarios;
drop policy if exists foro_comentarios_insert on foro_comentarios;
drop policy if exists foro_comentarios_delete on foro_comentarios;
drop policy if exists foro_votos_select       on foro_votos;
drop policy if exists foro_votos_insert       on foro_votos;
drop policy if exists foro_votos_delete       on foro_votos;

create policy foro_temas_select on foro_temas for select using (auth.uid() is not null);

create policy foro_temas_insert on foro_temas for insert with check (
  auth.uid() is not null and autor_id = auth.uid()
);

create policy foro_temas_update on foro_temas for update using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
) with check (
  autor_id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
);

create policy foro_temas_delete on foro_temas for delete using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);

create policy foro_comentarios_select on foro_comentarios for select using (auth.uid() is not null);

create policy foro_comentarios_insert on foro_comentarios for insert with check (
  auth.uid() is not null and autor_id = auth.uid()
);

create policy foro_comentarios_delete on foro_comentarios for delete using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);

create policy foro_votos_select on foro_votos for select using (auth.uid() is not null);

create policy foro_votos_insert on foro_votos for insert with check (usuario_id = auth.uid());

create policy foro_votos_delete on foro_votos for delete using (usuario_id = auth.uid());
