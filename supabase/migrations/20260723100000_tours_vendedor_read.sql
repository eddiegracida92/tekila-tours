-- =====================================================================
-- Tekila Tours — Lectura de tours para vendedores (Step 9.5-portal)
-- =====================================================================
-- Un vendedor es `authenticated` pero NO `is_admin()` (owner/staff). Hoy `tours`
-- solo tiene policy de lectura para `anon` (activos) y para admin (is_admin), así
-- que un vendedor autenticado no matchea ninguna → lee 0 tours. Eso rompe el
-- punto de venta (no puede elegir tour) y deja sin nombre el tour en "mis ventas"
-- (el join `tours(nombre_es)` corre con su sesión).
--
-- Fix aditivo: `authenticated` puede leer los tours ACTIVOS — misma exposición
-- que ya tiene `anon`. Los admins siguen viendo TODOS vía `tours_admin_read`
-- (las policies SELECT se combinan con OR). No expone datos sensibles: el PR vive
-- en `tarifas` (bloqueada), no en `tours`.
-- =====================================================================

create policy tours_authenticated_read on tours
  for select to authenticated using (activo = true);
