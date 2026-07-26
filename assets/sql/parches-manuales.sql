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


-- =====================================================================
-- 2026-07-25 — Miembro ahora ve TODO el róster de su propia comisión
-- (antes solo veía su propia fila en "membresias")
-- ---------------------------------------------------------------------
-- Motivo: un Miembro debe poder ver (sólo lectura, sin poder crear ni
-- borrar membresías) a todas las personas de los comandos hermanos
-- dentro de SU MISMA comisión — misma transparencia lateral que ya
-- tienen tareas/comandos. Antes, membresias_select solo dejaba ver la
-- propia fila (o todo, si eras Dirección/Líder/Coordinador), así que un
-- Miembro veía "Miembros (0)" o listas incompletas al entrar a un
-- comando que no era el suyo. Esto NO cambia membresias_insert/delete:
-- Miembro sigue sin poder agregar ni quitar gente de ningún comando.
-- =====================================================================
drop policy if exists membresias_select on membresias;
create policy membresias_select on membresias for select using (
  usuario_id = auth.uid()
  or fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador_de_la_comision(auth.uid(), comando_id)
  or fn_pertenece_comision(auth.uid(), fn_comision_de_comando(comando_id))
);


-- =====================================================================
-- 2026-07-25 — "Ver todo, editar solo lo tuyo" (como en la demo original)
-- ---------------------------------------------------------------------
-- Motivo: en la demo, cualquier persona (asignada o no) podía VER todas
-- las comisiones y qué comandos tiene cada una; lo único bloqueado era
-- CLICKEAR/entrar a un comando ajeno. Con Supabase real, la lectura
-- estaba de más restringida (solo veías tu propia comisión), así que
-- las tarjetas de comisiones ajenas salían en 0. Este parche abre la
-- LECTURA de comandos/tareas/membresías/eventos/comunicados/enlaces a
-- cualquier persona autenticada. Nada de esto toca quién puede CREAR,
-- EDITAR o BORRAR — esas políticas (membresias_insert/delete,
-- tareas_insert/update, comandos_insert/update, etc.) siguen exactamente
-- igual que antes. El "no clicleable" para comandos ajenos ya lo maneja
-- el cliente (permissions.js), no hacía falta tocar nada ahí más que
-- habilitar también el botón "Unirme a este comando" para Miembro y
-- Coordinador, no solo Colaborador (ver assets/js/views/shared.js).
-- =====================================================================
drop policy if exists comandos_select on comandos;
create policy comandos_select on comandos for select using (auth.uid() is not null);

drop policy if exists membresias_select on membresias;
create policy membresias_select on membresias for select using (auth.uid() is not null);

drop policy if exists tareas_select on tareas;
create policy tareas_select on tareas for select using (auth.uid() is not null);

drop policy if exists tarea_asignados_select on tarea_asignados;
create policy tarea_asignados_select on tarea_asignados for select using (auth.uid() is not null);

drop policy if exists eventos_select on eventos;
create policy eventos_select on eventos for select using (auth.uid() is not null);

drop policy if exists comunicados_select on comunicados;
create policy comunicados_select on comunicados for select using (auth.uid() is not null);

drop policy if exists enlaces_select on enlaces;
create policy enlaces_select on enlaces for select using (auth.uid() is not null);


-- =====================================================================
-- 2026-07-25 — Diagnóstico: 500 en signup probando desde GitHub Pages
-- (zvagentepro@gmail.com)
-- ---------------------------------------------------------------------
-- Mismo diagnóstico de siempre, ya con el correo real de la prueba.
-- Dice si la cuenta se alcanzó a crear en auth.users (aunque el 500 haya
-- salido) o si no se creó nada.
-- =====================================================================
select 'auth.users' as tabla, id, email, created_at from auth.users where email = 'zvagentepro@gmail.com'
union all
select 'usuarios' as tabla, id, email, created_at from usuarios where email = 'zvagentepro@gmail.com';


