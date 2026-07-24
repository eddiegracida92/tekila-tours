-- =====================================================================
-- Tekila Tours — Columna `modalidad` en reservas (Step 10.0)
-- =====================================================================
-- Los tours reales (Dolphin Discovery, catamaranes) tienen varios PROGRAMAS
-- (modalidades: Encounter / Royal Connection / Sea Lion / Básico / VIP…) con
-- precio distinto. El motor de precios pasa a elegir la tarifa EXACTA por
-- `modalidad` + `moneda`; para saber QUÉ programa se vendió en cada reserva,
-- guardamos la modalidad elegida.
--
-- Aditiva y NULLABLE: las reservas viejas (y los tours de una sola tarifa, que
-- no mandan modalidad) quedan con NULL — no rompe nada. No toca RLS ni grants:
-- `modalidad` es un dato público (no es PR), hereda los permisos de columna ya
-- vigentes de `reservas` (Capa 1: solo `costo_total_pr`/`margen` están revocados).
-- =====================================================================

alter table reservas add column if not exists modalidad text;

comment on column reservas.modalidad is
  'Programa/modalidad de tarifa vendido (ej. Dolphin Encounter, Royal Connection). NULL en reservas previas o tours de tarifa única.';
