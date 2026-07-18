-- =====================================================================
-- Tekila Tours — Vendedores, comisiones y lista de marketing (Step 8.0)
-- Migración PURAMENTE ADITIVA previa a la primera reserva real (/api/checkout).
--   1) reservas: atribución de venta (canal/vendedor) + comisión congelada.
--   2) admin_users: rol 'vendedor' + config de comisión + permisos (jsonb).
--   3) email_suscriptores: lista de correo con consentimiento (opt-in) y baja.
--
-- NOTA DE SEGURIDAD (deuda para el Step 9.5): la RLS que AÍSLA a cada vendedor
-- (que solo vea SUS reservas y que NO vea el PR salvo permisos.puede_ver_pr) se
-- implementa junto con el login de vendedores en el Step 9.5. Hoy is_admin()
-- devuelve true para cualquier fila de admin_users; por eso NO se crea ninguna
-- cuenta con rol 'vendedor' hasta que exista esa RLS. El PR sigue blindado a
-- `anon`; esta migración no toca `tarifas` ni las policies del público.
-- =====================================================================

-- ---- Enums nuevos ----
-- Reutilizamos la semántica de promo_tipo_t pero con un enum propio: comisión y
-- promoción son dominios distintos y deben poder evolucionar por separado.
create type comision_tipo_t as enum ('porcentaje', 'monto');
create type canal_t as enum ('web', 'vendedor');
create type metodo_cobro_t as enum ('online', 'efectivo', 'terminal_externa');
create type suscriptor_estado_t as enum ('suscrito', 'baja');

-- Añade el rol 'vendedor' al enum existente (idempotente).
-- No se usa dentro de esta misma migración, así que es seguro aun si el runner
-- envuelve el archivo en una transacción (PG12+).
alter type admin_rol_t add value if not exists 'vendedor';

-- =====================================================================
-- 1) reservas — atribución de la venta + comisión congelada
-- =====================================================================
alter table reservas
  add column canal          canal_t        not null default 'web',
  add column vendedor_id     uuid           references admin_users (id),
  add column metodo_cobro    metodo_cobro_t,
  add column comision_tipo   comision_tipo_t,           -- snapshot al vender
  add column comision_valor  numeric(10, 2),            -- snapshot (% o monto)
  add column comision_monto  numeric(10, 2);            -- comisión calculada y CONGELADA

-- Dashboard del owner: ventas/comisiones por vendedor (solo filas atribuidas).
create index reservas_vendedor_idx on reservas (vendedor_id) where vendedor_id is not null;

-- =====================================================================
-- 2) admin_users — soporte de vendedores (rol ya extendido arriba)
-- =====================================================================
alter table admin_users
  add column nombre         text,
  add column activo         boolean          not null default true,
  add column comision_tipo  comision_tipo_t,            -- modelo de comisión del vendedor
  add column comision_valor numeric(10, 2),             -- % o monto según comision_tipo
  add column permisos       jsonb            not null default '{}';
-- permisos ej.: { "puede_descuentos": false, "ve_disponibilidad_todos": true, "puede_ver_pr": false }
-- El switch puede_ver_pr (default false) SOLO lo activa el owner y se aplica
-- server-side (RLS/API) en el Step 9.5 — nunca por ocultar en la UI.

-- =====================================================================
-- 3) email_suscriptores — lista de marketing (opt-in explícito + baja)
-- Independiente de reservas: capturar correo NO requiere cuenta. La captura
-- (checkout / newsletter) se hace SIEMPRE vía /api/* con service_role; el
-- público anónimo NO tiene acceso directo a esta tabla.
-- =====================================================================
create table email_suscriptores (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  nombre          text,
  idioma          text not null default 'es' check (idioma in ('es', 'en')),
  consentimiento  boolean not null default false,      -- obligatorio para enviar promos
  consent_origen  text,                                 -- 'checkout' / 'newsletter'
  consent_fecha   timestamptz,                          -- evidencia legal del opt-in
  estado          suscriptor_estado_t not null default 'suscrito',
  baja_fecha      timestamptz,
  token_baja      uuid not null default gen_random_uuid(),  -- link "cancelar suscripción"
  creado_en       timestamptz not null default now()
);

create index email_suscriptores_estado_idx on email_suscriptores (estado);
create unique index email_suscriptores_token_baja_idx on email_suscriptores (token_baja);

-- =====================================================================
-- RLS + GRANTs de la tabla nueva (las columnas nuevas de reservas/admin_users
-- heredan los grants de tabla ya existentes del Step 4).
-- Patrón idéntico al resto: anon SIN policy (deny-all); admin lee vía is_admin();
-- service_role (usado por /api/*) ignora RLS pero necesita el privilegio de tabla.
-- =====================================================================
alter table email_suscriptores enable row level security;

create policy email_suscriptores_admin_read on email_suscriptores
  for select to authenticated using (is_admin());
create policy email_suscriptores_admin_write on email_suscriptores
  for all to authenticated using (is_admin()) with check (is_admin());

grant select on email_suscriptores to authenticated;
grant all on email_suscriptores to service_role;