-- =====================================================================
-- 2026-07-25 — Diagnóstico definitivo: por qué signUp() da 500
-- ---------------------------------------------------------------------
-- Reproduje el registro en vivo (Chrome) contra tu sitio publicado y
-- capturé el error real que Supabase esconde detrás del 500 genérico:
--   {"code":500,"error_code":"unexpected_failure","msg":"Database error
--   saving new user"}
-- Esto significa que NO es el redirect URL (ya está bien puesto) ni el
-- límite de correos — es el TRIGGER que crea tu fila en "usuarios" el
-- que está fallando dentro de la transacción de registro. Esta consulta
-- imita exactamente lo que hace ese trigger, pero corriéndola tú
-- directamente en el SQL Editor (como superusuario, sin pasar por el
-- trigger) para ver el error real de Postgres sin que Supabase lo
-- esconda. Bórrala después de correrla (es solo de prueba).
-- =====================================================================
-- CORRECCIÓN: la prueba anterior (insert con un uuid inventado) estaba
-- mal armada — SIEMPRE iba a fallar por la relación usuarios.id -> auth.
-- users.id, no tiene que ver con el bug real. No hace falta correrla.
-- Usa en su lugar el bloque de abajo (2026-07-26), que solo LEE, no
-- inserta nada, y revisa el trigger/función/tabla directamente.


-- =====================================================================
-- 2026-07-26 — Diagnóstico definitivo #2: inspeccionar el trigger que
-- falla, sin insertar nada (100% de solo lectura, no cambia nada)
-- ---------------------------------------------------------------------
-- Corre las 4 consultas y pégame el resultado de las 4 (aunque alguna
-- salga vacía, eso también es información).
-- =====================================================================

-- 1) ¿Existe el trigger en auth.users y está activo?
select tgname, tgenabled, tgrelid::regclass as tabla
from pg_trigger
where tgname = 'trg_nuevo_usuario_auth';

-- 2) ¿Cuál es el código actual de la función que dispara ese trigger?
select prosrc
from pg_proc
where proname = 'fn_nuevo_usuario_auth';

-- 3) ¿La tabla "usuarios" tiene RLS "forzado" incluso para el dueño?
--    (si force_row_security = true, hasta un trigger SECURITY DEFINER
--    podría chocar con las políticas — normalmente debe ser false)
select relrowsecurity as rls_activo, relforcerowsecurity as rls_forzado
from pg_class
where relname = 'usuarios';

-- 4) Estructura real de la tabla "usuarios" en tu base ahora mismo
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'usuarios'
order by ordinal_position;


-- =====================================================================
-- 2026-07-26 — Diagnóstico #3: ¿hay OTRO trigger en auth.users además
-- del nuestro, que también se dispare al registrarse y esté fallando?
-- (solo lectura)
-- =====================================================================
select tgname, tgenabled, pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;


-- =====================================================================
-- 2026-07-26 — PRUEBA DECISIVA: ¿el 500 es nuestro trigger o es Supabase?
-- ---------------------------------------------------------------------
-- Paso 1: "auth.users" le pertenece al rol interno supabase_auth_admin,
-- no al rol normal del SQL Editor — por eso dio "must be owner of table
-- users". Hay que pedir prestado ese rol un momento:
--
--   set role supabase_auth_admin;
--   alter table auth.users disable trigger trg_nuevo_usuario_auth;
--   reset role;
--
-- Paso 2: intenta crear una cuenta nueva en el sitio (correo nunca usado).
--   - Si FUNCIONA sin el trigger -> el problema es 100% nuestro trigger,
--     lo reescribimos ahora mismo con una versión más defensiva.
--   - Si SIGUE dando 500 sin el trigger -> el problema NO es nuestro,
--     es de Supabase (su capa de Auth interna), y ahí sí conviene
--     escribirles a soporte con toda la evidencia que ya reunimos.
--
-- Paso 3 (siempre, pase lo que pase): vuelve a prender el trigger para
-- no dejar cuentas nuevas sin perfil:
--
--   set role supabase_auth_admin;
--   alter table auth.users enable trigger trg_nuevo_usuario_auth;
--   reset role;
-- =====================================================================
-- NO SE NECESITÓ ESTA PRUEBA — se encontró la causa real por otro
-- camino (ver bloque de abajo, 2026-07-26). No corras esto.


