-- =====================================================================
-- Step 9.3b — Escritura de temporadas restringida al owner
-- =====================================================================
-- Las temporadas (rangos baja/alta) deciden QUÉ tarifa se aplica por fecha,
-- así que tocan los precios indirectamente. Alineado con la decisión de
-- tarifas ("solo el owner edita precios"), restringimos su escritura a
-- `is_owner()`. La LECTURA sigue abierta a cualquier admin (is_admin) y al
-- público (anon), que la necesita para el catálogo/pricing.
--
-- `disponibilidad` NO cambia: su escritura sigue en `is_admin()` (operación
-- diaria que un staff debe poder hacer: ajustar cupo, bloquear una fecha).
--
-- Reversible y sin tocar datos: solo intercambia la policy de escritura.
-- =====================================================================

drop policy if exists temporadas_admin_write on temporadas;

create policy temporadas_owner_write on temporadas for all to authenticated
  using (is_owner()) with check (is_owner());
