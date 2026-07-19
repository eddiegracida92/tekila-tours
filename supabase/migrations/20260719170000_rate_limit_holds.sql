-- =====================================================================
-- Tekila Tours — Rate limiting de holds por IP (hallazgo del chequeo de
-- seguridad: /api/hold era anónimo y sin límite → un script podía agotar
-- el cupo real con holds de 15 min).
-- =====================================================================
-- Estrategia: el límite vive DENTRO de `crear_hold` (mismo lugar que el
-- anti-sobreventa), no en memoria del serverless (Vercel no comparte
-- memoria entre invocaciones). Por IP se acota lo APARTADO VIGENTE:
--
--   máx. 10 holds activos  Y  máx. 60 personas apartadas a la vez.
--
-- Como los holds expiran a los 15 min, la ventana se limpia sola: el daño
-- máximo por IP es 60 asientos "congelados" a la vez. Un cliente legítimo
-- que reintenta (cambia fecha/personas varias veces) queda muy por debajo.
--
-- Privacidad: se guarda el SHA-256 de la IP (`ip_hash`), nunca la IP
-- cruda. Si la IP no está disponible (p. ej. entorno local), llega NULL y
-- el límite no aplica (fail-open: nunca bloquea una venta por un proxy).
-- =====================================================================

alter table holds add column if not exists ip_hash text;

-- Índice parcial para el conteo por IP (solo holds activos).
create index if not exists holds_ip_activos_idx
  on holds (ip_hash) where estado = 'activo';

-- La firma cambia (nuevo parámetro) → drop explícito para no dejar la
-- versión vieja como sobrecarga todavía ejecutable por service_role.
drop function if exists crear_hold(uuid, date, int);

create or replace function crear_hold(
  p_tour_id uuid,
  p_fecha date,
  p_personas int,
  p_ip_hash text default null
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
  v_ip_holds int;
  v_ip_personas int;
begin
  if p_personas < 1 then
    raise exception 'personas_invalido';
  end if;

  -- ---- Rate limit por IP (antes de tocar disponibilidad) ----
  if p_ip_hash is not null then
    -- Serializa los holds concurrentes de la MISMA IP para que dos
    -- peticiones simultáneas no se cuelen bajo el límite a la vez.
    perform pg_advisory_xact_lock(hashtext(p_ip_hash));

    select count(*), coalesce(sum(h.personas), 0)
      into v_ip_holds, v_ip_personas
    from holds h
    where h.ip_hash = p_ip_hash
      and h.estado = 'activo'
      and h.expira_en > now();

    if v_ip_holds >= 10 or (v_ip_personas + p_personas) > 60 then
      raise exception 'limite_ip';
    end if;
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

  insert into holds (tour_id, fecha, personas, expira_en, estado, ip_hash)
  values (p_tour_id, p_fecha, p_personas, now() + interval '15 minutes', 'activo', p_ip_hash)
  returning id, holds.expira_en into v_hold_id, v_expira;

  return query select v_hold_id, v_expira;
end;
$$;

-- ---- Permisos: igual que la versión anterior, solo service_role ----
revoke all on function crear_hold(uuid, date, int, text) from public;
grant execute on function crear_hold(uuid, date, int, text) to service_role;
