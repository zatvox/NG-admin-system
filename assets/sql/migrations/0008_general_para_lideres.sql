-- =====================================================================
-- Migración 0008 — Un Líder también puede publicar "General"
-- =====================================================================
-- Contexto: hasta ahora "General (toda la organización)" en Comunicados,
-- Eventos y Enlaces era exclusivo de Dirección — un Líder de comisión solo
-- podía publicar dentro de SU comisión, nunca para toda la organización.
-- Se decidió abrir esto: cualquier Líder puede elegir "General" también,
-- con el mismo peso que un comunicado/evento/enlace de Dirección.
--
-- Nota aparte (ya revisada, sin cambios en esta migración): esto NO
-- afecta la lectura — comunicados_select/eventos_select/enlaces_select ya
-- eran (y se quedan) abiertos a cualquier autenticado. "Mi comisión" sigue
-- siendo una etiqueta organizativa, no un candado real — se mantiene así
-- a propósito, coherente con la transparencia lateral del resto del
-- sistema (comandos de otras comisiones también son visibles para todos).
--
-- Qué cambia:
--   - comunicados_insert/update/delete: agregan la rama
--     "(comision_id is null and fn_es_lider_de_alguna(auth.uid()))".
--   - eventos_insert/update/delete: misma rama nueva.
--   - enlaces_insert/update/delete: misma rama nueva (un Coordinador
--     sigue sin poder publicar "general", solo Dirección o un Líder).
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente.
-- =====================================================================

drop policy if exists comunicados_insert on comunicados;
create policy comunicados_insert on comunicados for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (alcance = 'general' and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists comunicados_update on comunicados;
create policy comunicados_update on comunicados for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists comunicados_delete on comunicados;
create policy comunicados_delete on comunicados for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists eventos_insert on eventos;
create policy eventos_insert on eventos for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists eventos_update on eventos;
create policy eventos_update on eventos for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists eventos_delete on eventos;
create policy eventos_delete on eventos for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists enlaces_insert on enlaces;
create policy enlaces_insert on enlaces for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists enlaces_update on enlaces;
create policy enlaces_update on enlaces for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

drop policy if exists enlaces_delete on enlaces;
create policy enlaces_delete on enlaces for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);
