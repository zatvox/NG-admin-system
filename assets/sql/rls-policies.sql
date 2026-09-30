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

-- (2026-07-31) Candado de aprobación: ¿esta cuenta ya fue aprobada por un
-- líder ("activo")? Antes "estado" era 100% cosmético — ni siquiera
-- "suspendido" bloqueaba nada — así que cualquier persona que validara su
-- correo (incluida gente ajena al partido, en pruebas) entraba con permisos
-- de Colaborador y podía autoenlistarse en un comando sin que nadie la
-- aprobara. Ahora esta función es la que de verdad decide si alguien ve la
-- estructura interna (comisiones/comandos/tareas/foro/enlaces) o solo la
-- landing pública — Dirección siempre pasa, sin importar su "estado".
create or replace function fn_esta_activo(p_uid uuid)
returns boolean language sql stable security definer as $$
  select fn_es_direccion(p_uid) or coalesce(
    (select estado = 'activo' from usuarios where id = p_uid), false
  );
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
alter table flyers           enable row level security;
alter table scoring_rule_versions enable row level security;
alter table scoring_rules         enable row level security;
alter table rule_fixed_value      enable row level security;
alter table rule_value_matrix     enable row level security;
alter table rule_multiplier_value enable row level security;
alter table attendance_lists      enable row level security;
alter table attendance_entries    enable row level security;
alter table result_deliveries     enable row level security;
alter table credit_events         enable row level security;
alter table ledger_movements      enable row level security;
alter table member_score_balances enable row level security;
alter table event_inscripciones   enable row level security;

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
drop policy if exists membresias_update       on membresias;
drop policy if exists membresias_delete       on membresias;
drop policy if exists tareas_select           on tareas;
drop policy if exists tareas_insert           on tareas;
drop policy if exists tareas_update           on tareas;
drop policy if exists tareas_delete           on tareas;
drop policy if exists tarea_asignados_select  on tarea_asignados;
drop policy if exists tarea_asignados_write   on tarea_asignados;
drop policy if exists eventos_select          on eventos;
drop policy if exists eventos_insert          on eventos;
drop policy if exists eventos_update          on eventos;
drop policy if exists eventos_delete          on eventos;
drop policy if exists event_inscripciones_select on event_inscripciones;
drop policy if exists event_inscripciones_insert on event_inscripciones;
drop policy if exists event_inscripciones_update on event_inscripciones;
drop policy if exists event_inscripciones_delete on event_inscripciones;
drop policy if exists comunicados_select      on comunicados;
drop policy if exists comunicados_insert      on comunicados;
drop policy if exists comunicados_update      on comunicados;
drop policy if exists comunicados_delete      on comunicados;
drop policy if exists enlaces_select          on enlaces;
drop policy if exists enlaces_insert          on enlaces;
drop policy if exists enlaces_update          on enlaces;
drop policy if exists enlaces_delete          on enlaces;
drop policy if exists configuracion_select    on configuracion;
drop policy if exists configuracion_write     on configuracion;
drop policy if exists auditoria_select        on auditoria;
drop policy if exists foro_temas_select       on foro_temas;
drop policy if exists foro_temas_insert       on foro_temas;
drop policy if exists foro_temas_update       on foro_temas;
drop policy if exists foro_temas_delete       on foro_temas;
drop policy if exists flyers_select           on flyers;
drop policy if exists flyers_insert           on flyers;
drop policy if exists flyers_update           on flyers;
drop policy if exists flyers_delete           on flyers;
drop policy if exists foro_comentarios_select on foro_comentarios;
drop policy if exists foro_comentarios_insert on foro_comentarios;
drop policy if exists foro_comentarios_update on foro_comentarios;
drop policy if exists foro_comentarios_delete on foro_comentarios;
drop policy if exists foro_votos_select       on foro_votos;
drop policy if exists foro_votos_insert       on foro_votos;
drop policy if exists foro_votos_delete       on foro_votos;
drop policy if exists scoring_rule_versions_select on scoring_rule_versions;
drop policy if exists scoring_rule_versions_write  on scoring_rule_versions;
drop policy if exists scoring_rules_select         on scoring_rules;
drop policy if exists scoring_rules_write          on scoring_rules;
drop policy if exists rule_fixed_value_select      on rule_fixed_value;
drop policy if exists rule_fixed_value_write       on rule_fixed_value;
drop policy if exists rule_value_matrix_select     on rule_value_matrix;
drop policy if exists rule_value_matrix_write      on rule_value_matrix;
drop policy if exists rule_multiplier_value_select on rule_multiplier_value;
drop policy if exists rule_multiplier_value_write  on rule_multiplier_value;
drop policy if exists attendance_lists_select   on attendance_lists;
drop policy if exists attendance_lists_write    on attendance_lists;
drop policy if exists attendance_entries_select on attendance_entries;
drop policy if exists attendance_entries_write  on attendance_entries;
drop policy if exists result_deliveries_select  on result_deliveries;
drop policy if exists result_deliveries_insert  on result_deliveries;
drop policy if exists result_deliveries_update  on result_deliveries;
drop policy if exists credit_events_select      on credit_events;
drop policy if exists ledger_movements_select   on ledger_movements;
drop policy if exists member_score_balances_select on member_score_balances;

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
-- (2026-07-31) Antes CUALQUIER autenticado podía leer la tabla usuarios
-- COMPLETA (nombre, correo, teléfono, DNI de todos) — no había Directorio
-- todavía cuando se escribió esto. Ahora que el Directorio es el panel
-- donde un Líder aprueba/suspende cuentas y necesita ver a TODOS
-- (incluida la gente pendiente de aprobar, que por definición no comparte
-- comando con nadie), se restringe a: tu propia fila (perfil/login),
-- Dirección, cualquier Líder, o alguien con quien compartes comando (caso
-- de uso original: nombres de compañeros de equipo en el tablero).
create policy usuarios_select on usuarios for select using (
  id = auth.uid()
  or fn_es_direccion(auth.uid())
  or fn_es_lider_de_alguna(auth.uid())
  or fn_comparten_comando(auth.uid(), id)
);

