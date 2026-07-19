-- =====================================================================
-- Tekila Tours — Candado del PR en tarifas + escritura owner-only (Step 9.3a)
-- =====================================================================
-- Regla No Negociable #5: el Precio Reporte (PR = costo) SOLO lo ve el owner y
-- los vendedores con el switch `permisos.puede_ver_pr` activado; aplicado
-- SERVER-SIDE (no ocultando en la UI). Dos capas:
--
--   Capa 1 (privilegio de columna): a `authenticated` se le REVOCA el SELECT de
--     las columnas `pr_adulto`/`pr_menor` de la tabla cruda. Así ningún admin
--     (ni accediendo directo a la API por fuera del panel) puede leer el PR de
--     `tarifas`. Siguen viendo el PP y lo demás.
--   Capa 2 (vista curada): la vista `tarifas_admin` corre como su dueña
--     (security_invoker = false → puede leer el PR) y lo expone SOLO si
--     `puede_ver_pr()`. El panel lee de esta vista.
--
-- Escritura de tarifas: SOLO owner (los precios son el corazón del negocio).
-- Nota: el lint de Supabase marcará `tarifas_admin` como "Security Definer View"
-- — es INTENCIONAL, igual que `precio_desde_publico`.
-- =====================================================================

-- ---- Helper: ¿este admin puede ver el PR? ----
create or replace function puede_ver_pr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_owner()
      or coalesce(
           (select (permisos ->> 'puede_ver_pr')::boolean
            from admin_users
            where id = auth.uid()),
           false);
$$;

-- ---- Escritura de tarifas: owner-only (reemplaza la policy is_admin) ----
drop policy if exists tarifas_admin_write on tarifas;
create policy tarifas_owner_write on tarifas for all to authenticated
  using (is_owner()) with check (is_owner());

-- ---- Capa 1: quitar el PR del alcance de lectura directo ----
-- Revocamos todo el SELECT y re-otorgamos columna por columna EXCEPTO el PR.
-- (La policy `tarifas_admin_read` sigue gateando las FILAS por is_admin();
--  esto gatea las COLUMNAS: el PR ya no es seleccionable en la tabla cruda.)
revoke select on tarifas from authenticated;
grant select (
  id, tour_id, audiencia, temporada, operador_variante, modalidad, moneda,
  pp_adulto, pp_menor, impuesto_adulto, impuesto_menor, impuesto_moneda,
  activo, notas
) on tarifas to authenticated;

-- ---- Capa 2: vista curada que expone el PR solo a quien puede verlo ----
create or replace view tarifas_admin
  with (security_invoker = false) as
select
  id, tour_id, audiencia, temporada, operador_variante, modalidad, moneda,
  pp_adulto, pp_menor,
  case when puede_ver_pr() then pr_adulto end as pr_adulto,
  case when puede_ver_pr() then pr_menor  end as pr_menor,
  impuesto_adulto, impuesto_menor, impuesto_moneda, activo, notas
from tarifas
where is_admin();

grant select on tarifas_admin to authenticated;
