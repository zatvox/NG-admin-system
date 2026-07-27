-- =====================================================================
-- RLS-POLICIES.SQL — Row Level Security del Sistema de Comisiones
-- ---------------------------------------------------------------------
-- Traduce 1:1 la tabla de roles de especificaciones-sistema-comisiones.md
-- (sección 3) a políticas de Postgres. Principio: DENY BY DEFAULT — se
-- activa RLS en toda tabla y solo se abre lo que una política permite
-- explícitamente. Dos capas siempre separadas: VER (SELECT) y EDITAR
-- (INSERT/UPDATE/DELETE), tal como pide la spec.
--
-- Se usan funciones SECURITY DEFINER como "helpers" de permisos para que
-- las políticas queden legibles y no se dupliquen subqueries en cada una
-- (buena práctica: la lógica de "quién puede qué" vive en un solo lugar).
-- Ejecutar DESPUÉS de schema.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FUNCIONES HELPER DE PERMISOS
-- ---------------------------------------------------------------------

-- ¿El usuario autenticado es Dirección General? (rol global, ve/edita todo)
create or replace function fn_es_direccion(p_uid uuid)
returns boolean language sql stable security definer as $$
  select coalesce((select es_direccion from usuarios where id = p_uid), false);
$$;

-- ¿El usuario es Líder de esa comisión?
create or replace function fn_es_lider(p_uid uuid, p_comision_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from comisiones where id = p_comision_id and lider_id = p_uid
  );
$$;

-- ¿El usuario es Coordinador (o secretario/a de apoyo) de ese comando?
create or replace function fn_es_coordinador(p_uid uuid, p_comando_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from membresias
    where usuario_id = p_uid and comando_id = p_comando_id
      and rol in ('coordinador','secretario')
  );
$$;

-- ¿El usuario pertenece (con cualquier rol) a algún comando de esa comisión?
-- Es la base del "ver" transversal: cualquier miembro ve todos los comandos
-- hermanos dentro de su propia comisión (transparencia interna).
create or replace function fn_pertenece_comision(p_uid uuid, p_comision_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from membresias m
    join comandos c on c.id = m.comando_id
    where m.usuario_id = p_uid and c.comision_id = p_comision_id
  );
$$;

-- ¿El usuario tiene alguna membresía activa (= ya es Miembro, no Colaborador suelto)?
create or replace function fn_tiene_membresia(p_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from membresias where usuario_id = p_uid);
$$;

-- Comisión de un comando (evita repetir el join en cada política).
create or replace function fn_comision_de_comando(p_comando_id uuid)
returns uuid language sql stable security definer as $$
  select comision_id from comandos where id = p_comando_id;
$$;

