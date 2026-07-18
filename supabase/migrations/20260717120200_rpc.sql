-- =====================================================================
-- Tekila Tours — Funciones RPC atómicas (Step 4)
-- Anti-sobreventa vía bloqueo de fila (FOR UPDATE) + verificación de
-- cupo dentro de la misma transacción. SECURITY DEFINER; solo el
-- service_role (usado por /api/*) puede ejecutarlas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- crear_hold — aparta cupo temporalmente (15 min). Atómico.
-- Devuelve (hold_id, expira_en) o lanza 'sin_cupo' / 'fecha_bloqueada'.
-- ---------------------------------------------------------------------
create or replace function crear_hold(
  p_tour_id uuid,
  p_fecha date,
  p_personas int
)
returns table (hold_id uuid, expira_en timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cupo_total int;
  v_cupo_reservado int;
  v_bloqueada boolean;
  v_en_espera int;
  v_hold_id uuid;
  v_expira timestamptz;
begin
  if p_personas < 1 then
    raise exception 'personas_invalido';
  end if;

  -- Asegura la fila de disponibilidad (cupo_total null = ilimitado)
  insert into disponibilidad (tour_id, fecha)
  values (p_tour_id, p_fecha)
  on conflict (tour_id, fecha) do nothing;

  -- Bloquea la fila para serializar holds concurrentes de esa fecha
  select cupo_total, cupo_reservado, bloqueada
    into v_cupo_total, v_cupo_reservado, v_bloqueada
  from disponibilidad
  where tour_id = p_tour_id and fecha = p_fecha
  for update;

  if v_bloqueada then
    raise exception 'fecha_bloqueada';
  end if;

  -- Suma de holds activos aún vigentes
  -- (se califican las columnas para no chocar con el OUT param expira_en)
  select coalesce(sum(h.personas), 0)
    into v_en_espera
  from holds h
  where h.tour_id = p_tour_id
    and h.fecha = p_fecha
    and h.estado = 'activo'
    and h.expira_en > now();

  -- Solo se verifica cupo si hay un límite (null = ilimitado)
  if v_cupo_total is not null
     and (v_cupo_total - v_cupo_reservado - v_en_espera) < p_personas then
    raise exception 'sin_cupo';
  end if;

  insert into holds (tour_id, fecha, personas, expira_en, estado)
  values (p_tour_id, p_fecha, p_personas, now() + interval '15 minutes', 'activo')
  returning id, holds.expira_en into v_hold_id, v_expira;

  return query select v_hold_id, v_expira;
end;
$$;

-- ---------------------------------------------------------------------
-- confirmar_reserva — finaliza el pago aprobado (llamada por webhook).
-- Idempotente por (provider, provider_ref): consume el hold, incrementa
-- cupo_reservado y marca la reserva 'pagada'. Devuelve reserva_id.
-- ---------------------------------------------------------------------
create or replace function confirmar_reserva(
  p_reserva_id uuid,
  p_provider text,
  p_provider_ref text,
  p_monto numeric,
  p_moneda moneda_t,
  p_raw jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva reservas%rowtype;
  v_personas int;
begin
  -- Idempotencia: si el pago ya fue registrado como aprobado, no repetir
  if exists (
    select 1 from pagos
    where provider = p_provider
      and provider_ref = p_provider_ref
      and estado = 'aprobado'
  ) then
    return p_reserva_id;
  end if;

  -- Bloquea la reserva
  select * into v_reserva from reservas where id = p_reserva_id for update;
  if not found then
    raise exception 'reserva_inexistente';
  end if;

  -- Si ya está pagada/confirmada, solo registra el pago (idempotente)
  if v_reserva.estado in ('pagada', 'confirmada') then
    insert into pagos (reserva_id, provider, provider_ref, monto, moneda, estado, raw)
    values (p_reserva_id, p_provider, p_provider_ref, p_monto, p_moneda, 'aprobado', p_raw)
    on conflict (provider, provider_ref) do nothing;
    return p_reserva_id;
  end if;

  v_personas := v_reserva.adultos + v_reserva.menores;

  -- Incrementa cupo confirmado (crea la fila si no existía)
  insert into disponibilidad (tour_id, fecha, cupo_reservado)
  values (v_reserva.tour_id, v_reserva.fecha, v_personas)
  on conflict (tour_id, fecha)
  do update set cupo_reservado = disponibilidad.cupo_reservado + v_personas;

  -- Consume el hold ligado a la reserva (si existe y sigue activo)
  update holds
  set estado = 'consumido'
  where reserva_id = p_reserva_id and estado = 'activo';

  -- Marca la reserva como pagada
  update reservas
  set estado = 'pagada',
      provider = p_provider,
      provider_ref = p_provider_ref
  where id = p_reserva_id;

  -- Registra el pago aprobado (idempotente)
  insert into pagos (reserva_id, provider, provider_ref, monto, moneda, estado, raw)
  values (p_reserva_id, p_provider, p_provider_ref, p_monto, p_moneda, 'aprobado', p_raw)
  on conflict (provider, provider_ref) do nothing;

  return p_reserva_id;
end;
$$;

-- ---------------------------------------------------------------------
-- expirar_holds — libera holds vencidos (cron de Supabase o al leer).
-- Devuelve cuántos holds expiró.
-- ---------------------------------------------------------------------
create or replace function expirar_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update holds
  set estado = 'expirado'
  where estado = 'activo' and expira_en <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---- Permisos: solo el service_role ejecuta las RPC (vía /api/*) ----
revoke all on function crear_hold(uuid, date, int) from public;
revoke all on function confirmar_reserva(uuid, text, text, numeric, moneda_t, jsonb) from public;
revoke all on function expirar_holds() from public;

grant execute on function crear_hold(uuid, date, int) to service_role;
grant execute on function confirmar_reserva(uuid, text, text, numeric, moneda_t, jsonb) to service_role;
grant execute on function expirar_holds() to service_role;