-- =====================================================================
-- 2026-07-26 — CAUSA REAL encontrada: dos apps (Sistema de Comisiones y
-- la app de tarjetas de presentación / QR personal) comparten esta
-- misma base de Supabase y ambas tienen un trigger en auth.users que se
-- dispara en CADA registro nuevo, sin importar cuál app lo originó:
--
--   trg_handle_new_user      -> función handle_new_user()      (tarjetas)
--   trg_nuevo_usuario_auth   -> función fn_nuevo_usuario_auth() (comisiones)
--
-- handle_new_user() no atrapa sus propios errores: si algo en su lógica
-- de tarjetas falla (colisión de slug, columna inesperada, etc.), la
-- excepción se propaga y tumba TODA la transacción de signUp() — así
-- sea alguien registrándose en Comisiones. Por eso el 500 "de la nada":
-- nunca fue nuestro esquema, era la otra app reventando por nosotros.
--
-- Fix: la MISMA función handle_new_user(), con su lógica intacta, pero
-- envuelta en un bloque que atrapa cualquier error y solo deja una
-- advertencia en los logs de Postgres, sin tumbar el registro. Así
-- ninguna de las dos apps puede romperle el signup a la otra nunca más.
-- Esto SÍ se puede correr con el rol normal del SQL Editor (no hace
-- falta "set role" — eso solo se necesita para tocar la tabla auth.users
-- en sí, no para reemplazar una función que ya existe en public).
-- =====================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  meta jsonb;
  base_slug text;
  final_slug text;
  suffix int := 0;
begin
  begin
    if new.email_confirmed_at is not null and (old is null or old.email_confirmed_at is null) then
      meta := new.raw_user_meta_data;
      base_slug := coalesce(nullif(regexp_replace(lower(meta->>'slug_sugerido'), '[^a-z0-9-]', '', 'g'), ''), 'usuario');
      final_slug := base_slug;

      while exists (select 1 from public.profiles where slug = final_slug)
         or exists (select 1 from public.slugs_reservados where slug = final_slug) loop
        suffix := suffix + 1;
        final_slug := base_slug || '-' || suffix::text;
      end loop;

      insert into public.profiles (
        user_id, slug, nombre_completo, cargo, empresa, bio,
        telefono, whatsapp, email_contacto, direccion, redes,
        tema_color_primario, tema_color_secundario,
        tema_fuente_titulo, tema_fuente_texto
      ) values (
        new.id,
        final_slug,
        coalesce(meta->>'nombre_completo', ''),
        coalesce(meta->>'cargo', ''),
        coalesce(meta->>'empresa', ''),
        coalesce(meta->>'bio', ''),
        coalesce(meta->>'telefono', ''),
        coalesce(meta->>'whatsapp', ''),
        coalesce(new.email, ''),
        coalesce(meta->>'direccion', ''),
        coalesce(meta->'redes', '{}'::jsonb),
        case when meta->>'tema_color_primario' ~ '^#[0-9a-fA-F]{6}$'
             then meta->>'tema_color_primario' else '#C9B8F5' end,
        case when meta->>'tema_color_secundario' ~ '^#[0-9a-fA-F]{6}$'
             then meta->>'tema_color_secundario' else '#232421' end,
        case when meta->>'tema_fuente_titulo' in ('Poppins','Inter','Montserrat','Playfair Display','Roboto','Lora','Nunito','Space Grotesk','Merriweather','Work Sans')
             then meta->>'tema_fuente_titulo' else 'Poppins' end,
        case when meta->>'tema_fuente_texto' in ('Poppins','Inter','Montserrat','Playfair Display','Roboto','Lora','Nunito','Space Grotesk','Merriweather','Work Sans')
             then meta->>'tema_fuente_texto' else 'Inter' end
      )
      on conflict (user_id) do nothing;
    end if;
  exception when others then
    raise warning 'handle_new_user() falló para % (no se detuvo el registro): %', new.email, sqlerrm;
  end;
  return new;