-- ¿El usuario es coordinador/secretario de ALGÚN comando de la misma
-- comisión que el comando indicado? Antes esta lógica era un EXISTS
-- escrito directamente adentro de membresias_select, y eso rompía el
-- sistema: Postgres prohíbe que la política de una tabla consulte esa
-- misma tabla en su propio cuerpo ("infinite recursion detected in
-- policy for relation membresias"). Al moverla a una función SECURITY
-- DEFINER, la consulta interna corre con el dueño de la función (que no
-- está sujeto a RLS sobre sus propias tablas) y el ciclo desaparece.
create or replace function fn_es_coordinador_de_la_comision(p_uid uuid, p_comando_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from membresias m
    where m.usuario_id = p_uid
      and m.rol in ('coordinador','secretario')
      and fn_comision_de_comando(m.comando_id) = fn_comision_de_comando(p_comando_id)
  );
$$;

-- ¿El usuario es Líder de CUALQUIER comisión (sin importar cuál)? Se usa
-- en foro_temas_update: cualquier Líder puede ayudar a cerrar un tema con
-- conclusión, no solo el de la comisión ligada al tema (el Foro es
-- transversal a las 5 comisiones, no propiedad de una sola).
create or replace function fn_es_lider_de_alguna(p_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (select 1 from comisiones where lider_id = p_uid);
$$;

-- ¿Dos usuarios comparten al menos un comando? Se usa en usuarios_select
-- para que el Directorio pueda resolver nombres de compañeros de comando
-- sin que la política de "usuarios" tenga que leer "membresias" en línea
-- (esa lectura en línea es justamente lo que disparaba la recursión de
-- membresias_select en cascada, porque usuarios_select dependía de ella).
create or replace function fn_comparten_comando(p_uid uuid, p_otro_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from membresias m1
    join membresias m2 on m2.comando_id = m1.comando_id
    where m1.usuario_id = p_uid and m2.usuario_id = p_otro_uid
  );
$$;

-- ---------------------------------------------------------------------
-- ACTIVAR RLS EN TODAS LAS TABLAS DE DATOS
-- ---------------------------------------------------------------------
alter table usuarios      enable row level security;
alter table comisiones    enable row level security;
alter table comandos      enable row level security;
alter table membresias    enable row level security;
alter table tareas        enable row level security;
alter table eventos       enable row level security;
alter table comunicados   enable row level security;
alter table enlaces       enable row level security;
alter table configuracion   enable row level security;
alter table auditoria       enable row level security;
alter table tarea_asignados enable row level security;
alter table foro_temas       enable row level security;
alter table foro_comentarios enable row level security;
alter table foro_votos       enable row level security;

-- ---------------------------------------------------------------------
-- QUITAR POLÍTICAS ANTERIORES (hace que este archivo se pueda volver a
-- correr las veces que sea necesario sin el error "policy already
-- exists" — a diferencia de "create or replace function", Postgres no
-- tiene "create or replace policy", así que hay que borrarlas primero).
-- ---------------------------------------------------------------------
drop policy if exists usuarios_select        on usuarios;
drop policy if exists usuarios_update_propio  on usuarios;
drop policy if exists comisiones_select       on comisiones;
drop policy if exists comisiones_update       on comisiones;
drop policy if exists comisiones_insert       on comisiones;
drop policy if exists comandos_select         on comandos;
drop policy if exists comandos_insert         on comandos;
drop policy if exists comandos_update         on comandos;
drop policy if exists membresias_select       on membresias;
drop policy if exists membresias_insert       on membresias;
drop policy if exists membresias_delete       on membresias;
drop policy if exists tareas_select           on tareas;
drop policy if exists tareas_insert           on tareas;
drop policy if exists tareas_update           on tareas;
drop policy if exists tarea_asignados_select  on tarea_asignados;
drop policy if exists tarea_asignados_write   on tarea_asignados;
drop policy if exists eventos_select          on eventos;
drop policy if exists eventos_insert          on eventos;
drop policy if exists comunicados_select      on comunicados;
drop policy if exists comunicados_insert      on comunicados;
drop policy if exists enlaces_select          on enlaces;
drop policy if exists enlaces_insert          on enlaces;
drop policy if exists configuracion_select    on configuracion;
drop policy if exists configuracion_write     on configuracion;
drop policy if exists auditoria_select        on auditoria;
drop policy if exists foro_temas_select       on foro_temas;
drop policy if exists foro_temas_insert       on foro_temas;
drop policy if exists foro_temas_update       on foro_temas;
drop policy if exists foro_temas_delete       on foro_temas;
drop policy if exists foro_comentarios_select on foro_comentarios;
drop policy if exists foro_comentarios_insert on foro_comentarios;
drop policy if exists foro_comentarios_delete on foro_comentarios;
drop policy if exists foro_votos_select       on foro_votos;
drop policy if exists foro_votos_insert       on foro_votos;
drop policy if exists foro_votos_delete       on foro_votos;

-- ---------------------------------------------------------------------
-- USUARIOS
-- Ver: (2026-07-26) CUALQUIER persona autenticada — mismo criterio de
--      "ver todo" que comandos/tareas/membresias: si vas a poder ver que
--      alguien es coordinador de un comando, también hace falta poder
--      resolver SU NOMBRE (el join usuarios(nombre) se hace desde
--      membresias). Antes esto solo dejaba ver nombres de gente con
--      quien ya compartías comando, y por eso "Colaborador sin comando"
--      no podía leer el nombre de ningún coordinador — el join volvía
--      null y la UI truena al leerlo (fix también aplicado en cliente).
-- Editar: solo su propia fila (perfil), nunca es_direccion ni estado
--         (esos campos los cambia Dirección vía panel/soporte, no el propio usuario).
-- ---------------------------------------------------------------------
create policy usuarios_select on usuarios for select using (
  auth.uid() is not null
);

create policy usuarios_update_propio on usuarios for update using (
  id = auth.uid() or fn_es_direccion(auth.uid())
) with check (
  id = auth.uid() or fn_es_direccion(auth.uid())
);

-- ---------------------------------------------------------------------
-- COMISIONES — info general visible para todos los autenticados (la spec
-- dice que el detalle de comisión es "información general de la
-- organización" aunque los comandos ajenos se vean deshabilitados).
-- Editar: Dirección siempre; Líder solo su propia comisión (misión, etc.).
-- ---------------------------------------------------------------------
create policy comisiones_select on comisiones for select using (auth.uid() is not null);

create policy comisiones_update on comisiones for update using (
  fn_es_direccion(auth.uid()) or lider_id = auth.uid()
) with check (
  fn_es_direccion(auth.uid()) or lider_id = auth.uid()
);

create policy comisiones_insert on comisiones for insert with check (
  fn_es_direccion(auth.uid())
);

-- ---------------------------------------------------------------------
-- COMANDOS
-- Ver: (2026-07-25) CUALQUIER persona autenticada, esté o no asignada a
--      esa comisión — igual que en la demo, cualquiera puede ver qué
--      comisiones y comandos existen en toda la organización. Lo que
--      NO da esto es acceso al tablero de tareas de un comando ajeno:
--      eso lo sigue bloqueando el cliente (canAccessSubgrupo en
--      permissions.js — la tarjeta no es "clicleable" si no eres de esa
--      comisión) y, para el contenido de las tareas en sí, tareas_select.
-- Crear: Dirección, o Líder de esa comisión ("+ Crear comando operativo").
-- ---------------------------------------------------------------------
create policy comandos_select on comandos for select using (
  auth.uid() is not null
);

create policy comandos_insert on comandos for insert with check (
  fn_es_direccion(auth.uid()) or fn_es_lider(auth.uid(), comision_id)
);

create policy comandos_update on comandos for update using (
  fn_es_direccion(auth.uid()) or fn_es_lider(auth.uid(), comision_id)
);

-- ---------------------------------------------------------------------
-- MEMBRESÍAS (= base del Directorio)
-- Ver: (2026-07-25) CUALQUIER persona autenticada — mismo criterio que
--      comandos_select: en la demo cualquiera veía quién integra cada
--      comando, esté o no esa persona asignada a esa comisión. Lo único
--      restringido de verdad es ESCRIBIR aquí: crear/quitar membresías
--      sigue siendo solo Dirección, Líder de la comisión o Coordinador
--      del comando (más el auto-enlistamiento de uno mismo como
--      Miembro), nunca lectura libre implica permiso de editar.
-- Crear/editar: Dirección, Líder de la comisión, o Coordinador (solo
--      puede agregar miembros a SU PROPIO comando).
-- ---------------------------------------------------------------------
create policy membresias_select on membresias for select using (
  auth.uid() is not null
);

create policy membresias_insert on membresias for insert with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or (usuario_id = auth.uid() and rol = 'miembro') -- auto-enlistamiento: cualquier persona autenticada puede sumarse a un comando como Miembro (botón "Enlistarse" / "Unirme a este comando")
);

create policy membresias_delete on membresias for delete using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or usuario_id = auth.uid() -- auto-salida: cualquier persona puede borrar su PROPIA membresía ("Salir de este comando"), simétrico al auto-enlistamiento de membresias_insert
);

-- ---------------------------------------------------------------------
-- TAREAS
-- Ver: (2026-07-25) CUALQUIER persona autenticada puede ver el tablero
--      de tareas de CUALQUIER comando (mismo criterio de "ver todo" que
--      comandos_select/membresias_select). El cliente sigue sin dejar
--      NAVEGAR al tablero de un comando ajeno (canAccessSubgrupo), pero
--      eso es solo UX — quien de verdad necesita bloquear datos es el
--      backend, y aquí el dato que hay que proteger es poder EDITAR, no
--      verlo (transparencia total, igual que en la demo original).
-- Editar estado: Dirección; Líder de su comisión; Coordinador de su
--      propio comando; Miembro SOLO si la tarea está asignada a él/ella
--      Y pertenece al comando en el que se enlistó.
-- Crear: Dirección, Líder, Coordinador (no Miembro, según la UI actual).
-- ---------------------------------------------------------------------
create policy tareas_select on tareas for select using (
  auth.uid() is not null
);

create policy tareas_insert on tareas for insert with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
);

