-- =====================================================================
-- Migración 0006 — Etapa D: Editar/eliminar temas y comentarios del Foro
-- =====================================================================
-- Qué agrega:
--   1. La política foro_comentarios_update, que no existía: antes un
--      comentario del Foro se podía crear y borrar, pero nunca corregir.
--      Ahora el autor del comentario (o Dirección, para moderar) puede
--      editarlo — mismo criterio que la política de delete existente.
--   2. Nada más: foro_temas_update ya existía (permite editar título y
--      problema; se reusa para el nuevo botón "Editar tema" en el front),
--      y foro_temas_delete/foro_comentarios_delete ya existían también.
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente: puedes
-- volver a correrlo sin romper nada.
-- =====================================================================

drop policy if exists foro_comentarios_update on foro_comentarios;

-- Autor propio o Dirección (para moderar) — mismo criterio que el delete.
create policy foro_comentarios_update on foro_comentarios for update using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
) with check (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);
