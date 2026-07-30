-- =====================================================================
-- Migración 0007 — Columna DNI + precarga de teléfono/DNI por invitación
-- =====================================================================
-- Contexto: para la invitación masiva de simpatizantes (base de ~4,000
-- filas con DNI, celular, región/distrito, etc.) queremos que la cuenta
-- ya llegue con DNI y teléfono, en vez de que la persona los tenga que
-- escribir de nuevo en "Mi perfil".
--
-- Qué agrega:
--   1. Columna usuarios.dni (texto, opcional).
--   2. El trigger fn_nuevo_usuario_auth ahora también copia teléfono y
--      DNI desde los metadatos de la cuenta (raw_user_meta_data) si
--      vienen — esto pasa automáticamente cuando el script de invitación
--      masiva llama a inviteUserByEmail(correo, { data: { nombre,
--      telefono, dni } }). Antes SOLO copiaba el nombre.
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente.
-- =====================================================================

alter table usuarios add column if not exists dni text;

create or replace function fn_nuevo_usuario_auth()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  begin
    insert into public.usuarios (id, email, nombre, telefono, dni, estado)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
      new.raw_user_meta_data->>'telefono',
      new.raw_user_meta_data->>'dni',
      'pendiente_activacion'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'fn_nuevo_usuario_auth() falló para % (no se detuvo el registro): %', new.email, sqlerrm;
  end;
  return new;
end;
$$;
