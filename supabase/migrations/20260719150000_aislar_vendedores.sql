-- =====================================================================
-- Step 9.5 (seguridad) — Aislar vendedores por RLS
-- =====================================================================
-- Salda la deuda del Step 8.0: hoy `is_admin()` = "cualquier fila en
-- admin_users", así que un rol 'vendedor' autenticado sería tratado como
-- admin total (vería TODAS las reservas y la lista de marketing).
--
-- Estrategia: `is_admin()` pasa a significar "personal de GESTIÓN"
-- (owner o staff, activo). Como TODAS las policies del panel usan is_admin(),
-- este único cambio excluye a los vendedores de tours/tarifas/temporadas/
-- disponibilidad/promos/email_suscriptores/reservas de una sola vez. Luego se
-- añade el acceso PUNTUAL del vendedor: ver SOLO sus propias reservas.
--
-- No rompe nada actual: hoy solo existe el owner (rol 'owner'), que sigue
-- cumpliendo is_admin(). El PR ya estaba blindado en 9.3a (columnas revocadas +
-- vista tarifas_admin). Reversible: solo redefine una función y una policy.
-- =====================================================================

-- ---- is_admin() ahora = owner o staff activo (personal de gestión) ----
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where id = auth.uid() and rol in ('owner', 'staff') and activo
  );
$$;

-- ---- Reservas: owner/staff ven todas; el vendedor SOLO las suyas ----
drop policy if exists reservas_admin_read on reservas;
create policy reservas_read on reservas for select to authenticated
  using (is_admin() or vendedor_id = auth.uid());

-- La actualización de estados sigue siendo de gestión (is_admin = owner/staff):
-- `reservas_admin_update` ya usa is_admin(), así que hereda el nuevo alcance sin
-- cambios. El vendedor no edita reservas desde el panel; su registro de venta
-- (modo A) irá por /api con service_role en el portal de vendedores (9.5 UI).
