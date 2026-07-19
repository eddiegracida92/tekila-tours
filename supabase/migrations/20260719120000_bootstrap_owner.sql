-- =====================================================================
-- Tekila Tours — Bootstrap del primer owner (Step 9.1)
-- =====================================================================
-- El panel admin usa Supabase Auth; is_admin()/is_owner() consultan
-- `admin_users`. Esta migración inserta el PRIMER usuario de Supabase Auth
-- (el owner, creado a mano en el Dashboard) como fila `owner` en admin_users.
--
-- Por qué "el primer usuario de auth.users": en esta arquitectura SOLO
-- administradores y vendedores tienen cuenta de Auth — los clientes reservan
-- de forma anónima vía service_role. Por eso el usuario más antiguo de
-- auth.users es, sin ambigüedad, el owner de arranque. (Se evita hardcodear
-- el correo real en el repo.) Los demás admins/vendedores se crean después
-- desde el panel (Step 9.3), no aquí.
--
-- Idempotente: si ya existe la fila, solo garantiza rol='owner' y activo=true.
-- =====================================================================

insert into admin_users (id, rol, nombre, activo)
select id, 'owner', coalesce(raw_user_meta_data ->> 'name', 'Owner'), true
from auth.users
order by created_at asc
limit 1
on conflict (id) do update
  set rol = 'owner',
      activo = true;
