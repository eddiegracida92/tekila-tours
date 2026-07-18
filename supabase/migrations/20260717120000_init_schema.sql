-- =====================================================================
-- Tekila Tours — Esquema inicial (Step 4)
-- Tablas, enums, índices y triggers. RLS y RPC en migraciones aparte.
-- Modelo: tour (contenido) ≠ tarifas (matriz de precios) ≠ disponibilidad.
-- =====================================================================

-- ---- Enums ----
create type audiencia_t as enum ('extranjero', 'nacional');
create type temporada_t as enum ('unica', 'baja', 'alta');
create type moneda_t as enum ('USD', 'MXN');
create type reserva_estado_t as enum (
  'pendiente', 'pago_iniciado', 'pagada', 'confirmada',
  'cancelada', 'reembolsada', 'expirada'
);
create type hold_estado_t as enum ('activo', 'consumido', 'expirado');
create type pago_estado_t as enum ('iniciado', 'aprobado', 'rechazado', 'reembolsado');
create type promo_tipo_t as enum ('porcentaje', 'monto');
create type admin_rol_t as enum ('owner', 'staff');

-- ---- Helper: actualizar columna actualizado_en ----
create or replace function set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- =====================================================================
-- tours — contenido y logística de cada experiencia
-- =====================================================================
create table tours (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre_es text not null,
  nombre_en text not null,
  categoria_es text,
  categoria_en text,
  operador text,
  grupo_xcaret boolean not null default false,
  desc_corta_es text,
  desc_corta_en text,
  desc_larga_es text,
  desc_larga_en text,
  duracion text,
  dias_operacion text[] default '{}',
  horarios_salida text,
  incluye_transporte boolean not null default false,
  punto_salida text,
  incluye_es text[] default '{}',
  incluye_en text[] default '{}',
  no_incluye_es text[] default '{}',
  no_incluye_en text[] default '{}',
  que_llevar_es text,
  que_llevar_en text,
  mostrar_que_llevar boolean not null default false,
  restricciones_es text,
  restricciones_en text,
  mostrar_restricciones boolean not null default false,
  edad_menor_min int,
  edad_menor_max int,
  capacidad_min int not null default 1,
  capacidad_max int not null default 50,
  anticipacion_horas int not null default 24,
  corte_horario time,
  solo_prepago boolean not null default false,
  impuesto_online boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  imagen_principal text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index tours_activo_orden_idx on tours (activo, orden);

create trigger tours_set_actualizado
  before update on tours
  for each row execute function set_actualizado_en();

-- =====================================================================
-- tour_imagenes — galería (1-N)
-- =====================================================================
create table tour_imagenes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  url text not null,
  alt_es text,
  alt_en text,
  orden int not null default 0
);

create index tour_imagenes_tour_idx on tour_imagenes (tour_id, orden);

-- =====================================================================
-- tarifas — matriz de precios (N por tour). CONTIENE PR (confidencial).
-- =====================================================================
create table tarifas (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  audiencia audiencia_t not null,
  temporada temporada_t not null default 'unica',
  operador_variante text,
  modalidad text,
  moneda moneda_t not null,
  pp_adulto numeric(10, 2) not null,
  pp_menor numeric(10, 2),
  pr_adulto numeric(10, 2) not null, -- Precio Reporte (costo) — NUNCA público
  pr_menor numeric(10, 2),
  impuesto_adulto numeric(10, 2) not null default 0,
  impuesto_menor numeric(10, 2) not null default 0,
  impuesto_moneda moneda_t,
  activo boolean not null default true,
  notas text
);

create index tarifas_tour_idx on tarifas (tour_id, activo);

-- =====================================================================
-- temporadas — rangos de fecha (Grupo Xcaret)
-- =====================================================================
create table temporadas (
  id uuid primary key default gen_random_uuid(),
  tipo temporada_t not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  etiqueta text,
  check (fecha_fin >= fecha_inicio)
);

create index temporadas_rango_idx on temporadas (fecha_inicio, fecha_fin);

-- =====================================================================
-- disponibilidad — cupo por tour y fecha
-- =====================================================================
create table disponibilidad (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  fecha date not null,
  cupo_total int, -- null = ilimitado (sujeto a confirmación)
  cupo_reservado int not null default 0,
  bloqueada boolean not null default false,
  unique (tour_id, fecha)
);

create index disponibilidad_tour_fecha_idx on disponibilidad (tour_id, fecha);

-- =====================================================================
-- reservas — la reserva del cliente
-- =====================================================================
create sequence reserva_folio_seq;

create table reservas (
  id uuid primary key default gen_random_uuid(),
  folio text unique not null default
    'TK-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('reserva_folio_seq')::text, 6, '0'),
  tour_id uuid not null references tours (id),
  fecha date not null,
  audiencia audiencia_t not null,
  adultos int not null default 1,
  menores int not null default 0,
  zona_pickup text,
  moneda moneda_t not null,
  subtotal numeric(10, 2) not null,
  impuestos numeric(10, 2) not null default 0,
  total numeric(10, 2) not null,
  costo_total_pr numeric(10, 2) not null default 0, -- suma de PR (margen, admin)
  margen numeric(10, 2) generated always as (total - costo_total_pr) stored,
  estado reserva_estado_t not null default 'pendiente',
  cliente_nombre text not null,
  cliente_email text not null,
  cliente_telefono text not null,
  datos_extra jsonb not null default '{}',
  idioma text not null default 'es',
  provider text,
  provider_ref text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index reservas_estado_idx on reservas (estado);
create index reservas_tour_fecha_idx on reservas (tour_id, fecha);
create unique index reservas_provider_ref_idx
  on reservas (provider, provider_ref)
  where provider_ref is not null;

create trigger reservas_set_actualizado
  before update on reservas
  for each row execute function set_actualizado_en();

-- =====================================================================
-- holds — apartado temporal anti-sobreventa
-- =====================================================================
create table holds (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references tours (id) on delete cascade,
  fecha date not null,
  personas int not null,
  expira_en timestamptz not null,
  reserva_id uuid references reservas (id) on delete set null,
  estado hold_estado_t not null default 'activo',
  creado_en timestamptz not null default now(),
  check (personas >= 1)
);

create index holds_activos_idx on holds (tour_id, fecha, estado, expira_en);

-- =====================================================================
-- pagos — registro de transacciones (1-N con reserva por reintentos)
-- =====================================================================
create table pagos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references reservas (id) on delete cascade,
  provider text not null,
  provider_ref text not null,
  monto numeric(10, 2) not null,
  moneda moneda_t not null,
  estado pago_estado_t not null default 'iniciado',
  raw jsonb,
  creado_en timestamptz not null default now(),
  unique (provider, provider_ref) -- idempotencia de webhooks
);

create index pagos_reserva_idx on pagos (reserva_id);

-- =====================================================================
-- promos — descuentos / campañas
-- =====================================================================
create table promos (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  tipo promo_tipo_t not null,
  valor numeric(10, 2) not null,
  aplica_a jsonb not null default '{}',
  vigente_desde timestamptz,
  vigente_hasta timestamptz,
  activa boolean not null default true
);

create unique index promos_codigo_idx on promos (codigo) where codigo is not null;

-- =====================================================================
-- admin_users — gestionado junto con Supabase Auth (id = auth.users.id)
-- =====================================================================
create table admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  rol admin_rol_t not null default 'staff',
  creado_en timestamptz not null default now()
);
