-- =====================================================================
-- 0014_pais_usuarios.sql — Campo "país" en usuarios (wizard "Completar
-- perfil": selector de país sobre Región; Perú por defecto muestra los
-- selects del catálogo peruano, cualquier otro país vuelve región/
-- provincia/distrito en texto libre obligatorio — ver
-- assets/js/data/paises.js y views/completar-perfil.js).
--
-- Esto es lo que faltaba correr: el error
--   column usuarios_1.pais does not exist
-- al abrir Eventos → Ver detalle es porque este ALTER TABLE nunca se
-- ejecutó en la base de datos real — el selector de país en el wizard
-- de perfil es solo la mitad del trabajo (frontend); esta es la otra
-- mitad (la columna en Supabase). data/inscripciones.js hace un
-- SELECT ... usuarios(nombre, distrito, provincia, pais) para el
-- resumen de inscritos del módulo Eventos, y por eso el error salió
-- recién ahí y no antes.
--
-- Ejecuta esto en el SQL Editor de Supabase. Es idempotente (add
-- column if not exists) — no rompe nada si por error se corre dos veces.
-- =====================================================================

alter table usuarios add column if not exists pais text not null default 'Perú';
comment on column usuarios.pais is 'País de residencia del miembro. Perú por defecto. Determina si región/provincia/distrito se llenan con el catálogo peruano (selects) o como texto libre (otros países). No afecta al motor de puntaje.';
