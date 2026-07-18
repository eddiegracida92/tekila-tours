-- =====================================================================
-- Tekila Tours — Vista pública "precio desde" (Step 5)
-- Expone SOLO el Precio Público (pp) mínimo por tour y moneda. El Precio
-- Reporte (PR, costo) NUNCA se selecciona aquí → jamás llega a `anon`.
--
-- La vista corre como su DUEÑO (security_invoker = false, el default), por lo
-- que puede leer `tarifas` (bloqueada a `anon` por RLS) exponiendo únicamente
-- las columnas curadas de abajo. El público recibe SELECT sobre la vista, pero
-- NO sobre la tabla `tarifas` → el PR queda blindado igual que en el Step 4.
-- =====================================================================

create or replace view precio_desde_publico
  with (security_invoker = false) as
select
  t.id              as tour_id,
  ta.moneda         as moneda,
  min(ta.pp_adulto) as desde_adulto   -- Precio Público mínimo (nunca PR)
from tours t
join tarifas ta on ta.tour_id = t.id and ta.activo = true
where t.activo = true
group by t.id, ta.moneda;

-- El público puede leer la vista curada (nunca la tabla `tarifas` cruda).
grant select on precio_desde_publico to anon, authenticated;