-- (2026-07-31) Se agrega "fn_es_lider_de_alguna" — un Líder necesita poder
-- cambiar el "estado" (aprobar de pendiente_activacion → activo, o
-- suspender) de CUALQUIER usuario, no solo Dirección como antes. RLS por
-- filas no puede restringir POR COLUMNA (que un Líder solo toque "estado"
-- y nunca "es_direccion"), así que eso se refuerza aparte con un trigger
-- (fn_proteger_es_direccion, ver abajo) que revierte cualquier intento de
-- cambiar es_direccion desde alguien que no sea Dirección.
create policy usuarios_update_propio on usuarios for update using (
  id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
) with check (
  id = auth.uid() or fn_es_direccion(auth.uid()) or fn_es_lider_de_alguna(auth.uid())
);

-- Refuerzo de columna: ni un Líder ni la propia persona pueden otorgarse
-- (ni quitarse entre ellos) el rol de Dirección General editando su fila de
-- "usuarios" — eso sigue siendo estrictamente manual, vía SQL de Dirección.
create or replace function fn_proteger_es_direccion()
returns trigger language plpgsql security definer as $$
begin
  if new.es_direccion is distinct from old.es_direccion and not fn_es_direccion(auth.uid()) then
    new.es_direccion := old.es_direccion;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_es_direccion on usuarios;
create trigger trg_proteger_es_direccion
  before update on usuarios
  for each row execute function fn_proteger_es_direccion();

-- ---------------------------------------------------------------------
-- COMISIONES — info general visible para todos los autenticados (la spec
-- dice que el detalle de comisión es "información general de la
-- organización" aunque los comandos ajenos se vean deshabilitados).
-- Editar: Dirección siempre; Líder solo su propia comisión (misión, etc.).
-- ---------------------------------------------------------------------
-- (2026-07-31) Antes cualquier autenticado veía esto (incluida gente
-- pendiente de aprobar). Ahora hace falta fn_esta_activo — ver comentario
-- de esa función más arriba.
create policy comisiones_select on comisiones for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

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
  auth.uid() is not null and fn_esta_activo(auth.uid())
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
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

create policy membresias_insert on membresias for insert with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
  or (usuario_id = auth.uid() and rol = 'miembro') -- auto-enlistamiento: cualquier persona autenticada puede sumarse a un comando como Miembro (botón "Enlistarse" / "Unirme a este comando")
);

-- (2026-07-27) Cambiar el ROL de una membresía ya existente (ej. ascender
-- a un Miembro a Coordinador/Secretario/a) — antes NO había política de
-- UPDATE en esta tabla, así que la única forma de asignar un coordinador
-- era una sentencia SQL manual. Mismo alcance que insert/delete: Dirección,
-- Líder de la comisión, o Coordinador de ESE MISMO comando (un Coordinador
-- puede nombrar Secretario/a de apoyo dentro de su propio comando, pero no
-- tocar membresías de otros comandos).
create policy membresias_update on membresias for update using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
) with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
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
-- Eliminar: Dirección, Líder de la comisión, Coordinador del comando —
--      un Miembro asignado NUNCA puede borrar la tarea, solo cambiar su
--      estado (ver tareas_update).
-- ---------------------------------------------------------------------
create policy tareas_select on tareas for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

