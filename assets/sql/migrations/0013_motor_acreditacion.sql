-- =====================================================================
-- Migración 0013 — Etapa 8: Motor de acreditación de puntos
-- =====================================================================
-- Contexto: la migración 0012 dejó el CATÁLOGO de valores del Reglamento
-- de Puntajes (cuánto vale cada cosa), editable desde Configuración.
-- Esta migración es la que de verdad SUMA puntos: agrega los campos de
-- perfil que faltaban, extiende eventos para que sepan qué tipo de
-- actividad son y quién los organiza, y crea el libro mayor
-- (credit_events + ledger_movements) con los triggers que acreditan
-- automáticamente cuando:
--   1. Un miembro completa una sección de su perfil (PROFILE_*).
--   2. Se valida una lista de asistencia (ATTENDANCE_VALIDATED).
--   3. Se valida una entrega de resultados (RESULTS_DELIVERED).
--
-- Regla de oro (reglamento sección 2): SOLO se acredita si existe una
-- versión con status='VIGENTE'. Mientras el reglamento siga en BORRADOR
-- (que es su estado actual, ver migración 0012), estos triggers corren
-- pero no insertan nada — quedan probados y listos para el día que la
-- Directiva apruebe formalmente la versión.
--
-- Toda la lógica vive en funciones SECURITY DEFINER (triggers), nunca en
-- el cliente — mismo criterio ya establecido en schema.sql ("Nada de
-- lógica crítica en el cliente").
--
-- Ejecuta esto en el SQL Editor de Supabase, DESPUÉS de 0012. Es
-- idempotente (create table/policy if not exists + drop policy if
-- exists + create or replace function).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CAMPOS DE PERFIL que faltaban para el wizard "Completar perfil" y
--    para poder evaluar las condiciones PROFILE_TERRITORY / PROFILE_
--    EDUCATION_OCCUPATION / PROFILE_ABOUT.
-- ---------------------------------------------------------------------
alter table usuarios add column if not exists region text;
alter table usuarios add column if not exists provincia text;
alter table usuarios add column if not exists distrito text;
alter table usuarios add column if not exists formacion_academica text;
alter table usuarios add column if not exists ocupacion text;
alter table usuarios add column if not exists acerca_de_mi text;
alter table usuarios add column if not exists intereses_civicos text[];
comment on column usuarios.region is 'Territorio de residencia del miembro (distinto de comandos.region, que es el ámbito de un comando operativo). Alimenta PROFILE_TERRITORY.';

-- ---------------------------------------------------------------------
-- 2. EVENTOS — agrega tipo de actividad y comando (para eventos a nivel
--    subcomisión). nivel_organizador se deriva solo: si tiene comando_id
--    es 'subcomision'; si tiene comision_id (sin comando) es 'comision';
--    si no tiene ninguno es 'nacional' — igual criterio que alcance
--    'general' ya usado para comunicados/eventos de toda la organización.
-- ---------------------------------------------------------------------
alter table eventos add column if not exists comando_id uuid references comandos(id) on delete set null;
alter table eventos add column if not exists tipo_actividad tipo_actividad_puntaje;
alter table eventos add column if not exists cancelado boolean not null default false;

do $$ begin
  alter table eventos add column nivel_organizador nivel_organizador_puntaje
    generated always as (
      case when comando_id is not null then 'subcomision'::nivel_organizador_puntaje
           when comision_id is not null then 'comision'::nivel_organizador_puntaje
           else 'nacional'::nivel_organizador_puntaje end
    ) stored;
exception when duplicate_column then null; end $$;

comment on column eventos.tipo_actividad is 'Tipo de actividad para el motor de puntaje (territorial/virtual/presencial/hibrida/capacitacion/asamblea). NULL = evento no acreditable (ej. un simple recordatorio).';
comment on column eventos.nivel_organizador is 'Derivado automáticamente de quién organiza: comando_id → subcomisión, comision_id (sin comando) → comisión, ninguno → Directiva Nacional.';

-- ---------------------------------------------------------------------
-- 3. ASISTENCIA — listas cargadas por la autoridad del ámbito del
--    evento, auditadas y validadas (reglamento sección 8).
-- ---------------------------------------------------------------------
create table if not exists attendance_lists (
  list_id      uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references eventos(id) on delete cascade,
  uploaded_by  uuid references usuarios(id) on delete set null,
  audited_pct  numeric not null default 0 check (audited_pct >= 0 and audited_pct <= 100),
  validated_at timestamptz,
  validated_by uuid references usuarios(id) on delete set null,
  created_at   timestamptz not null default now()
);
comment on table attendance_lists is 'Una lista por evento. Se acredita puntaje recién cuando validated_at se llena (ver fn_acreditar_asistencia).';

create table if not exists attendance_entries (
  entry_id     uuid primary key default gen_random_uuid(),
  list_id      uuid not null references attendance_lists(list_id) on delete cascade,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  resolved_at  timestamptz not null default now(),
  unique (list_id, usuario_id)
);
create index if not exists idx_attendance_entries_usuario on attendance_entries(usuario_id);

-- ---------------------------------------------------------------------
-- 4. ENTREGA DE RESULTADOS — origen nuevo (RESULTS_DELIVERED).
-- ---------------------------------------------------------------------
create table if not exists result_deliveries (
  delivery_id   uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references eventos(id) on delete cascade,
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  evidence_ref  text not null,
  status        text not null default 'PENDIENTE' check (status in ('PENDIENTE','VALIDADO','RECHAZADO')),
  validated_by  uuid references usuarios(id) on delete set null,
  validated_at  timestamptz,
  motivo_rechazo text,
  created_at    timestamptz not null default now(),
  unique (evento_id, usuario_id)
);
comment on table result_deliveries is 'Un responsable entrega evidencia por evento; se acredita cuando status pasa a VALIDADO (ver fn_acreditar_resultado).';

-- ---------------------------------------------------------------------
-- 5. LIBRO MAYOR — credit_events (evento acreditable) + ledger_movements
--    (movimientos, inmutables). El saldo vive en member_score_balances y
--    SIEMPRE se recalcula sumando el libro, nunca se edita directo.
-- ---------------------------------------------------------------------
create table if not exists credit_events (
  credit_event_id  uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references usuarios(id) on delete cascade,
  rule_id          uuid not null references scoring_rules(rule_id),
  version_id       uuid not null references scoring_rule_versions(version_id),
  source_type      text not null check (source_type in ('attendance_entry','profile_section','result_delivery')),
  source_ref_id    uuid not null,
  idempotency_key  text not null,
  status           text not null default 'ACREDITADO' check (status in ('ACREDITADO','INVALIDADO')),
  evidence_ref     text,
  created_at       timestamptz not null default now(),
  unique (idempotency_key)
);
create index if not exists idx_credit_events_usuario on credit_events(usuario_id, created_at);
create index if not exists idx_credit_events_rule on credit_events(rule_id);

create table if not exists ledger_movements (
  movement_id        uuid primary key default gen_random_uuid(),
  credit_event_id    uuid not null references credit_events(credit_event_id) on delete cascade,
  usuario_id         uuid not null references usuarios(id) on delete cascade,
  amount             int not null,
  movement_type      text not null check (movement_type in ('CREDITO','REVERSO')),
  linked_movement_id uuid references ledger_movements(movement_id),
  version_id         uuid not null references scoring_rule_versions(version_id),
  reason             text,
  requested_by       uuid references usuarios(id) on delete set null,
  reviewed_by        uuid references usuarios(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_ledger_movements_usuario on ledger_movements(usuario_id, created_at);
comment on table ledger_movements is 'Inmutable: nunca se hace UPDATE/DELETE, solo INSERT. Un reverso es un movimiento nuevo con amount negativo, enlazado al original.';

create table if not exists member_score_balances (
  usuario_id       uuid primary key references usuarios(id) on delete cascade,
  balance          int not null default 0,
  score_reached_at timestamptz not null default now()
);
comment on table member_score_balances is 'Proyección del saldo por miembro. score_reached_at = última vez que cambió el saldo, para desempate en el ranking (reglamento sección 13.1).';

-- ---------------------------------------------------------------------
-- 6. HELPERS del motor
-- ---------------------------------------------------------------------

-- Versión VIGENTE actual (o NULL si ninguna lo está — mientras el
-- reglamento siga en BORRADOR, todo el motor queda inactivo a propósito).
create or replace function fn_version_vigente_id()
returns uuid language sql stable as $$
  select version_id from scoring_rule_versions where status = 'VIGENTE' limit 1;
$$;

-- Suma (o resta) al saldo de un miembro y refresca score_reached_at.
create or replace function fn_sumar_balance(p_usuario_id uuid, p_amount int)
returns void language plpgsql security definer as $$
begin
  insert into member_score_balances (usuario_id, balance, score_reached_at)
  values (p_usuario_id, p_amount, now())
  on conflict (usuario_id) do update
    set balance = member_score_balances.balance + excluded.balance,
        score_reached_at = now();
end;
$$;

-- Inserta un credit_event + su ledger_movement si la idempotency_key no
-- existe todavía. Devuelve true si acreditó, false si ya existía.
create or replace function fn_acreditar(
  p_usuario_id uuid, p_rule_id uuid, p_version_id uuid, p_source_type text,
  p_source_ref_id uuid, p_idempotency_key text, p_amount int, p_evidence_ref text default null
) returns boolean language plpgsql security definer as $$
declare v_credit_event_id uuid;
begin
  if p_amount is null or p_amount <= 0 then return false; end if;

  insert into credit_events (usuario_id, rule_id, version_id, source_type, source_ref_id, idempotency_key, evidence_ref)
  values (p_usuario_id, p_rule_id, p_version_id, p_source_type, p_source_ref_id, p_idempotency_key, p_evidence_ref)
  on conflict (idempotency_key) do nothing
  returning credit_event_id into v_credit_event_id;

  if v_credit_event_id is null then return false; end if; -- ya existía

  insert into ledger_movements (credit_event_id, usuario_id, amount, movement_type, version_id)
  values (v_credit_event_id, p_usuario_id, p_amount, 'CREDITO', p_version_id);

  perform fn_sumar_balance(p_usuario_id, p_amount);
  return true;
end;
$$;

-- Reverso manual de un crédito (uso de Dirección — sin UI propia todavía,
-- pensado para correrse desde el SQL Editor o una futura pantalla admin).
create or replace function fn_revertir_credito(p_credit_event_id uuid, p_motivo text, p_revisado_por uuid)
returns void language plpgsql security definer as $$
declare v_ce record;
begin
  select * into v_ce from credit_events where credit_event_id = p_credit_event_id and status = 'ACREDITADO';
  if not found then raise exception 'Crédito % no existe o ya fue invalidado', p_credit_event_id; end if;

  update credit_events set status = 'INVALIDADO' where credit_event_id = p_credit_event_id;

  insert into ledger_movements (credit_event_id, usuario_id, amount, movement_type, linked_movement_id, version_id, reason, reviewed_by)
  select p_credit_event_id, v_ce.usuario_id, -lm.amount, 'REVERSO', lm.movement_id, lm.version_id, p_motivo, p_revisado_por
  from ledger_movements lm where lm.credit_event_id = p_credit_event_id and lm.movement_type = 'CREDITO';

  perform fn_sumar_balance(v_ce.usuario_id, (
    select -amount from ledger_movements where credit_event_id = p_credit_event_id and movement_type = 'CREDITO' limit 1
  ));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. PERFIL — acredita PROFILE_* cuando la condición se cumple. Corre en
--    cada UPDATE de usuarios (barato: una fila, unos pocos SELECT
--    indexados) y también en el INSERT inicial (por si ya trae datos
--    precargados, ej. invitación masiva con dni).
-- ---------------------------------------------------------------------
create or replace function fn_acreditar_perfil()
returns trigger language plpgsql security definer as $$
declare
  v_version_id uuid;
  v_rule record;
begin
  v_version_id := fn_version_vigente_id();
  if v_version_id is null then return new; end if; -- reglamento sigue en BORRADOR

  -- PROFILE_ACCOUNT: se acredita cuando la cuenta queda 'activo' (aprobada).
  if new.estado = 'activo' then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_ACCOUNT';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_ACCOUNT|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_IDENTITY: nombre + DNI completos.
  if new.nombre is not null and new.dni is not null and length(trim(new.dni)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_IDENTITY';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_IDENTITY|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_TERRITORY: región + provincia + distrito.
  if new.region is not null and new.provincia is not null and new.distrito is not null then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_TERRITORY';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_TERRITORY|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_CONTACT: correo + teléfono.
  if new.email is not null and new.telefono is not null and length(trim(new.telefono)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_CONTACT';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_CONTACT|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_EDUCATION_OCCUPATION: formación + ocupación.
  if new.formacion_academica is not null and length(trim(new.formacion_academica)) > 0
     and new.ocupacion is not null and length(trim(new.ocupacion)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_EDUCATION_OCCUPATION';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_EDUCATION_OCCUPATION|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  -- PROFILE_ABOUT: biografía.
  if new.acerca_de_mi is not null and length(trim(new.acerca_de_mi)) > 0 then
    select rule_id into v_rule from scoring_rules where version_id = v_version_id and rule_code = 'PROFILE_ABOUT';
    if v_rule.rule_id is not null then
      perform fn_acreditar(new.id, v_rule.rule_id, v_version_id, 'profile_section', new.id,
        new.id || '|PROFILE_ABOUT|' || v_version_id,
        (select amount from rule_fixed_value where rule_id = v_rule.rule_id));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_acreditar_perfil on usuarios;
create trigger trg_acreditar_perfil
  after insert or update on usuarios
  for each row execute function fn_acreditar_perfil();

-- ---------------------------------------------------------------------
-- 8. ASISTENCIA — al validar una lista (validated_at pasa de NULL a un
--    valor), acredita ATTENDANCE_VALIDATED a cada persona de la lista,
--    respetando el tope mensual (period_cap_qty/period_cap_window).
-- ---------------------------------------------------------------------
create or replace function fn_acreditar_asistencia()
returns trigger language plpgsql security definer as $$
declare
  v_version_id uuid;
  v_rule record;
  v_evento record;
  v_amount int;
  v_entry record;
  v_ya_este_mes int;
begin
  if new.validated_at is null or old.validated_at is not null then return new; end if; -- solo en la transición a validado
  if new.audited_pct < 100 then
    raise exception 'No se puede validar una lista de asistencia con auditoría menor al 100%% (actual: %)', new.audited_pct;
  end if;

  v_version_id := fn_version_vigente_id();
  if v_version_id is null then return new; end if;

  select rule_id, period_cap_qty, period_cap_window into v_rule
  from scoring_rules where version_id = v_version_id and rule_code = 'ATTENDANCE_VALIDATED';
  if v_rule.rule_id is null then return new; end if;

  select tipo_actividad, nivel_organizador into v_evento from eventos where id = new.evento_id;
  if v_evento.tipo_actividad is null then return new; end if; -- evento no clasificado, no acreditable

  select amount into v_amount from rule_value_matrix
  where rule_id = v_rule.rule_id and tipo_actividad = v_evento.tipo_actividad and nivel_organizador = v_evento.nivel_organizador;
  if v_amount is null then return new; end if; -- "No aplica" esa combinación

  for v_entry in select * from attendance_entries where list_id = new.list_id loop
    if v_rule.period_cap_qty is not null and v_rule.period_cap_window = 'MONTH' then
      select count(*) into v_ya_este_mes from credit_events
      where usuario_id = v_entry.usuario_id and rule_id = v_rule.rule_id and status = 'ACREDITADO'
        and created_at >= date_trunc('month', now());
      if v_ya_este_mes >= v_rule.period_cap_qty then continue; end if; -- tope alcanzado, se salta esta entrada
    end if;

    perform fn_acreditar(v_entry.usuario_id, v_rule.rule_id, v_version_id, 'attendance_entry', v_entry.entry_id,
      v_entry.usuario_id || '|ATTENDANCE|' || new.evento_id || '|' || v_version_id, v_amount);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_acreditar_asistencia on attendance_lists;
create trigger trg_acreditar_asistencia
  after update on attendance_lists
  for each row execute function fn_acreditar_asistencia();

-- ---------------------------------------------------------------------
-- 9. ENTREGA DE RESULTADOS — al validar (status pasa a VALIDADO),
--    acredita RESULTS_DELIVERED = multiplicador × valor de asistencia
--    del mismo evento, con techo.
-- ---------------------------------------------------------------------
create or replace function fn_acreditar_resultado()
returns trigger language plpgsql security definer as $$
declare
  v_version_id uuid;
  v_rule_att record;
  v_rule_res record;
  v_mult record;
  v_evento record;
  v_base int;
  v_amount int;
begin
  if new.status is distinct from 'VALIDADO' or old.status = 'VALIDADO' then return new; end if;

  v_version_id := fn_version_vigente_id();
  if v_version_id is null then return new; end if;

  select rule_id into v_rule_att from scoring_rules where version_id = v_version_id and rule_code = 'ATTENDANCE_VALIDATED';
  select rule_id into v_rule_res from scoring_rules where version_id = v_version_id and rule_code = 'RESULTS_DELIVERED';
  if v_rule_att.rule_id is null or v_rule_res.rule_id is null then return new; end if;

  select tipo_actividad, nivel_organizador into v_evento from eventos where id = new.evento_id;
  if v_evento.tipo_actividad is null then return new; end if;

  select amount into v_base from rule_value_matrix
  where rule_id = v_rule_att.rule_id and tipo_actividad = v_evento.tipo_actividad and nivel_organizador = v_evento.nivel_organizador;
  if v_base is null then return new; end if;

  select multiplicador, techo into v_mult from rule_multiplier_value where rule_id = v_rule_res.rule_id;
  if v_mult.multiplicador is null then return new; end if;

  v_amount := round(v_base * v_mult.multiplicador);
  if v_mult.techo is not null and v_amount > v_mult.techo then v_amount := v_mult.techo; end if;

  perform fn_acreditar(new.usuario_id, v_rule_res.rule_id, v_version_id, 'result_delivery', new.delivery_id,
    new.usuario_id || '|RESULTS|' || new.evento_id || '|' || v_version_id, v_amount, new.evidence_ref);

  return new;
end;
$$;

drop trigger if exists trg_acreditar_resultado on result_deliveries;
create trigger trg_acreditar_resultado
  after update on result_deliveries
  for each row execute function fn_acreditar_resultado();

-- Inicializa member_score_balances en 0 para todo usuario que ya exista
-- (idempotente: on conflict do nothing).
insert into member_score_balances (usuario_id, balance)
select id, 0 from usuarios
on conflict (usuario_id) do nothing;
