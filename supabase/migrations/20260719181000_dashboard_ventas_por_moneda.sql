-- =====================================================================
-- Tekila Tours — Dashboard: separar agregados por MONEDA (Step 9.4)
-- =====================================================================
-- La versión anterior (20260719180000) sumaba `total`/`comision`/`margen` sin
-- separar por moneda. Como cada tarifa define su propia moneda (nacional puede
-- ser MXN y extranjero USD), esa suma mezclaba pesos y dólares en un solo
-- número sin sentido.
--
-- Fix: agrupar TAMBIÉN por `moneda`. Cada fila del resultado es (vendedor,
-- moneda) con sus totales exactos en esa moneda. La pantalla muestra los
-- totales por moneda por separado (esa es la verdad de lo cobrado); NO se
-- convierte entre monedas aquí (los precios salen de las tarifas; el reporte
-- solo agrega lo ya cobrado).
--
-- Cambia la firma de RETURNS TABLE (se añade la columna `moneda`), y Postgres
-- no permite alterar el tipo de retorno con create-or-replace → hay que DROP y
-- recrear. El gate de seguridad es idéntico al original: filas solo si
-- is_admin(); margen solo si puede_ver_pr(). Reversible: re-aplicar la 180000.
-- =====================================================================

drop function if exists dashboard_ventas(date, date);

create or replace function dashboard_ventas(p_desde date, p_hasta date)
returns table (
  vendedor_id     uuid,
  vendedor_nombre text,
  moneda          moneda_t,
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
    r.moneda,
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
  group by r.vendedor_id, au.nombre, r.moneda
  order by r.moneda, ingresos desc;
$$;

revoke all on function dashboard_ventas(date, date) from public;
grant execute on function dashboard_ventas(date, date) to authenticated;
