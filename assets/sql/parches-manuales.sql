-- =====================================================================
-- PARCHES-MANUALES.SQL — Fragmentos SQL puntuales para pegar en el SQL
-- Editor de Supabase, uno a la vez, cuando Claude te lo pida en el chat.
-- ---------------------------------------------------------------------
-- Cómo usar este archivo:
--   1. Cada vez que te doy un fragmento corto en el chat, lo agrego aquí
--      como una entrada nueva (fecha + motivo + el código).
--   2. Tú abres este archivo, copias SOLO el bloque que te indique en el
--      chat (o el más reciente si no te digo cuál), y lo pegas en el SQL
--      Editor de Supabase.
--   3. Los fragmentos largos o que arman un módulo completo van en su
--      propio archivo nuevo dentro de assets/sql/ (ej. rls-policies.sql,
--      schema.sql) y aquí solo dejo una línea de referencia a ese archivo.
-- =====================================================================


-- =====================================================================
-- 2026-07-25 — Fix: "policy already exists" al re-correr rls-policies.sql
-- ---------------------------------------------------------------------
-- Motivo: rls-policies.sql no tenía "drop policy" antes de cada "create
-- policy", así que la segunda vez que lo corrías fallaba en la primera
-- política que ya existiera. Ya lo arreglé en el archivo (ahora trae sus
-- propios "drop policy if exists" al inicio), así que ESTE PARCHE YA NO
-- ES NECESARIO si vuelves a copiar el rls-policies.sql actualizado
-- completo. Lo dejo aquí solo como referencia de qué se corrigió.
-- =====================================================================
-- (sin código pendiente — ver assets/sql/rls-policies.sql actualizado)


-- =====================================================================
-- 2026-07-25 — Diagnóstico: correo de verificación no llega al registrarse
-- ---------------------------------------------------------------------
-- Motivo: no puedo ver el panel de Supabase directamente, así que esta
-- consulta (de solo lectura, no cambia nada) muestra el estado real de
-- tu cuenta en el proyecto de Supabase que tengas conectado AHORA MISMO
-- en config.js. Cópiala en el SQL Editor, corre, y pégame el resultado
-- (formato JSON o tabla, cualquiera sirve) para saber exactamente qué
-- está pasando: si el correo nunca se registró, si ya está confirmado
-- (en ese caso no llega correo nuevo porque no hace falta), o si quedó
-- a medias.
-- =====================================================================
select id, email, email_confirmed_at, confirmation_sent_at, created_at, last_sign_in_at
from auth.users
where email = 'luis.paz.vilca@gmail.com';


-- =====================================================================
-- 2026-07-25 — Fix: "Perfil no encontrado" al iniciar sesión con Luis
-- ---------------------------------------------------------------------
-- Motivo: el login en sí funciona (Supabase Auth confirma la cuenta, la
-- consulta a "usuarios" responde 200, sin error de RLS). El problema es
-- que NO EXISTE una fila en la tabla "usuarios" para este usuario. Eso
-- pasa porque esta cuenta se creó el 17 jul, probablemente antes de que
-- existiera el trigger fn_nuevo_usuario_auth() (o se creó a mano desde
-- el panel de Supabase, que no siempre dispara triggers de auth.users
-- igual que un registro real). Cuentas NUEVAS que se registren desde
-- register.html de ahora en adelante no van a tener este problema — el
-- trigger ya las crea automático.
--
-- Este parche crea manualmente la fila que falta, tomando el correo
-- desde auth.users, y te deja como Dirección General (acceso total)
-- para que puedas probar el sistema completo. Solo hace falta correrlo
-- UNA VEZ para esta cuenta.
-- =====================================================================
insert into usuarios (id, email, nombre, es_direccion, estado)
select id, email, coalesce(raw_user_meta_data->>'nombre', 'Luis Paz Vilca'), true, 'activo'
from auth.users
where email = 'luis.paz.vilca@gmail.com'
on conflict (id) do nothing;

-- Verifica que quedó creada:
select id, email, nombre, es_direccion, estado from usuarios where email = 'luis.paz.vilca@gmail.com';


-- =====================================================================
-- 2026-07-25 — Feature: auto-enlistamiento (botón "Enlistarse" / "Unirme
-- a este comando")
-- ---------------------------------------------------------------------
-- Motivo: hasta ahora solo Dirección, Líder o Coordinador podían agregar
-- gente a un comando (tabla membresias). Se agrega una condición extra
-- para que cualquier persona autenticada pueda insertarse A SÍ MISMA
-- como Miembro (rol='miembro') de cualquier comando — es justo lo que
-- hace el botón nuevo "Unirme a este comando" en Comisiones. Ya está
-- reflejado también en assets/sql/rls-policies.sql completo; este
-- parche es solo para aplicarlo rápido sin re-pegar el archivo entero.
-- =====================================================================
drop policy if exists membresias_insert on membresias;
create policy membresias_insert on membresias for insert with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or (usuario_id = auth.uid() and rol = 'miembro')
);