end;
$$;

-- Lo mismo del lado de Comisiones, por las dudas (defensa doble): si en
-- el futuro algo de NUESTRO trigger falla, tampoco debe tumbarle el
-- registro a la app de tarjetas.
create or replace function fn_nuevo_usuario_auth()
returns trigger language plpgsql security definer as $$
begin
  begin
    insert into usuarios (id, email, nombre, estado)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
      'pendiente_activacion'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'fn_nuevo_usuario_auth() falló para % (no se detuvo el registro): %', new.email, sqlerrm;
  end;
  return new;
end;
$$;


-- =====================================================================
-- 2026-07-26 — FIX real: "relation usuarios does not exist"
-- ---------------------------------------------------------------------
-- El log de Postgres confirmó la causa exacta: la fila para
-- zvagentepro@gmail.com nunca se creó porque el trigger, al correr
-- disparado desde auth.users, no tiene "public" en su search_path por
-- defecto. Escribir "insert into usuarios" (sin el esquema) hacía que
-- Postgres no encontrara la tabla, aunque sí exista — el error quedaba
-- atrapado en silencio por el bloque anterior, por eso no se veía el
-- 500 pero tampoco se creaba la fila. Esta versión agrega "public." y
-- fija el search_path explícitamente (reemplaza a la de arriba).
-- =====================================================================
create or replace function fn_nuevo_usuario_auth()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  begin
    insert into public.usuarios (id, email, nombre, estado)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
      'pendiente_activacion'
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'fn_nuevo_usuario_auth() falló para % (no se detuvo el registro): %', new.email, sqlerrm;
  end;
  return new;
end;
$$;

-- Crea manualmente la fila que le faltó a zvagentepro@gmail.com (el
-- trigger no la creó por el bug de arriba, y ya confirmó su correo):
insert into public.usuarios (id, email, nombre, estado)
select id, email, coalesce(raw_user_meta_data->>'nombre', 'zvagentepro'), 'activo'
from auth.users
where email = 'zvagentepro@gmail.com'
on conflict (id) do nothing;


-- =====================================================================
-- 2026-07-26 — Fix: "Cannot read properties of null (reading 'nombre')"
-- ---------------------------------------------------------------------
-- Motivo: usuarios_select se quedó con el criterio viejo ("solo ves
-- nombres de gente con quien compartes comando"). Ahora que cualquiera
-- puede ver TODOS los comandos, el join a "usuarios" para mostrar el
-- nombre del coordinador volvía null para un Colaborador sin comando —
-- y el cliente truena al leerlo. Mismo criterio de "ver todo" que ya se
-- aplicó a comandos/tareas/membresias.
-- =====================================================================
drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select using (auth.uid() is not null);


-- =====================================================================
-- 2026-07-26 — Feature: botón "Salir de este comando" (vista de Miembros)
-- ---------------------------------------------------------------------
-- Motivo: membresias_delete solo dejaba borrar una fila de membresías a
-- Dirección/Líder/Coordinador. Un Miembro que se había auto-enlistado
-- ("Unirme a este comando") no podía deshacer esa acción por su cuenta.
-- Se agrega la cláusula simétrica a la de membresias_insert (auto-
-- enlistamiento): cualquiera puede borrar SU PROPIA fila.
-- Ya aplicado también en rls-policies.sql y migrations/0002_rls_policies.sql.
-- =====================================================================
drop policy if exists membresias_delete on membresias;
create policy membresias_delete on membresias for delete using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or usuario_id = auth.uid()
);


