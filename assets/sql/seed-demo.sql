-- =====================================================================
-- SEED-DEMO.SQL — Datos iniciales reales de la organización.
-- ---------------------------------------------------------------------
-- Corre DESPUÉS de schema.sql y rls-policies.sql (usa el rol de servicio
-- de Supabase / SQL editor, que ignora RLS al ejecutar el script).
--
-- 1) Crea las 5 comisiones (sin líder asignado todavía: eso se hace
--    desde el módulo de Configuración una vez que Dirección tenga los
--    usuario_id reales de cada líder, después de que se registren).
-- 2) Genera los 27 comandos regionales de Organización con un LOOP,
--    no con 27 INSERT manuales — así lo pedía la spec explícitamente.
-- 3) Deja comentado un ejemplo de cómo asignar coordinador/miembros una
--    vez que existan usuarios reales (requiere que se hayan registrado
--    primero vía register.html, porque usuarios.id referencia auth.users).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COMISIONES
-- ---------------------------------------------------------------------
insert into comisiones (slug, nombre, color, mision, orden) values
  ('comunidad',      'Comunidad',      '#2FA0A0', 'Terminar de contactar a las personas que escribieron para sumarse y fortalecer la comunidad.', 1),
  ('organizacion',   'Organización',   '#4C5FD5', 'Generar la estructura inicial territorial y política: un chat y comando operativo por región, cada uno con un coordinador temporal hasta su ratificación.', 2),
  ('eventos',        'Eventos',        '#E0563A', 'Gestionar y organizar la reunión general del 6 de agosto.', 3),
  ('formacion',      'Formación',      '#7A5FC7', 'Identificar perfiles y expertos para las primeras clases virtuales de formación.', 4),
  ('comunicaciones', 'Comunicaciones', '#D9A426', 'Trabajar en redes sociales y mantener presencia activa en el espacio público, en coordinación con las demás comisiones.', 5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2. COMANDOS — 1 por comisión "simple" (Comunidad/Eventos/Formación/
--    Comunicaciones arrancan con 1 comando semilla) + los 27 regionales
--    de Organización generados por loop.
-- ---------------------------------------------------------------------
insert into comandos (comision_id, slug, nombre)
select id, 'contacto-bienvenida', 'Contacto y Bienvenida' from comisiones where slug = 'comunidad'
on conflict (comision_id, slug) do nothing;

insert into comandos (comision_id, slug, nombre)
select id, 'reunion-6-agosto', 'Reunión 6 de Agosto' from comisiones where slug = 'eventos'
on conflict (comision_id, slug) do nothing;

insert into comandos (comision_id, slug, nombre)
select id, 'capacitacion-virtual', 'Capacitación Virtual' from comisiones where slug = 'formacion'
on conflict (comision_id, slug) do nothing;

insert into comandos (comision_id, slug, nombre)
select id, 'contenido-redes', 'Contenido y Redes' from comisiones where slug = 'comunicaciones'
on conflict (comision_id, slug) do nothing;

-- 27 comandos regionales de Organización — un INSERT por región vía loop,
-- no 27 formularios/INSERTs manuales (regla explícita de la spec secc. 0).
-- unaccent() (quita tildes para armar el slug) viene en la extensión
-- "unaccent", incluida en Supabase pero no habilitada por defecto.
create extension if not exists unaccent;

do $$
declare
  v_comision_id uuid;
  v_region text;
  v_regiones text[] := array[
    'Amazonas','Áncash','Apurímac','Arequipa','Ayacucho','Cajamarca','Callao','Cusco',
    'Huancavelica','Huánuco','Ica','Junín','La Libertad','Lambayeque','Lima Metropolitana',
    'Lima Provincias','Loreto','Madre de Dios','Moquegua','Pasco','PEX','Piura','Puno',
    'San Martín','Tacna','Tumbes','Ucayali'
  ];
begin
  select id into v_comision_id from comisiones where slug = 'organizacion';

  foreach v_region in array v_regiones loop
    insert into comandos (comision_id, slug, nombre, region)
    values (
      v_comision_id,
      'org-' || lower(regexp_replace(unaccent(v_region), '[^a-zA-Z0-9]+', '-', 'g')),
      'Chat Regional — ' || v_region,
      v_region
    )
    on conflict (comision_id, slug) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. EJEMPLO (comentado) — cómo asignar coordinador/miembros reales.
--    Descomentar y reemplazar el email cuando esas personas ya se hayan
--    registrado en el sistema (register.html) al menos una vez.
-- ---------------------------------------------------------------------
-- insert into membresias (usuario_id, comando_id, rol)
-- select u.id, c.id, 'coordinador'
-- from usuarios u, comandos c
-- where u.email = 'coordinador.lima-metropolitana@example.com'
--   and c.slug = 'org-lima-metropolitana'
-- on conflict (usuario_id, comando_id) do update set rol = excluded.rol;
--
-- -- Asignar Líder de una comisión (requiere que la persona ya tenga cuenta):
-- update comisiones set lider_id = (select id from usuarios where email = 'natalia@example.com')
-- where slug = 'comunidad';
--
-- -- Marcar a alguien como Dirección General:
-- update usuarios set es_direccion = true, estado = 'activo' where email = 'direccion@example.com';
