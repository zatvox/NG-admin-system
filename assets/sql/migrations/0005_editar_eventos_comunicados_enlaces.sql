-- =====================================================================
-- 0005_EDITAR_EVENTOS_COMUNICADOS_ENLACES.SQL
-- ---------------------------------------------------------------------
-- Autocontenido. Antes estas 3 tablas solo tenían política de INSERT y
-- SELECT — nunca se podía corregir ni borrar un evento/comunicado/enlace
-- publicado por error. Se agregan UPDATE/DELETE con el MISMO alcance que
-- ya tenía el INSERT de cada una. Ya reflejado también en rls-policies.sql.
-- =====================================================================

drop policy if exists eventos_update on eventos;
create policy eventos_update on eventos for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
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
);

drop policy if exists comunicados_update on comunicados;
create policy comunicados_update on comunicados for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
);

drop policy if exists comunicados_delete on comunicados;
create policy comunicados_delete on comunicados for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
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
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
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
);
