import type { SupabaseClient } from '@supabase/supabase-js';
import { cotizar, PricingError, type Tarifa, type RangoTemporada, type QuotePublico } from '@/lib/pricing';
import { calcularComision } from '@/lib/vendedor/venta';

/**
 * Lógica común de una venta de vendedor (modo A efectivo y modo B en línea).
 * SOLO servidor (usa service_role vía el `supabase` que se le pasa). NO lo
 * importa la isla — `venta.ts` (schema + `calcularComision`) es lo client-safe.
 *
 * Hace, en orden: valida tour → valida el hold vigente y coincidente →
 * revalida el precio con `cotizar` (regla #2, el cliente nunca es fuente de
 * verdad) → congela la comisión con la config del vendedor → inserta la reserva
 * `pago_iniciado` atribuida al vendedor (canal 'vendedor', `vendedor_id`,
 * `metodo_cobro`, comisión y PR/`costo_total_pr`) → liga el hold.
 *
 * Devuelve la reserva creada y la cotización pública. El cobro en sí lo decide
 * el llamador: modo A → `confirmar_reserva` (manual); modo B → sesión de Stripe.
 */

const TARIFA_COLUMNS =
  'audiencia, temporada, modalidad, moneda, pp_adulto, pp_menor, ' +
  'pr_adulto, pr_menor, impuesto_adulto, impuesto_menor, activo';

export interface DatosVentaVendedor {
  slug: string;
  holdId: string;
  fecha: string;
  audiencia: 'nacional' | 'extranjero';
  adultos: number;
  menores: number;
  cliente: { nombre: string; telefono: string; email: string };
  metodoCobro: 'efectivo' | 'terminal_externa' | 'online';
  /** Programa y moneda elegidos (Step 10.0). Opcionales por compatibilidad. */
  modalidad?: string | null;
  moneda?: 'USD' | 'MXN';
}

export type PrepararResultado =
  | { ok: true; reserva: { id: string; folio: string }; publico: QuotePublico; tourNombre: string }
  | { ok: false; error: string; status: number };

export async function prepararReservaVendedor(
  supabase: SupabaseClient,
  vendedorId: string,
  datos: DatosVentaVendedor,
): Promise<PrepararResultado> {
  const { slug, holdId, fecha, audiencia, adultos, menores, cliente, metodoCobro, modalidad, moneda } = datos;
  const personas = adultos + menores;

  // 1) Tour.
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo, impuesto_online, capacidad_max, nombre_es')
    .eq('slug', slug)
    .maybeSingle();
  if (tourErr) return { ok: false, error: 'error_bd', status: 500 };
  if (!tour || !tour.activo) return { ok: false, error: 'tour_no_encontrado', status: 404 };
  if (personas > tour.capacidad_max) return { ok: false, error: 'excede_capacidad', status: 422 };

  // 2) Hold vigente y coincidente (cupo ya apartado; anti-sobreventa).
  const { data: hold, error: holdErr } = await supabase
    .from('holds')
    .select('id, tour_id, fecha, personas, estado, expira_en, reserva_id')
    .eq('id', holdId)
    .maybeSingle();
  if (holdErr) return { ok: false, error: 'error_bd', status: 500 };
  if (!hold || hold.estado !== 'activo' || hold.reserva_id) {
    return { ok: false, error: 'hold_invalido', status: 409 };
  }
  if (new Date(hold.expira_en).getTime() <= Date.now()) {
    return { ok: false, error: 'hold_expirado', status: 409 };
  }
  if (hold.tour_id !== tour.id || hold.fecha !== fecha || hold.personas !== personas) {
    return { ok: false, error: 'hold_no_coincide', status: 409 };
  }

  // 3) Revalida el precio en el servidor (fuente de verdad).
  const [tarifasRes, temporadasRes] = await Promise.all([
    supabase.from('tarifas').select(TARIFA_COLUMNS).eq('tour_id', tour.id).eq('activo', true),
    supabase.from('temporadas').select('tipo, fecha_inicio, fecha_fin'),
  ]);
  if (tarifasRes.error || temporadasRes.error) return { ok: false, error: 'error_bd', status: 500 };

  let publico, interno;
  try {
    ({ publico, interno } = cotizar({
      fecha,
      audiencia,
      adultos,
      menores,
      impuestoOnline: tour.impuesto_online,
      tarifas: (tarifasRes.data ?? []) as unknown as Tarifa[],
      temporadas: (temporadasRes.data ?? []) as unknown as RangoTemporada[],
      modalidad,
      moneda,
    }));
  } catch (err) {
    if (err instanceof PricingError) return { ok: false, error: err.code, status: 422 };
    throw err;
  }

  // 4) Comisión congelada: config del vendedor × total (server-side).
  const { data: vend, error: vendErr } = await supabase
    .from('admin_users')
    .select('comision_tipo, comision_valor')
    .eq('id', vendedorId)
    .maybeSingle();
  if (vendErr) return { ok: false, error: 'error_bd', status: 500 };
  const comision = calcularComision(publico.total, {
    tipo: (vend?.comision_tipo ?? null) as 'porcentaje' | 'monto' | null,
    valor: vend?.comision_valor ?? null,
  });

  // 5) Crea la reserva atribuida al vendedor (estado inicial `pago_iniciado`).
  //    El PR/margen (`interno`) va a `costo_total_pr`, NUNCA se serializa.
  const { data: reserva, error: insErr } = await supabase
    .from('reservas')
    .insert({
      tour_id: tour.id,
      fecha,
      audiencia,
      adultos,
      menores,
      modalidad: modalidad ?? null,
      moneda: publico.moneda,
      subtotal: publico.subtotal,
      impuestos: publico.impuestos,
      total: publico.total,
      costo_total_pr: interno.costoTotalPr,
      estado: 'pago_iniciado',
      canal: 'vendedor',
      vendedor_id: vendedorId,
      metodo_cobro: metodoCobro,
      comision_tipo: comision.tipo,
      comision_valor: comision.valor,
      comision_monto: comision.monto,
      cliente_nombre: cliente.nombre,
      cliente_email: cliente.email,
      cliente_telefono: cliente.telefono,
      idioma: 'es',
    })
    .select('id, folio')
    .single();
  if (insErr || !reserva) return { ok: false, error: 'error_reserva', status: 500 };

  // 6) Liga el hold a la reserva (solo si sigue activo y libre — carrera).
  const { data: linked, error: linkErr } = await supabase
    .from('holds')
    .update({ reserva_id: reserva.id })
    .eq('id', holdId)
    .eq('estado', 'activo')
    .is('reserva_id', null)
    .select('id')
    .maybeSingle();
  if (linkErr || !linked) return { ok: false, error: 'hold_invalido', status: 409 };

  return { ok: true, reserva, publico, tourNombre: tour.nombre_es };
}
