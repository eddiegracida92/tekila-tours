-- =====================================================================
-- Tekila Tours — Row Level Security (Step 4)
-- Principio: el rol `anon` (cliente público) SOLO lee contenido no
-- sensible. `tarifas` (con PR), `reservas`, `pagos`, `holds` y `promos`
-- NO son accesibles al público. El `service_role` (usado por /api/*)
-- ignora RLS. El panel admin (authenticated) usa is_admin().
-- =====================================================================

-- ---- Helpers de rol admin ----
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where id = auth.uid());
$$;

create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where id = auth.uid() and rol = 'owner');
$$;

-- ---- Habilitar RLS en todas las tablas ----
alter table tours enable row level security;
alter table tour_imagenes enable row level security;
alter table tarifas enable row level security;
alter table temporadas enable row level security;
alter table disponibilidad enable row level security;
alter table reservas enable row level security;
alter table holds enable row level security;
alter table pagos enable row level security;
alter table promos enable row level security;
alter table admin_users enable row level security;

-- =====================================================================
-- Lecturas públicas seguras (rol anon) — solo contenido no sensible
-- =====================================================================
create policy tours_public_read on tours
  for select to anon using (activo = true);

create policy imagenes_public_read on tour_imagenes
  for select to anon using (
    exists (select 1 from tours t where t.id = tour_id and t.activo = true)
  );

create policy disponibilidad_public_read on disponibilidad
  for select to anon using (true);

create policy temporadas_public_read on temporadas
  for select to anon using (true);

-- NOTA: `tarifas`, `reservas`, `holds`, `pagos`, `promos` y `admin_users`
-- NO tienen policy para `anon` → acceso denegado por defecto (RLS deny-all).
-- El precio se resuelve server-side (/api/quote con service_role).

-- =====================================================================
-- Panel admin (rol authenticated presente en admin_users)
-- Baseline Step 4: los admins pueden leer todo y gestionar contenido.
-- La distinción owner/staff y el ocultamiento del PR a staff se afinan
-- en el Step 9 (vía vista/endpoint sin columnas pr_*).
-- =====================================================================

-- Lectura para admins autenticados
create policy tours_admin_read on tours for select to authenticated using (is_admin());
create policy imagenes_admin_read on tour_imagenes for select to authenticated using (is_admin());
create policy tarifas_admin_read on tarifas for select to authenticated using (is_admin());
create policy temporadas_admin_read on temporadas for select to authenticated using (is_admin());
create policy disponibilidad_admin_read on disponibilidad for select to authenticated using (is_admin());
create policy reservas_admin_read on reservas for select to authenticated using (is_admin());
create policy holds_admin_read on holds for select to authenticated using (is_admin());
create policy pagos_admin_read on pagos for select to authenticated using (is_admin());
create policy promos_admin_read on promos for select to authenticated using (is_admin());

-- Gestión de contenido para admins (insert/update/delete)
create policy tours_admin_write on tours for all to authenticated
  using (is_admin()) with check (is_admin());
create policy imagenes_admin_write on tour_imagenes for all to authenticated
  using (is_admin()) with check (is_admin());
create policy tarifas_admin_write on tarifas for all to authenticated
  using (is_admin()) with check (is_admin());
create policy temporadas_admin_write on temporadas for all to authenticated
  using (is_admin()) with check (is_admin());
create policy disponibilidad_admin_write on disponibilidad for all to authenticated
  using (is_admin()) with check (is_admin());
create policy promos_admin_write on promos for all to authenticated
  using (is_admin()) with check (is_admin());

-- Reservas: los admins pueden actualizar estados (no insertar a mano)
create policy reservas_admin_update on reservas for update to authenticated
  using (is_admin()) with check (is_admin());

-- admin_users: cada admin ve su propia fila; el owner ve/gestiona todas
create policy admin_users_self_read on admin_users for select to authenticated
  using (id = auth.uid() or is_owner());
create policy admin_users_owner_write on admin_users for all to authenticated
  using (is_owner()) with check (is_owner());

-- =====================================================================
-- GRANTs de tabla (RLS restringe filas, pero el rol necesita ADEMÁS el
-- privilegio de tabla). En Supabase estos roles ya existen.
-- =====================================================================
grant usage on schema public to anon, authenticated, service_role;

-- Público (anon): SOLO lectura de contenido no sensible.
grant select on tours, tour_imagenes, disponibilidad, temporadas to anon;

-- Panel admin (authenticated): la RLS con is_admin() filtra las filas.
grant select on tours, tour_imagenes, disponibilidad, temporadas, reservas, holds, pagos to authenticated;
grant select, insert, update, delete
  on tours, tour_imagenes, tarifas, temporadas, disponibilidad, promos, admin_users to authenticated;
grant update on reservas to authenticated;

-- service_role (usado por /api/*): acceso total; además ignora RLS.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
