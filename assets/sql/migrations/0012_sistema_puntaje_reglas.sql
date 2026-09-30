-- =====================================================================
-- Migración 0012 — Etapa 7: Sistema de Puntaje, reglas configurables
-- =====================================================================
-- Contexto: la Directiva Nacional aprobó (como propuesta técnica, aún
-- BORRADOR — ver más abajo) un "Reglamento de Puntajes" que define
-- cuántos puntos acredita cada acción de un miembro (completar su
-- perfil, asistir a actividades, entregar resultados). Esta migración
-- SOLO crea el catálogo de reglas y sus valores — el motor que
-- efectivamente calcula y acredita puntos (eventos, asistencia, entrega
-- de resultados, libro mayor/ledger) llega en la migración 0013. Se
-- separa a propósito en dos pasos, igual que el resto del historial de
-- migraciones de este proyecto (una migración = un cambio verificable).
--
-- Qué agrega:
--   1. Enums: estado_version_puntaje, tipo_actividad_puntaje,
--      nivel_organizador_puntaje.
--   2. scoring_rule_versions — una fila por versión del reglamento
--      (BORRADOR/VIGENTE/CERRADA), con acta, hash SHA-256 y vigencia.
--      Solo puede haber UNA versión VIGENTE a la vez (índice único
--      parcial).
--   3. scoring_rules — catálogo de orígenes de puntaje (PROFILE_*,
--      ATTENDANCE_VALIDATED, RESULTS_DELIVERED), uno por versión.
--   4. rule_fixed_value — monto fijo (reglas PROFILE_*).
--   5. rule_value_matrix — monto por tipo de actividad × nivel
--      organizador (regla ATTENDANCE_VALIDATED). amount NULL = "no
--      aplica" esa combinación (ej. actividad territorial a nivel
--      Nacional).
--   6. rule_multiplier_value — multiplicador + techo + plazo en días
--      (regla RESULTS_DELIVERED).
--   7. Semilla: versión '1.0.0-borrador.2' en estado BORRADOR con los
--      valores propuestos en PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md,
--      tal cual fueron aprobados por la Directiva para esta 1ª etapa.
--      Mientras la versión siga en BORRADOR, ningún valor acredita
--      puntos reales (así lo exige el reglamento, sección 2) — eso lo
--      hace cumplir el motor de la migración 0013, no esta migración.
--
-- CONTRIBUTION_RECONCILED y DOCUMENT_APPROVED (reglamento sección 9.1 y
-- 9.2) NO se cargan aquí: siguen inactivos y sin tabla propia — quedan
-- fuera de alcance de esta etapa a propósito, para no exceder lo que el
-- reglamento vigente autoriza.
--
-- Ejecuta esto en el SQL Editor de Supabase, DESPUÉS de schema.sql y
-- rls-policies.sql. Es idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
do $$ begin
  create type estado_version_puntaje as enum ('BORRADOR','VIGENTE','CERRADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_actividad_puntaje as enum ('territorial','virtual','presencial','hibrida','capacitacion','asamblea');
exception when duplicate_object then null; end $$;

do $$ begin
  create type nivel_organizador_puntaje as enum ('subcomision','comision','nacional');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. SCORING_RULE_VERSIONS — una fila por versión del reglamento de
--    puntajes. "Vigencia" en la UI de Configuración edita esta tabla.
-- ---------------------------------------------------------------------
create table if not exists scoring_rule_versions (
  version_id           uuid primary key default gen_random_uuid(),
  version_code         text not null unique,          -- ej. '1.0.0-borrador.2'
  document_hash_sha256  text,                          -- hash del reglamento aprobado (sección 2 y 16)
  approval_reference    text,                          -- acta o resolución de la Directiva
  approving_authority   text not null default 'Directiva Nacional',
  approved_at           timestamptz,
  effective_from        timestamptz,
  effective_until       timestamptz,
  status                estado_version_puntaje not null default 'BORRADOR',
  notas                 text,
  created_by            uuid references usuarios(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table scoring_rule_versions is 'Versiones del Reglamento de Puntajes. Mientras status=BORRADOR, ningún valor de sus reglas acredita puntos reales (lo hace cumplir el motor de acreditación, migración 0013).';

-- Solo una versión VIGENTE a la vez.
create unique index if not exists idx_una_version_vigente on scoring_rule_versions ((true)) where status = 'VIGENTE';

-- ---------------------------------------------------------------------
-- 2. SCORING_RULES — catálogo de orígenes de puntaje, por versión.
-- ---------------------------------------------------------------------
create table if not exists scoring_rules (
  rule_id                  uuid primary key default gen_random_uuid(),
  rule_code                text not null,               -- 'PROFILE_IDENTITY', 'ATTENDANCE_VALIDATED', 'RESULTS_DELIVERED'…
  origin_type              text not null,                -- 'PROFILE' | 'ATTENDANCE' | 'RESULTS'
  version_id               uuid not null references scoring_rule_versions(version_id) on delete cascade,
  etiqueta                 text not null,                -- nombre legible para la UI (ej. "Identidad")
  eligibility_condition     text not null,
  evidence_type            text not null,
  idempotency_key_template  text not null,
  period_cap_qty            int,                          -- NULL = sin tope
  period_cap_window         text,                         -- 'MONTH' | 'NONE'
  effective_from            timestamptz,
  effective_until           timestamptz,
  invalidation_condition    text not null default '',
  reversal_policy           text not null default '',
  notification_policy       text not null default '',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (version_id, rule_code)
);
comment on table scoring_rules is 'Catálogo de orígenes de puntaje del reglamento (sección 6), uno por versión de scoring_rule_versions.';

-- ---------------------------------------------------------------------
-- 3. RULE_FIXED_VALUE — monto único (reglas PROFILE_*).
-- ---------------------------------------------------------------------
create table if not exists rule_fixed_value (
  rule_id  uuid primary key references scoring_rules(rule_id) on delete cascade,
  amount   int not null check (amount >= 0)
);

-- ---------------------------------------------------------------------
-- 4. RULE_VALUE_MATRIX — monto por tipo de actividad × nivel
--    organizador (regla ATTENDANCE_VALIDATED). amount NULL = "no aplica".
-- ---------------------------------------------------------------------
create table if not exists rule_value_matrix (
  matrix_id         uuid primary key default gen_random_uuid(),
  rule_id           uuid not null references scoring_rules(rule_id) on delete cascade,
  tipo_actividad    tipo_actividad_puntaje not null,
  nivel_organizador nivel_organizador_puntaje not null,
  amount            int check (amount is null or amount >= 0),
  unique (rule_id, tipo_actividad, nivel_organizador)
);

-- ---------------------------------------------------------------------
-- 5. RULE_MULTIPLIER_VALUE — multiplicador + techo + plazo (regla
--    RESULTS_DELIVERED: monto = multiplicador × valor de asistencia del
--    mismo evento, con techo).
-- ---------------------------------------------------------------------
create table if not exists rule_multiplier_value (
  rule_id       uuid primary key references scoring_rules(rule_id) on delete cascade,
  multiplicador numeric not null check (multiplicador > 0),
  techo         int check (techo is null or techo >= 0),
  plazo_dias    int check (plazo_dias is null or plazo_dias >= 0)
);

create index if not exists idx_scoring_rules_version on scoring_rules(version_id);
create index if not exists idx_rule_value_matrix_rule on rule_value_matrix(rule_id);

-- ---------------------------------------------------------------------
-- 6. updated_at automático (reusa fn_set_updated_at de schema.sql).
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['scoring_rule_versions','scoring_rules'] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated_at on %1$s;
       create trigger trg_%1$s_updated_at before update on %1$s
       for each row execute function fn_set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. SEMILLA — propuesta técnica aprobada para la 1ª etapa (ver
--    PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md). Idempotente: si ya
--    existe la versión '1.0.0-borrador.2', no vuelve a insertar nada.
-- ---------------------------------------------------------------------
do $$
declare
  v_version_id uuid;
  v_rule_account uuid;
  v_rule_identity uuid;
  v_rule_territory uuid;
  v_rule_contact uuid;
  v_rule_education uuid;
  v_rule_about uuid;
  v_rule_attendance uuid;
  v_rule_results uuid;
begin
  select version_id into v_version_id from scoring_rule_versions where version_code = '1.0.0-borrador.2';

  if v_version_id is null then
    insert into scoring_rule_versions (version_code, status, notas)
    values ('1.0.0-borrador.2', 'BORRADOR', 'Semilla desde PROPUESTA_TECNICA_VALORES_PUNTAJE_NG.md — pendiente de acta, hash y fecha de vigencia (sección 8 del documento).')
    returning version_id into v_version_id;

    -- --- PROFILE_* ---------------------------------------------------
    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_ACCOUNT', 'PROFILE', v_version_id, 'Cuenta', 'Correo verificado + aceptaciones', 'Ninguna (automática)', 'usuario+PROFILE_ACCOUNT+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual si se detecta cuenta indebida', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_account;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_account, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_IDENTITY', 'PROFILE', v_version_id, 'Identidad', 'Nombres, apellidos y DNI completados', 'Autorizada por Dirección/Líder', 'usuario+PROFILE_IDENTITY+version', null, 'NONE', 'Si se corrige y deja de cumplir la condición', 'Reverso con motivo', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_identity;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_identity, 20);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_TERRITORY', 'PROFILE', v_version_id, 'Territorio', 'Región/provincia/distrito completados', 'Ninguna (automática)', 'usuario+PROFILE_TERRITORY+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_territory;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_territory, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_CONTACT', 'PROFILE', v_version_id, 'Contacto', 'Correo + teléfono completados', 'Automática (1er corte)', 'usuario+PROFILE_CONTACT+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_contact;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_contact, 10);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_EDUCATION_OCCUPATION', 'PROFILE', v_version_id, 'Formación y ocupación', 'Formación académica + ocupación completadas', 'Ninguna (automática)', 'usuario+PROFILE_EDUCATION_OCCUPATION+version', null, 'NONE', 'No aplica (evento único)', 'Reverso manual', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_education;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_education, 15);

    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('PROFILE_ABOUT', 'PROFILE', v_version_id, 'Acerca de mí', 'Biografía completada', 'Moderación posterior si es observada', 'usuario+PROFILE_ABOUT+version', null, 'NONE', 'Si es observada por moderación', 'Reverso con motivo', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_about;
    insert into rule_fixed_value (rule_id, amount) values (v_rule_about, 10);

    -- --- ATTENDANCE_VALIDATED -----------------------------------------
    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('ATTENDANCE_VALIDATED', 'ATTENDANCE', v_version_id, 'Asistencia validada', 'Presente en lista de asistencia auditada al 100% y validada', 'Lista de asistencia validada por la autoridad del nivel del evento', 'usuario+evento+version', 8, 'MONTH', 'Si la lista se invalida tras auditoría', 'Reverso automático si se invalida la lista', 'Notificar al miembro al acreditar')
    returning rule_id into v_rule_attendance;

    insert into rule_value_matrix (rule_id, tipo_actividad, nivel_organizador, amount) values
      (v_rule_attendance, 'territorial',   'subcomision', 10),
      (v_rule_attendance, 'territorial',   'comision',    15),
      (v_rule_attendance, 'territorial',   'nacional',    null),
      (v_rule_attendance, 'virtual',       'subcomision', 12),
      (v_rule_attendance, 'virtual',       'comision',    20),
      (v_rule_attendance, 'virtual',       'nacional',    35),
      (v_rule_attendance, 'presencial',    'subcomision', 15),
      (v_rule_attendance, 'presencial',    'comision',    25),
      (v_rule_attendance, 'presencial',    'nacional',    45),
      (v_rule_attendance, 'hibrida',       'subcomision', 14),
      (v_rule_attendance, 'hibrida',       'comision',    22),
      (v_rule_attendance, 'hibrida',       'nacional',    40),
      (v_rule_attendance, 'capacitacion',  'subcomision', 18),
      (v_rule_attendance, 'capacitacion',  'comision',    30),
      (v_rule_attendance, 'capacitacion',  'nacional',    50),
      (v_rule_attendance, 'asamblea',      'subcomision', null),
      (v_rule_attendance, 'asamblea',      'comision',    null),
      (v_rule_attendance, 'asamblea',      'nacional',    70);

    -- --- RESULTS_DELIVERED (origen nuevo, sección 4 de la propuesta) --
    insert into scoring_rules (rule_code, origin_type, version_id, etiqueta, eligibility_condition, evidence_type, idempotency_key_template, period_cap_qty, period_cap_window, invalidation_condition, reversal_policy, notification_policy)
    values ('RESULTS_DELIVERED', 'RESULTS', v_version_id, 'Entrega de resultados', 'Evidencia de resultado cargada y validada dentro del plazo desde el cierre del evento', 'Documento/informe de resultados referenciado (no se publica en el ranking)', 'responsable+evento+version', null, 'NONE', 'Si la evidencia es rechazada', 'Reverso con motivo, enlazado al crédito original', 'Notificar al responsable al validarse')
    returning rule_id into v_rule_results;
    insert into rule_multiplier_value (rule_id, multiplicador, techo, plazo_dias) values (v_rule_results, 2.5, 100, 7);
  end if;
end $$;