-- =====================================================================
-- 2026-07-26 — Alta: comandos Macrodistritales/Provinciales de Lima
-- (comisión Organización) + sus enlaces de WhatsApp
-- ---------------------------------------------------------------------
-- Motivo: además de los 27 chats regionales ya sembrados (seed-demo.sql,
-- uno de ellos "Lima Metropolitana"), se crean 4 comandos nuevos que
-- subdividen Lima Metropolitana en sus 4 macrodistritos/zonas. Mismo
-- patrón de slug que el resto de Organización (org-<slug del nombre>).
-- El enlace de WhatsApp de cada grupo se guarda en la tabla "enlaces"
-- (alcance = comisión Organización), ya que "comandos" no tiene columna
-- de URL — así queda visible en la sección "Enlaces" de esa comisión.
-- =====================================================================
do $$
declare
  v_comision_id uuid;
begin
  select id into v_comision_id from comisiones where slug = 'organizacion';

  insert into comandos (comision_id, slug, nombre, region) values
    (v_comision_id, 'org-macrodistrital-lima-norte',  'Macrodistrital — Lima Norte',  'Lima Norte'),
    (v_comision_id, 'org-macrodistrital-lima-centro', 'Macrodistrital — Lima Centro', 'Lima Centro'),
    (v_comision_id, 'org-macrodistrital-lima-este',   'Macrodistrital — Lima Este',   'Lima Este'),
    (v_comision_id, 'org-macrodistrital-lima-sur',    'Macrodistrital — Lima Sur',    'Lima Sur')
  on conflict (comision_id, slug) do nothing;
end $$;

insert into enlaces (nombre, url, descripcion, comision_id, autor_id)
select v.nombre, v.url, v.descripcion, c.id, u.id
from comisiones c
cross join (values
  ('WhatsApp — Lima Norte',
   'https://chat.whatsapp.com/L4G6FyjewmUB4WSk4TTcOq',
   'Ancón, Carabayllo, Comas, Independencia, Los Olivos, Puente Piedra, Rímac, San Martín de Porres y Santa Rosa.'),
  ('WhatsApp — Lima Centro',
   'https://chat.whatsapp.com/H7GtOHQjf40I2l28kNQea7',
   'Barranco, Breña, Cercado de Lima, Jesús María, La Molina, La Victoria, Lince, Magdalena del Mar, Miraflores, Pueblo Libre, San Borja, San Isidro, San Luis, San Miguel, Santiago de Surco y Surquillo.'),
  ('WhatsApp — Lima Este',
   'https://chat.whatsapp.com/Lni5eiW1sOTHA97xg8C9lN',
   'Ate, Chaclacayo, Cieneguilla, El Agustino, Lurigancho-Chosica, San Juan de Lurigancho y Santa Anita.'),
  ('WhatsApp — Lima Sur',
   'https://chat.whatsapp.com/Fiw2tFOLv7R2FzNeAJEljg',
   'Chorrillos, Lurín, Pachacámac, Punta Hermosa, Punta Negra, Pucusana, San Bartolo, San Juan de Miraflores, Santa María del Mar, Villa el Salvador y Villa María del Triunfo.')
) as v(nombre, url, descripcion)
left join usuarios u on u.email = 'luis.paz.vilca@gmail.com'
where c.slug = 'organizacion'
  and not exists (select 1 from enlaces e where e.nombre = v.nombre and e.comision_id = c.id);


-- =====================================================================
-- 2026-07-26 — SUPERA el bloque anterior: el enlace ahora cuelga del
-- COMANDO, no de la biblioteca general de enlaces
-- ---------------------------------------------------------------------
-- Motivo: se agregó la columna comandos.enlace_url (ver schema.sql) para
-- que cada comando tenga SU PROPIO link de coordinación (WhatsApp u
-- otro), en vez de vivir como una fila suelta en "enlaces" sin relación
-- real al comando. Este bloque:
--   1) agrega la columna (si no existe ya, por si corriste schema.sql
--      viejo antes de este parche);
--   2) crea/actualiza los 4 comandos Macrodistritales CON su enlace_url
--      directo (funciona tanto si ya los habías creado con el bloque
--      anterior como si no — el ON CONFLICT actualiza el link);
--   3) deja comentado el DELETE de limpieza de las 4 filas que el
--      bloque anterior pudo haber creado en "enlaces" — corre esa línea
--      SOLO si ya ejecutaste ese bloque anterior y quieres quitar el
--      duplicado.
-- =====================================================================
alter table comandos add column if not exists enlace_url text;
comment on column comandos.enlace_url is 'Enlace directo del grupo de coordinación de ESTE comando (ej. link de WhatsApp).';

