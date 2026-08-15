-- =====================================================================
-- Migración 0010 — Etapa 4: tabla + bucket de Flyers (landing pública)
-- =====================================================================
-- Contexto: index.html deja de ser un simple redirect y se convierte en
-- el panel público (estilo portal universitario) que ve cualquiera con
-- cuenta que todavía no fue aprobada por un Líder — flyers + fundadores
-- (tabla configuracion) + eventos/comunicados alcance='general'.
--
-- Qué agrega:
--   1. Tabla "flyers" (autosuficiente: se crea acá aunque no hayas
--      corrido schema.sql de nuevo).
--   2. RLS: ver = cualquier autenticado si está activo=true (Dirección ve
--      también los inactivos); publicar/editar/borrar = solo Dirección.
--   3. Bucket de Storage "flyers" (público) + políticas para que solo
--      Dirección pueda subir/editar/borrar archivos ahí.
--
-- CÓMO SUBES UNA IMAGEN (por ahora, hasta que haya un botón "Subir" en la
-- app): Supabase → Storage → bucket "flyers" → Upload file → clic derecho
-- en el archivo subido → "Get URL" → pega esa URL al crear el flyer desde
-- Configuración.
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente.
-- =====================================================================

create table if not exists flyers (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descripcion  text,
  imagen_url   text not null,
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_by   uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_flyers_orden on flyers(orden);

alter table flyers enable row level security;

drop policy if exists flyers_select on flyers;
create policy flyers_select on flyers for select using (
  auth.uid() is not null and (activo or fn_es_direccion(auth.uid()))
);

drop policy if exists flyers_insert on flyers;
create policy flyers_insert on flyers for insert with check (fn_es_direccion(auth.uid()));

drop policy if exists flyers_update on flyers;
create policy flyers_update on flyers for update using (fn_es_direccion(auth.uid())) with check (fn_es_direccion(auth.uid()));

drop policy if exists flyers_delete on flyers;
create policy flyers_delete on flyers for delete using (fn_es_direccion(auth.uid()));

-- ---------------------------------------------------------------------
-- Bucket de Storage para las imágenes de los flyers.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('flyers', 'flyers', true)
on conflict (id) do nothing;

drop policy if exists "flyers_bucket_select" on storage.objects;
create policy "flyers_bucket_select" on storage.objects for select using (
  bucket_id = 'flyers'
);

drop policy if exists "flyers_bucket_insert" on storage.objects;
create policy "flyers_bucket_insert" on storage.objects for insert with check (
  bucket_id = 'flyers' and fn_es_direccion(auth.uid())
);

drop policy if exists "flyers_bucket_update" on storage.objects;
create policy "flyers_bucket_update" on storage.objects for update using (
  bucket_id = 'flyers' and fn_es_direccion(auth.uid())
);

drop policy if exists "flyers_bucket_delete" on storage.objects;
create policy "flyers_bucket_delete" on storage.objects for delete using (
  bucket_id = 'flyers' and fn_es_direccion(auth.uid())
);
