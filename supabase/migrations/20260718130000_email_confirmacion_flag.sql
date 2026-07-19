-- =====================================================================
-- Tekila Tours — Marca de correo de confirmación enviado (Step 8.3b)
-- Idempotencia del email: el webhook "toma" el derecho a enviar con un
-- UPDATE atómico (WHERE email_confirmacion_enviado IS NULL). Si el evento
-- de Stripe llega repetido, la marca ya está puesta y NO se reenvía.
-- Migración puramente aditiva.
-- =====================================================================
alter table reservas
  add column email_confirmacion_enviado timestamptz;