create policy tareas_update on tareas for update using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or asignado_id = auth.uid()
) with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or asignado_id = auth.uid()
);

-- ---------------------------------------------------------------------
-- TAREA_ASIGNADOS (multi-asignado)
-- Ver: mismo alcance que ver la tarea (dirección, líder de la comisión,
--      o cualquiera de la comisión — transparencia lateral).
-- Escribir (asignar/quitar personas): mismo alcance que crear/editar la
--      tarea (dirección, líder, o coordinador del comando). Un Miembro
--      NUNCA puede reasignar tareas, solo cambiar el estado de las suyas
--      (eso lo controla tareas_update, no esta tabla).
-- ---------------------------------------------------------------------
create policy tarea_asignados_select on tarea_asignados for select using (
  auth.uid() is not null -- mismo criterio de "ver todo" que tareas_select
);

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

-- ---------------------------------------------------------------------
-- EVENTOS
-- Ver: (2026-07-25) cualquier autenticado, sea "general" o de una
--      comisión específica — mismo criterio de "ver todo" de arriba.
-- Crear: Dirección, Líder, Coordinador (igual que en la UI del calendario).
-- ---------------------------------------------------------------------
create policy eventos_select on eventos for select using (
  auth.uid() is not null
);

create policy eventos_insert on eventos for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
);