create policy tareas_insert on tareas for insert with check (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
);

-- (2026-07-27) "asignado_id = auth.uid()" quedó DEPRECADO desde que existe
-- tarea_asignados (multi-asignado, ver schema.sql 5.1) — crearTarea() ya
-- no escribe esa columna, así que un Miembro asignado por el mecanismo
-- nuevo nunca cumplía esta condición y, en el borde, podía terminar sin
-- poder cambiar el estado de su propia tarea. Se reemplaza por un EXISTS
-- contra tarea_asignados, que es la fuente de verdad real hoy.
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

create policy tareas_delete on tareas for delete using (
  fn_es_direccion(auth.uid())
  or fn_es_lider(auth.uid(), fn_comision_de_comando(comando_id))
  or fn_es_coordinador(auth.uid(), comando_id)
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
-- (2026-07-31) "general" queda visible para cualquier autenticado (incluida
-- gente pendiente de aprobar — son las "noticias" que se muestran en la
-- landing pública). Lo de una comisión puntual sí exige estar aprobado.
-- (2026-09-30) Migración 0015: se agrega la rama "inscripcion_publica" —
-- un evento con el link/QR de inscripción activo tiene que poder verse
-- desde inscripcion.html por CUALQUIER cuenta autenticada, incluida una
-- "pendiente" recién creada (no solo alcance='general' ni solo activos),
-- porque el objetivo explícito de esta función es también captar gente
-- nueva. No expone nada de otros eventos: sigue exigiendo sesión y solo
-- abre esta rama para el evento puntual que activó el link.
create policy eventos_select on eventos for select using (
  auth.uid() is not null and (
    alcance = 'general' or fn_esta_activo(auth.uid())
    or (inscripcion_publica and codigo_publico is not null and not cancelado)
  )
);

-- (2026-07-30) La rama "comision_id is null and fn_es_lider_de_alguna(...)"
-- es nueva: antes SOLO Dirección podía publicar con alcance "general"
-- (comision_id null) — un Líder únicamente podía publicar dentro de su
-- propia comisión. Ahora cualquier Líder puede elegir "General" también,
-- visible para toda la organización, igual que un comunicado de Dirección.
create policy eventos_insert on eventos for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

-- (2026-07-27) update/delete: antes NO EXISTÍAN — un evento publicado por
-- error se quedaba ahí para siempre. Mismo alcance que insert (quien
-- podía crearlo, puede corregirlo o borrarlo).
create policy eventos_update on eventos for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

create policy eventos_delete on eventos for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = eventos.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

-- ---------------------------------------------------------------------
-- COMUNICADOS
-- Ver: (2026-07-25) cualquier autenticado, mismo criterio de "ver todo".
-- Publicar: solo Dirección y Líder (la spec no da esta capacidad a Coordinador).
-- ---------------------------------------------------------------------
-- (2026-07-31) Mismo criterio que eventos_select: "general" es la noticia
-- pública, visible aunque no estés aprobado todavía.
create policy comunicados_select on comunicados for select using (
  auth.uid() is not null and (alcance = 'general' or fn_esta_activo(auth.uid()))
);

-- (2026-07-30) Antes "alcance = 'general'" solo lo dejaba pasar a Dirección
-- — ahora cualquier Líder también puede publicar "general" (visible a toda
-- la organización), no solo dentro de su propia comisión.
create policy comunicados_insert on comunicados for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (alcance = 'general' and fn_es_lider_de_alguna(auth.uid()))
);

-- (2026-07-27) update/delete: mismo alcance que insert.
create policy comunicados_update on comunicados for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

create policy comunicados_delete on comunicados for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and fn_es_lider(auth.uid(), comision_id))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

-- ---------------------------------------------------------------------
-- ENLACES — biblioteca compartida. (2026-07-25) visible para cualquier
-- autenticado, esté o no asignado a un comando — mismo criterio de
-- "ver todo" de arriba (antes requería fn_tiene_membresia para los
-- enlaces generales, ahora ni eso hace falta).
-- Publicar: Dirección, Líder, Coordinador.
-- ---------------------------------------------------------------------
create policy enlaces_select on enlaces for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

-- (2026-07-30) Rama nueva: "comision_id is null and fn_es_lider_de_alguna"
-- — un Coordinador NO puede publicar "general" (sigue atado a su comisión),
-- solo Dirección o cualquier Líder pueden.
create policy enlaces_insert on enlaces for insert with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