do $$
declare
  v_comision_id uuid;
begin
  select id into v_comision_id from comisiones where slug = 'organizacion';

  insert into comandos (comision_id, slug, nombre, region, enlace_url) values
    (v_comision_id, 'org-macrodistrital-lima-norte',  'Macrodistrital — Lima Norte',  'Lima Norte',
     'https://chat.whatsapp.com/L4G6FyjewmUB4WSk4TTcOq'),
    (v_comision_id, 'org-macrodistrital-lima-centro', 'Macrodistrital — Lima Centro', 'Lima Centro',
     'https://chat.whatsapp.com/H7GtOHQjf40I2l28kNQea7'),
    (v_comision_id, 'org-macrodistrital-lima-este',   'Macrodistrital — Lima Este',   'Lima Este',
     'https://chat.whatsapp.com/Lni5eiW1sOTHA97xg8C9lN'),
    (v_comision_id, 'org-macrodistrital-lima-sur',    'Macrodistrital — Lima Sur',    'Lima Sur',
     'https://chat.whatsapp.com/Fiw2tFOLv7R2FzNeAJEljg')
  on conflict (comision_id, slug) do update set enlace_url = excluded.enlace_url, region = excluded.region;
end $$;

-- Limpieza opcional (correr solo si ya ejecutaste el bloque anterior
-- basado en "enlaces" y quieres borrar esas 4 filas duplicadas):
-- delete from enlaces where comision_id = (select id from comisiones where slug = 'organizacion')
--   and nombre in ('WhatsApp — Lima Norte','WhatsApp — Lima Centro','WhatsApp — Lima Este','WhatsApp — Lima Sur');


-- =====================================================================
-- 2026-07-26 — DIAGNÓSTICO: 409 al enlistarse en un SEGUNDO comando
-- ---------------------------------------------------------------------
-- schema.sql define membresias con "unique (usuario_id, comando_id)"
-- (permite VARIAS filas por usuario, una por comando). Pero schema.sql
-- usa "create table IF NOT EXISTS": si la tabla "membresias" ya existía
-- en tu base de datos desde ANTES (versión más vieja del proyecto, de
-- cuando la idea era 1 solo comando por persona), esa sentencia no hace
-- nada — no cambia una tabla que ya existe. Es muy probable que tu tabla
-- real todavía tenga la restricción VIEJA "unique (usuario_id)" (una fila
-- por persona, sin importar el comando), y por eso el segundo INSERT
-- choca con la primera fila ya existente → 409 (unique_violation).
-- Corre PRIMERO este SELECT para confirmarlo (te va a mostrar el nombre
-- exacto de la restricción única que existe hoy en tu tabla):
-- =====================================================================
select conname as restriccion, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'membresias'::regclass and contype = 'u';

-- Si el resultado de arriba muestra algo como "UNIQUE (usuario_id)" (SIN
-- comando_id), corre este bloque para reemplazarla por la correcta. Es
-- idempotente: no falla si ya la habías corregido antes.
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'membresias'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (usuario_id)';

  if v_conname is not null then
    execute format('alter table membresias drop constraint %I', v_conname);
    raise notice 'Restricción vieja % eliminada.', v_conname;
  end if;

  begin
    alter table membresias add constraint membresias_usuario_id_comando_id_key unique (usuario_id, comando_id);
  exception when duplicate_object then
    raise notice 'La restricción correcta ya existía, no se duplicó.';
  end;
end $$;