-- ---------------------------------------------------------------------
-- COMUNICADOS
-- Ver: (2026-07-25) cualquier autenticado, mismo criterio de "ver todo".
-- Publicar: solo Dirección y Líder (la spec no da esta capacidad a Coordinador).
-- ---------------------------------------------------------------------
create policy comunicados_select on comunicados for select using (
  auth.uid() is not null
);

create policy comunicados_insert on comunicados for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (alcance = 'general' and fn_es_direccion(auth.uid()))
);

-- ---------------------------------------------------------------------
-- ENLACES — biblioteca compartida. (2026-07-25) visible para cualquier
-- autenticado, esté o no asignado a un comando — mismo criterio de
-- "ver todo" de arriba (antes requería fn_tiene_membresia para los
-- enlaces generales, ahora ni eso hace falta).
-- Publicar: Dirección, Líder, Coordinador.
-- ---------------------------------------------------------------------
create policy enlaces_select on enlaces for select using (
  auth.uid() is not null
);

create policy enlaces_insert on enlaces for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
);

-- ---------------------------------------------------------------------
-- CONFIGURACION — el módulo de EDICIÓN (la vista "Configuración" del
-- sidebar) es exclusivo de Dirección, pero los VALORES ya guardados
-- (nombre de la organización, colores de marca) se leen en toda la app
-- para pintar sidebar/tema — por eso el SELECT es para todo autenticado.
-- Nunca se expone a anon: el login.html usa los valores por defecto de
-- config.js hasta que la persona inicia sesión.
-- ---------------------------------------------------------------------
create policy configuracion_select on configuracion for select using (
  auth.uid() is not null
);

create policy configuracion_write on configuracion for all using (
  fn_es_direccion(auth.uid())
) with check (
  fn_es_direccion(auth.uid())
);

-- ---------------------------------------------------------------------
-- FORO — el espacio más abierto del sistema, a propósito. Cualquiera
-- autenticado (incluido Colaborador, que todavía no se enlistó en
-- ningún comando) puede abrir temas, comentar y apoyar propuestas: la
-- idea es que cualquiera pueda traer un problema concreto a debate sin
-- pedir permiso de estructura primero. Lo único con más control es
-- CERRAR un tema con conclusión/ruta de acción — eso lo puede hacer el
-- autor del tema, Dirección, o cualquier Líder (fn_es_lider_de_alguna),
-- para que la síntesis final tenga algo de curaduría y no cualquiera
-- pueda "cerrar" la idea de otra persona a mitad de debate.
-- ---------------------------------------------------------------------
create policy foro_temas_select on foro_temas for select using (auth.uid() is not null);

create policy foro_temas_insert on foro_temas for insert with check (
  auth.uid() is not null and autor_id = auth.uid()
);

create policy foro_temas_update on foro_temas for update using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
) with check (
  autor_id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
);

create policy foro_temas_delete on foro_temas for delete using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);

create policy foro_comentarios_select on foro_comentarios for select using (auth.uid() is not null);

create policy foro_comentarios_insert on foro_comentarios for insert with check (
  auth.uid() is not null and autor_id = auth.uid()
);

create policy foro_comentarios_delete on foro_comentarios for delete using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);

create policy foro_votos_select on foro_votos for select using (auth.uid() is not null);

create policy foro_votos_insert on foro_votos for insert with check (usuario_id = auth.uid());

create policy foro_votos_delete on foro_votos for delete using (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- AUDITORÍA — solo lectura, y solo Dirección. Se llena por trigger
-- (security definer), nunca por INSERT directo de un cliente.
-- ---------------------------------------------------------------------
create policy auditoria_select on auditoria for select using (
  fn_es_direccion(auth.uid())
);
