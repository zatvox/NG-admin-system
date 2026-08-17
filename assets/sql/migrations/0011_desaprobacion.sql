-- =====================================================================
-- Migración 0011 — Etapa 6: estado "desaprobado" en Directorio
-- =====================================================================
-- Contexto: en el Directorio (Etapa 5), un Líder solo podía "Aprobar" a
-- alguien pendiente. Si la solicitud no correspondía (persona ajena al
-- partido, cuenta duplicada, etc.), no había forma de rechazarla — se
-- quedaba en "Pendientes de aprobación" para siempre o había que dejarla
-- en ese estado indefinidamente.
--
-- Qué agrega:
--   1. Nuevo valor 'desaprobado' al enum estado_usuario.
--   2. Columnas usuarios.motivo_rechazo (opcional), rechazado_por
--      (quién la desaprobó) y rechazado_en (cuándo).
--
-- No hace falta tocar RLS: usuarios_update_propio (migración 0009) ya
-- deja que cualquier Líder actualice el "estado" (y ahora, estas 3
-- columnas nuevas) de cualquier usuario — la política es por fila, no
-- por columna. Una persona "desaprobada" recibe exactamente el mismo
-- trato que "pendiente_activacion" en RLS/login: solo ve la landing
-- pública (index.html). El Directorio es quien decide en qué tab
-- (Pendientes vs. Desaprobados) mostrarla, filtrando en el cliente.
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente.
--
-- (2026-08-16) Nota sobre "ALTER TYPE ... ADD VALUE": si tu cliente SQL
-- envuelve todo el script en una sola transacción y te da el error
-- "ALTER TYPE ... cannot run inside a transaction block", corre SOLO el
-- primer bloque (el ALTER TYPE) en una ejecución aparte, y el resto del
-- archivo después. En el SQL Editor de Supabase normalmente no hace
-- falta este paso extra — corre el archivo completo tal cual primero.
-- =====================================================================

alter type estado_usuario add value if not exists 'desaprobado';

alter table usuarios add column if not exists motivo_rechazo text;
alter table usuarios add column if not exists rechazado_por uuid references usuarios(id) on delete set null;
alter table usuarios add column if not exists rechazado_en timestamptz;

comment on column usuarios.estado is 'pendiente_activacion = recién se registró; activo = aprobado por un Líder; suspendido = miembro activo al que se le quitó el acceso; desaprobado = solicitud de ingreso rechazada (ver motivo_rechazo/rechazado_por).';
comment on column usuarios.motivo_rechazo is 'Opcional. Se llena al desaprobar desde el Directorio.';
comment on column usuarios.rechazado_por is 'usuarios.id del Líder/Dirección que desaprobó la solicitud.';
