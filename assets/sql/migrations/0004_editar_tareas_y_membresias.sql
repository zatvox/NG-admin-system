-- =====================================================================
-- 0004_EDITAR_TAREAS_Y_MEMBRESIAS.SQL
-- ---------------------------------------------------------------------
-- Autocontenido. Habilita:
--   1) membresias_update — cambiar el rol de una membresía existente
--      (asignar Coordinador/Secretario). Antes no existía política de
--      UPDATE en esta tabla y la única forma era SQL manual.
--   2) tareas_update — se corrige para usar tarea_asignados (multi-
--      asignado) en vez de la columna deprecada asignado_id.
--   3) tareas_delete — antes no existía ninguna política de DELETE,
--      así que una tarea jamás se podía borrar desde la app.
-- Ya reflejado también en rls-policies.sql (fuente de verdad).
-- =====================================================================

drop policy if exists membresias_update on membresias;
create policy membresias_update on membresias for update using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
) with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
);

drop policy if exists tareas_update on tareas;
create policy tareas_update on tareas for update using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or exists (select 1 from tarea_asignados ta where ta.tarea_id = tareas.id and ta.usuario_id = auth.uid())
) with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or exists (select 1 from tarea_asignados ta where ta.tarea_id = tareas.id and ta.usuario_id = auth.uid())
);

drop policy if exists tareas_delete on tareas;
create policy tareas_delete on tareas for delete using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
);
