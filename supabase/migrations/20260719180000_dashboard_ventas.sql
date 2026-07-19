-- =====================================================================
-- Tekila Tours — Dashboard de ventas / margen / comisiones (Step 9.4)
-- =====================================================================
-- El owner necesita agregados de ventas por vendedor y rango de fechas:
-- nº de ventas, ingresos, comisiones y MARGEN (PP−PR). Pero `margen` y
-- `costo_total_pr` están REVOCADOS a `authenticated` (Capa 1, Step 9.5): un
-- query normal del panel no puede leerlos.
--
-- Patrón (idéntico a la vista `tarifas_admin`, Step 9.3a): una función
-- `security definer` corre con privilegio elevado (puede leer el margen) y:
--   - FILAS: solo devuelve algo si `is_admin()` (owner/staff; el vendedor
--     queda excluido → tabla vacía, sin fuga de agregados ajenos).
--   - MARGEN: se expone SOLO si `puede_ver_pr()` (owner siempre; staff no →
--     recibe `null`). El candado vive en la BD, no en la UI.
--
-- Regla No Negociable #5: el PR/margen nunca sale a quien no lo puede ver.
-- Nota: el lint de Supabase marcará esto como Security Definer — INTENCIONAL,
-- igual que `precio_desde_publico` y `tarifas_admin`.
--
-- Alcance del agregado:
--   - Solo reservas realizadas: estado in ('pagada','confirmada').
--   - Filtro por FECHA DE VENTA (`creado_en`), no la fecha del tour.
--   - Rango inclusivo de ambos extremos (p_desde 00:00 .. p_hasta 23:59).
--   - Agrupa por vendedor; las ventas web (vendedor_id null) caen en su
--     propia fila (vendedor_nombre null → la UI la muestra como "Web").
-- Reversible: `drop function dashboard_ventas(date, date)`.
-- =====================================================================

create or replace function dashboard_ventas(p_desde date, p_hasta date)
returns table (
  vendedor_id     uuid,
  vendedor_nombre text,
  num_ventas      bigint,
  ingresos        numeric,
  comisiones      numeric,
  margen          numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.vendedor_id,
    au.nombre                                  as vendedor_nombre,
    count(*)                                   as num_ventas,
    coalesce(sum(r.total), 0)                  as ingresos,
    coalesce(sum(r.comision_monto), 0)         as comisiones,
    case when puede_ver_pr()
         then coalesce(sum(r.margen), 0)
    end                                        as margen
  from reservas r
  left join admin_users au on au.id = r.vendedor_id
  where is_admin()
    and r.estado in ('pagada', 'confirmada')
    and r.creado_en >= p_desde
    and r.creado_en <  (p_hasta + 1)           -- inclusivo del día p_hasta
  group by r.vendedor_id, au.nombre
  order by ingresos desc;
$$;

-- Solo el personal autenticado la ejecuta; el gate real es is_admin() adentro.
revoke all on function dashboard_ventas(date, date) from public;
grant execute on function dashboard_ventas(date, date) to authenticated;
