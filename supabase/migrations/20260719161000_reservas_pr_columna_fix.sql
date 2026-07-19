-- =====================================================================
-- Step 9.5 (seguridad) — FIX del blindaje PR/margen en `reservas`
-- =====================================================================
-- La migración anterior (20260719160000) hizo `revoke select (costo_total_pr,
-- margen)` a `authenticated`, pero NO tuvo efecto: `reservas` tiene un GRANT
-- SELECT de TABLA COMPLETA a `authenticated` (rls.sql), y en Postgres ese
-- privilegio de relación domina sobre un revoke de columnas sueltas. Verificado
-- con una sesión de vendedor real: podía leer costo_total_pr/margen.
--
-- Patrón correcto (idéntico a `tarifas`, Step 9.3a): revocar TODO el SELECT de
-- la tabla y re-otorgarlo columna por columna EXCEPTO el PR (costo_total_pr) y
-- el margen. La policy `reservas_read` sigue gateando las FILAS (owner/staff
-- todas; vendedor solo las suyas); esto gatea las COLUMNAS.
--
-- Las columnas re-otorgadas son TODAS las de `reservas` menos costo_total_pr y
-- margen (lista verificada contra el esquema en la nube). El owner consultará
-- el margen vía service_role (o vista/función definer con puede_ver_pr) en 9.4.
--
-- No rompe nada: /api/checkout y el webhook escriben con service_role (ignora
-- GRANTs); el público nunca lee `reservas`.
-- =====================================================================

revoke select on reservas from authenticated;
grant select (
  id, folio, tour_id, fecha, audiencia, adultos, menores, zona_pickup, moneda,
  subtotal, impuestos, total, estado, cliente_nombre, cliente_email,
  cliente_telefono, datos_extra, idioma, provider, provider_ref, creado_en,
  actualizado_en, canal, vendedor_id, metodo_cobro, comision_tipo,
  comision_valor, comision_monto, email_confirmacion_enviado
) on reservas to authenticated;
