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

-- ---------------------------------------------------------------------
-- USUARIOS
-- Ver: uno mismo, Dirección, o alguien con quien comparte comisión
--      (para que el Directorio pueda mostrar nombres).
-- Editar: solo su propia fila (perfil), nunca es_direccion ni estado
--         (esos campos los cambia Dirección vía panel/soporte, no el propio usuario).
-- ---------------------------------------------------------------------
create policy usuarios_select on usuarios for select using (
  id = auth.uid()
  or fn_es_direccion(auth.uid())
  or fn_comparten_comando(auth.uid(), usuarios.id)
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
-- Ver: Dirección siempre; cualquiera que pertenezca a esa comisión.
-- Crear: Dirección, o Líder de esa comisión ("+ Crear comando operativo").
-- ---------------------------------------------------------------------
create policy comandos_select on comandos for select using (
  fn_es_direccion(auth.uid()) or fn_pertenece_comision(auth.uid(), comision_id)
);

create policy comandos_insert on comandos for insert with check (
  fn_es_direccion(auth.uid()) or fn_es_lider(auth.uid(), comision_id)
);

create policy comandos_update on comandos for update using (
  fn_es_direccion(auth.uid()) or fn_es_lider(auth.uid(), comision_id)
);

-- ---------------------------------------------------------------------
-- MEMBRESÍAS (= base del Directorio)
-- Ver: Dirección; Líder de esa comisión; Coordinador/secretario de
--      cualquier comando de esa comisión. Miembro y Colaborador NO ven
--      el directorio (privacidad de contactos, spec secc. 3 notas).
-- Crear/editar: Dirección, Líder de la comisión, o Coordinador (solo
--      puede agregar miembros a SU PROPIO comando).
-- ---------------------------------------------------------------------
create policy membresias_select on membresias for select using (
  usuario_id = auth.uid() -- uno siempre ve sus propias membresías (para saber su rol)
  or fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador_de_la_comision(auth.uid(), comando_id)
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
);

-- ---------------------------------------------------------------------
-- TAREAS
-- Ver: Dirección; Líder de la comisión; cualquiera que pertenezca a la
--      comisión del comando (transparencia lateral entre comandos hermanos).
-- Editar estado: Dirección; Líder de su comisión; Coordinador de su
--      propio comando; Miembro SOLO si la tarea está asignada a él/ella.
-- Crear: Dirección, Líder, Coordinador (no Miembro, según la UI actual).
-- ---------------------------------------------------------------------
create policy tareas_select on tareas for select using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_pertenece_comision(auth.uid(), fn_comision_de_comando(comando_id))
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
-- Ver: alcance general -> todo autenticado; alcance comisión -> Dirección
--      o quien pertenezca a esa comisión.
-- Crear: Dirección, Líder, Coordinador (igual que en la UI del calendario).
-- ---------------------------------------------------------------------
create policy eventos_select on eventos for select using (
  alcance = 'general'
  or fn_es_direccion(auth.uid())
  or fn_pertenece_comision(auth.uid(), comision_id)
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
-- Ver: igual que eventos. Publicar: solo Dirección y Líder (la spec no
-- da esta capacidad a Coordinador).
-- ---------------------------------------------------------------------
create policy comunicados_select on comunicados for select using (
  alcance = 'general'
  or fn_es_direccion(auth.uid())
  or fn_pertenece_comision(auth.uid(), comision_id)
);

create policy comunicados_insert on comunicados for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (alcance = 'general' and fn_es_direccion(auth.uid()))
);

-- ---------------------------------------------------------------------
-- ENLACES — biblioteca compartida entre TODAS las comisiones para
-- cualquiera que ya esté asignado (no para Colaborador sin comisión).
-- Publicar: Dirección, Líder, Coordinador.
-- ---------------------------------------------------------------------
create policy enlaces_select on enlaces for select using (
  fn_es_direccion(auth.uid())
  or (comision_id is null and fn_tiene_membresia(auth.uid()))
  or fn_pertenece_comision(auth.uid(), comision_id)
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
-- AUDITORÍA — solo lectura, y solo Dirección. Se llena por trigger
-- (security definer), nunca por INSERT directo de un cliente.
-- ---------------------------------------------------------------------
create policy auditoria_select on auditoria for select using (
  fn_es_direccion(auth.uid())
);
