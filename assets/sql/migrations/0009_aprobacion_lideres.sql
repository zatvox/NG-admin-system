-- =====================================================================
-- Migración 0009 — Etapa 1: RLS real de aprobación/suspensión
-- =====================================================================
-- Contexto: en pruebas, gente ajena al partido se creó una cuenta,
-- validó su correo y automáticamente pudo ver comisiones, autoenlistarse
-- en un comando y ver tareas — sin que nadie la aprobara. La columna
-- "usuarios.estado" ya existía (activo/pendiente_activacion/suspendido)
-- pero era 100% cosmética: ningún RLS la revisaba, ni siquiera
-- "suspendido" bloqueaba nada.
--
-- Qué agrega:
--   1. fn_esta_activo(uid): Dirección siempre pasa; el resto necesita
--      estado='activo'.
--   2. SELECT de comisiones/comandos/membresias/tareas/foro_temas/
--      foro_comentarios/foro_votos/enlaces ahora exige fn_esta_activo.
--   3. SELECT de eventos/comunicados: alcance='general' sigue visible
--      para cualquier autenticado (son las "noticias" de la landing
--      pública); el resto exige fn_esta_activo.
--   4. usuarios_select reescrito: antes cualquiera leía la tabla
--      COMPLETA (nombre/correo/teléfono/DNI de todos); ahora solo tu
--      propia fila, Dirección, cualquier Líder, o gente con quien
--      compartes comando.
--   5. usuarios_update_propio: un Líder ahora también puede cambiar el
--      "estado" de cualquier usuario (aprobar/suspender) — antes solo
--      Dirección. Refuerzo aparte: trigger que impide que alguien que no
--      sea Dirección cambie la columna es_direccion, aunque la política
--      de fila lo dejara pasar.
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente.
--
-- (2026-08-15) Este archivo es AUTOSUFICIENTE: si tu base de datos dio
-- "function fn_es_direccion(uuid) does not exist" al correr esto, es
-- porque las funciones helper base de rls-policies.sql no estaban creadas
-- todavía en ese proyecto de Supabase. Por eso las 3 de abajo (idénticas
-- a las de rls-policies.sql) se recrean acá también — no hace daño si ya
-- existían, "create or replace" las deja igual.
-- =====================================================================

create or replace function fn_es_direccion(p_uid uuid)
returns boolean language sql stable security definer as $$
  select coalesce((select es_direccion from usuarios where id = p_uid), false);
$$;

create or replace function fn_es_lider_de_alguna(p_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from comisiones where lider_id = p_uid);
$$;

create or replace function fn_comparten_comando(p_uid uuid, p_otro_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from membresias m1
    join membresias m2 on m2.comando_id = m1.comando_id
    where m1.usuario_id = p_uid and m2.usuario_id = p_otro_uid
  );
$$;

create or replace function fn_esta_activo(p_uid uuid)
returns boolean language sql stable security definer as $$
  select fn_es_direccion(p_uid) or coalesce(
    (select estado = 'activo' from usuarios where id = p_uid), false
  );
$$;

drop policy if exists comisiones_select on comisiones;
create policy comisiones_select on comisiones for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists comandos_select on comandos;
create policy comandos_select on comandos for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists membresias_select on membresias;
create policy membresias_select on membresias for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists tareas_select on tareas;
create policy tareas_select on tareas for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists enlaces_select on enlaces;
create policy enlaces_select on enlaces for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists eventos_select on eventos;
create policy eventos_select on eventos for select using (
  auth.uid() is not null and (alcance = 'general' or fn_esta_activo(auth.uid()))
);

drop policy if exists comunicados_select on comunicados;
create policy comunicados_select on comunicados for select using (
  auth.uid() is not null and (alcance = 'general' or fn_esta_activo(auth.uid()))
);

drop policy if exists foro_temas_select on foro_temas;
create policy foro_temas_select on foro_temas for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists foro_comentarios_select on foro_comentarios;
create policy foro_comentarios_select on foro_comentarios for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists foro_votos_select on foro_votos;
create policy foro_votos_select on foro_votos for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select using (
  id = auth.uid()
  or fn_es_direccion(auth.uid())
  or fn_es_lider_de_alguna(auth.uid())
  or fn_comparten_comando(auth.uid(), id)
);

drop policy if exists usuarios_update_propio on usuarios;
create policy usuarios_update_propio on usuarios for update using (
  id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
) with check (
  id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
);

create or replace function fn_proteger_es_direccion()
returns trigger language plpgsql security definer as $$
begin
  if new.es_direccion is distinct from old.es_direccion and not fn_es_direccion(auth.uid()) then
    new.es_direccion := old.es_direccion;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_es_direccion on usuarios;
create trigger trg_proteger_es_direccion
  before update on usuarios
  for each row execute function fn_proteger_es_direccion();

-- ---------------------------------------------------------------------
-- IMPORTANTE — corre esto SÍ o SÍ junto con lo de arriba: sin esto, TODO
-- el que ya tenga estado 'pendiente_activacion' (o sea, todos los que se
-- registraron antes de hoy, incluidos tus líderes/coordinadores/miembros
-- de prueba reales) quedan bloqueados de golpe en el próximo login, salvo
-- tu cuenta (es_direccion siempre pasa fn_esta_activo). Esto activa a
-- cualquiera que NO esté ya marcado como "suspendido". Si quieres revisar
-- la lista antes de activar a todos en bloque, comenta esta línea y hazlo
-- uno por uno desde el nuevo Directorio (Etapa 5) — mientras tanto todos
-- quedarían sin acceso a la estructura interna hasta que los apruebes.
-- ---------------------------------------------------------------------
update usuarios set estado = 'activo' where estado <> 'suspendido';