-- =====================================================================
-- 2026-07-25 — Usuario de prueba: karlo.paz.vilca@gmail.com como Miembro
-- ---------------------------------------------------------------------
-- Motivo: ya no hace falta crear un usuario de prueba a mano — con el
-- botón "Unirme a este comando" cualquier cuenta ya registrada puede
-- auto-asignarse. Este script hace lo mismo pero por SQL: asegura que
-- exista su fila en "usuarios" (por si se registró antes de que el
-- trigger estuviera activo, igual que pasó con la cuenta de Luis) y lo
-- deja como Miembro del comando "Contacto y Bienvenida" (comisión
-- Comunidad). Cambia el slug del comando si prefieres otro.
-- =====================================================================
insert into usuarios (id, email, nombre, es_direccion, estado)
select id, email, coalesce(raw_user_meta_data->>'nombre', 'Karlo Paz Vilca'), false, 'activo'
from auth.users
where email = 'karlo.paz.vilca@gmail.com'
on conflict (id) do nothing;

insert into membresias (usuario_id, comando_id, rol)
select u.id, c.id, 'miembro'
from usuarios u
join comandos c on c.slug = 'contacto-bienvenida'
join comisiones co on co.id = c.comision_id and co.slug = 'comunidad'
where u.email = 'karlo.paz.vilca@gmail.com'
on conflict (usuario_id, comando_id) do update set rol = excluded.rol;

-- Verifica que quedó como Miembro:
select u.email, u.nombre, m.rol, c.nombre as comando
from membresias m
join usuarios u on u.id = m.usuario_id
join comandos c on c.id = m.comando_id
where u.email = 'karlo.paz.vilca@gmail.com';


-- =====================================================================
-- 2026-07-25 — Feature: asignar VARIAS personas a una tarea
-- ---------------------------------------------------------------------
-- Motivo: tareas.asignado_id solo guardaba 1 persona. El modal de
-- "Nueva tarea" ahora tiene un buscador con checkboxes (multi-select).
-- Necesita esta tabla puente nueva + sus políticas. Ya está reflejado
-- también en schema.sql y rls-policies.sql completos (por si prefieres
-- re-pegar esos 2 archivos enteros en vez de este parche — ambos ya son
-- seguros de re-correr las veces que sea necesario).
-- =====================================================================
create table if not exists tarea_asignados (
  tarea_id    uuid not null references tareas(id) on delete cascade,
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tarea_id, usuario_id)
);
create index if not exists idx_tarea_asignados_usuario on tarea_asignados(usuario_id);
alter table tarea_asignados enable row level security;

drop policy if exists tarea_asignados_select on tarea_asignados;
create policy tarea_asignados_select on tarea_asignados for select using (
  exists (
    select 1 from tareas t
    where t.id = tarea_asignados.tarea_id
      and (
        fn_es_direccion(auth.uid())
        or fn_es_lider(auth.uid(), fn_comision_de_comando(t.comando_id))
        or fn_pertenece_comision(auth.uid(), fn_comision_de_comando(t.comando_id))
      )
  )
);

drop policy if exists tarea_asignados_write on tarea_asignados;
create policy tarea_asignados_write on tarea_asignados for all using (
  exists (
    select 1 from tareas t
    where t.id = tarea_asignados.tarea_id
      and (
        fn_es_direccion(auth.uid())
        or fn_es_lider(auth.uid(), fn_comision_de_comando(t.comando_id))
        or fn_es_coordinador(auth.uid(), t.comando_id)
      )
  )
) with check (
  exists (
    select 1 from tareas t
    where t.id = tarea_asignados.tarea_id
      and (
        fn_es_direccion(auth.uid())
        or fn_es_lider(auth.uid(), fn_comision_de_comando(t.comando_id))
        or fn_es_coordinador(auth.uid(), t.comando_id)
      )
  )
);


-- =====================================================================
-- 2026-07-25 — Diagnóstico: 500 en /auth/v1/signup al registrar cuenta
-- ---------------------------------------------------------------------
-- Motivo: un 500 en el ENDPOINT DE SIGNUP (no en una tabla) casi siempre
-- es una de estas dos cosas, en este orden de probabilidad:
--   1) Límite de envío de correos alcanzado. El signUp() de Supabase
--      manda el correo de confirmación como parte del mismo request; si
--      el correo de prueba por defecto ya mandó varios hoy (ya van 4:
--      cristian, karlo, luis, raul), se queda sin cupo y el signup entero
--      responde 500 aunque la cuenta a veces sí se alcanza a crear.
--   2) El trigger fn_nuevo_usuario_auth() falla al crear la fila en
--      "usuarios" (ej. ese correo ya existe ahí con otro id) y como el
--      trigger no atrapa el error, se cae toda la transacción de signup.
--
-- Reemplaza 'CORREO_QUE_INTENTASTE@ejemplo.com' por el correo real que
-- estabas registrando y corre esto para saber cuál de los dos es:
-- =====================================================================
select 'auth.users' as tabla, id, email, created_at from auth.users where email = 'CORREO_QUE_INTENTASTE@ejemplo.com'
union all
select 'usuarios' as tabla, id, email, created_at from usuarios where email = 'CORREO_QUE_INTENTASTE@ejemplo.com';