-- (2026-07-27) update/delete: mismo alcance que insert.
create policy enlaces_update on enlaces for update using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
) with check (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
);

create policy enlaces_delete on enlaces for delete using (
  fn_es_direccion(auth.uid())
  or (comision_id is not null and (
        fn_es_lider(auth.uid(), comision_id)
        or exists (select 1 from membresias m join comandos c on c.id = m.comando_id
                    where m.usuario_id = auth.uid() and c.comision_id = enlaces.comision_id
                      and m.rol in ('coordinador','secretario'))
     ))
  or (comision_id is null and fn_es_lider_de_alguna(auth.uid()))
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
-- SISTEMA DE PUNTAJE — catálogo de reglas (scoring_rule_versions,
-- scoring_rules, rule_fixed_value, rule_value_matrix,
-- rule_multiplier_value). Ver: cualquier autenticado (transparencia del
-- reglamento — cualquier miembro puede consultar cuánto vale cada
-- acción, igual criterio que "configuracion"). Editar: exclusivo de
-- Dirección, es la única autoridad que puede aprobar/ajustar el
-- reglamento (sección 2 y 16 del reglamento de puntajes).
-- ---------------------------------------------------------------------
create policy scoring_rule_versions_select on scoring_rule_versions for select using (
  auth.uid() is not null
);
create policy scoring_rule_versions_write on scoring_rule_versions for all using (
  fn_es_direccion(auth.uid())
) with check (
  fn_es_direccion(auth.uid())
);

create policy scoring_rules_select on scoring_rules for select using (
  auth.uid() is not null
);
create policy scoring_rules_write on scoring_rules for all using (
  fn_es_direccion(auth.uid())
) with check (
  fn_es_direccion(auth.uid())
);

create policy rule_fixed_value_select on rule_fixed_value for select using (
  auth.uid() is not null
);
create policy rule_fixed_value_write on rule_fixed_value for all using (
  fn_es_direccion(auth.uid())
) with check (
  fn_es_direccion(auth.uid())
);

create policy rule_value_matrix_select on rule_value_matrix for select using (
  auth.uid() is not null
);
create policy rule_value_matrix_write on rule_value_matrix for all using (
  fn_es_direccion(auth.uid())
) with check (
  fn_es_direccion(auth.uid())
);

create policy rule_multiplier_value_select on rule_multiplier_value for select using (
  auth.uid() is not null
);
create policy rule_multiplier_value_write on rule_multiplier_value for all using (
  fn_es_direccion(auth.uid())
) with check (
  fn_es_direccion(auth.uid())
);

-- ---------------------------------------------------------------------
-- MOTOR DE ACREDITACIÓN (migración 0013): asistencia, entrega de
-- resultados, y el libro mayor (credit_events/ledger_movements/
-- member_score_balances). "Organizador del evento" = Dirección, el
-- Líder de la comisión que lo organiza, o el Coordinador del comando
-- (si es a nivel subcomisión) — mismo criterio ya usado en eventos_*.
-- ---------------------------------------------------------------------
create policy attendance_lists_select on attendance_lists for select using (
  fn_esta_activo(auth.uid())
);
create policy attendance_lists_write on attendance_lists for all using (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = attendance_lists.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
) with check (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = attendance_lists.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);

create policy attendance_entries_select on attendance_entries for select using (
  fn_esta_activo(auth.uid())
);
create policy attendance_entries_write on attendance_entries for all using (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from attendance_lists al join eventos ev on ev.id = al.evento_id
    where al.list_id = attendance_entries.list_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
) with check (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from attendance_lists al join eventos ev on ev.id = al.evento_id
    where al.list_id = attendance_entries.list_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);

-- ---------------------------------------------------------------------
-- EVENT_INSCRIPCIONES (migración 0015) — autoservicio desde el link/QR
-- público. Distinto de attendance_entries: acá cualquier cuenta
-- autenticada (incluida "pendiente") inserta SU PROPIA fila; ver todas
-- las de un evento es del organizador o Dirección, igual criterio que
-- attendance_lists_write. No requiere fn_esta_activo a propósito — el
-- objetivo es también captar gente que recién se registra.
-- ---------------------------------------------------------------------
create policy event_inscripciones_select on event_inscripciones for select using (
  usuario_id = auth.uid()
  or fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = event_inscripciones.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);

create policy event_inscripciones_insert on event_inscripciones for insert with check (
  usuario_id = auth.uid()
  and exists (
    select 1 from eventos ev where ev.id = event_inscripciones.evento_id
      and ev.inscripcion_publica and not ev.cancelado
  )
);

-- Solo para que uno mismo pueda "cancelar" su inscripción (estado ->
-- 'cancelado'), nunca para tocar la fila de otra persona.
create policy event_inscripciones_update on event_inscripciones for update using (
  usuario_id = auth.uid()
) with check (
  usuario_id = auth.uid()
);

create policy event_inscripciones_delete on event_inscripciones for delete using (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = event_inscripciones.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);

-- Entrega de resultados: cualquier activo sube LA SUYA; ver/validar es de
-- Dirección, el organizador del evento, o el propio responsable (para
-- que pueda ver el estado de lo que entregó).
create policy result_deliveries_select on result_deliveries for select using (
  usuario_id = auth.uid()
  or fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = result_deliveries.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);
create policy result_deliveries_insert on result_deliveries for insert with check (
  usuario_id = auth.uid() and fn_esta_activo(auth.uid())
);
create policy result_deliveries_update on result_deliveries for update using (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = result_deliveries.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
) with check (
  fn_es_direccion(auth.uid())
  or exists (
    select 1 from eventos ev where ev.id = result_deliveries.evento_id
      and (fn_es_lider(auth.uid(), ev.comision_id) or (ev.comando_id is not null and fn_es_coordinador(auth.uid(), ev.comando_id)))
  )
);

-- Libro mayor: solo lectura desde el cliente (los INSERT los hacen los
-- triggers, vía SECURITY DEFINER, que no pasan por RLS). Cada quien ve
-- SU propio historial; Dirección ve el de todos (para auditar/revertir).
create policy credit_events_select on credit_events for select using (
  usuario_id = auth.uid() or fn_es_direccion(auth.uid())
);
create policy ledger_movements_select on ledger_movements for select using (
  usuario_id = auth.uid() or fn_es_direccion(auth.uid())
);
-- Saldo: cada quien ve el suyo; para el Ranking (que muestra a todos, con
-- identidad enmascarada salvo la fila propia) cualquier activo puede leer
-- todos los saldos — el enmascarado de "quién es quién" lo hace el
-- cliente al pintar la tabla, igual que el resto de la UI de este
-- proyecto (ningún dato de contacto/DNI viaja en esa consulta).
create policy member_score_balances_select on member_score_balances for select using (
  fn_esta_activo(auth.uid())
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
create policy foro_temas_select on foro_temas for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

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

create policy foro_comentarios_select on foro_comentarios for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

create policy foro_comentarios_insert on foro_comentarios for insert with check (
  auth.uid() is not null and autor_id = auth.uid()
);

-- (2026-07-27) Antes faltaba esta política: el autor de un comentario no
-- podía corregir una errata ni Dirección moderar el texto, solo borrarlo
-- por completo. Mismo criterio que el delete: autor propio o Dirección.
create policy foro_comentarios_update on foro_comentarios for update using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
) with check (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);

create policy foro_comentarios_delete on foro_comentarios for delete using (
  autor_id = auth.uid() or fn_es_direccion(auth.uid())
);

create policy foro_votos_select on foro_votos for select using (
  auth.uid() is not null and fn_esta_activo(auth.uid())
);

create policy foro_votos_insert on foro_votos for insert with check (usuario_id = auth.uid());

create policy foro_votos_delete on foro_votos for delete using (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- FLYERS — landing pública (index.html). Ver: cualquier autenticado (así
-- lo ve tanto quien está "pendiente" de aprobación como cualquier miembro
-- ya activo) siempre que esté "activo=true"; Dirección además ve los
-- inactivos (para poder revisarlos/republicarlos). Publicar: exclusivo de
-- Dirección — es la cara pública de la organización.
-- ---------------------------------------------------------------------
create policy flyers_select on flyers for select using (
  auth.uid() is not null and (activo or fn_es_direccion(auth.uid()))
);

create policy flyers_insert on flyers for insert with check (fn_es_direccion(auth.uid()));

create policy flyers_update on flyers for update using (fn_es_direccion(auth.uid())) with check (fn_es_direccion(auth.uid()));

create policy flyers_delete on flyers for delete using (fn_es_direccion(auth.uid()));

-- ---------------------------------------------------------------------
-- AUDITORÍA — solo lectura, y solo Dirección. Se llena por trigger
-- (security definer), nunca por INSERT directo de un cliente.
-- ---------------------------------------------------------------------
create policy auditoria_select on auditoria for select using (
  fn_es_direccion(auth.uid())
);
