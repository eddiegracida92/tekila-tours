import type { APIRoute } from 'astro';
import { createAdminClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/auth';
import { json, errorJson } from '@/lib/api';
import { cotizar, PricingError, type Tarifa, type RangoTemporada } from '@/lib/pricing';
import { RegistrarVentaSchema, calcularComision } from '@/lib/vendedor/venta';

// Portal de vendedores — modo A: registra una venta cobrada en efectivo/terminal
// propia. Marca la reserva `pagada` SIN Stripe, reutilizando la RPC atómica
// `confirmar_reserva` (cupo + consumo de hold + registro de pago, idempotente).
//
// Autorización: la sesión debe ser de un vendedor activo. La atribución
// (`vendedor_id`) sale de la sesión, NUNCA del payload. El precio se revalida
// con `cotizar` (regla #2) y la comisión se congela en el servidor.
export const prerender = false;

const TARIFA_COLUMNS =
  'audiencia, temporada, modalidad, moneda, pp_adulto, pp_menor, ' +
  'pr_adulto, pr_menor, impuesto_adulto, impuesto_menor, activo';

export const POST: APIRoute = async ({ request, cookies }) => {
  // 0) Autorización: solo un vendedor activo puede registrar ventas.
  const perfil = await getAdminSession(request, cookies);
  if (!perfil) return errorJson('no_autenticado', 401);
  if (perfil.rol !== 'vendedor') return errorJson('no_autorizado', 403);
  const vendedorId = perfil.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = RegistrarVentaSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { slug, holdId, fecha, audiencia, adultos, menores, cliente, metodoCobro } = parsed.data;
  const personas = adultos + menores;

  const supabase = createAdminClient();

  // 1) Tour.
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo, impuesto_online, capacidad_max')
    .eq('slug', slug)
    .maybeSingle();
  if (tourErr) return errorJson('error_bd', 500);
  if (!tour || !tour.activo) return errorJson('tour_no_encontrado', 404);
  if (personas > tour.capacidad_max) {
    return errorJson('excede_capacidad', 422, { capacidadMax: tour.capacidad_max });
  }

  // 2) Hold vigente y coincidente (cupo ya apartado; anti-sobreventa).
  const { data: hold, error: holdErr } = await supabase
    .from('holds')
    .select('id, tour_id, fecha, personas, estado, expira_en, reserva_id')
    .eq('id', holdId)
    .maybeSingle();
  if (holdErr) return errorJson('error_bd', 500);
  if (!hold || hold.estado !== 'activo' || hold.reserva_id) return errorJson('hold_invalido', 409);
  if (new Date(hold.expira_en).getTime() <= Date.now()) return errorJson('hold_expirado', 409);
  if (hold.tour_id !== tour.id || hold.fecha !== fecha || hold.personas !== personas) {
    return errorJson('hold_no_coincide', 409);
  }

  // 3) Revalida el precio en el servidor (fuente de verdad).
  const [tarifasRes, temporadasRes] = await Promise.all([
    supabase.from('tarifas').select(TARIFA_COLUMNS).eq('tour_id', tour.id).eq('activo', true),
    supabase.from('temporadas').select('tipo, fecha_inicio, fecha_fin'),
  ]);
  if (tarifasRes.error || temporadasRes.error) return errorJson('error_bd', 500);

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
    }));
  } catch (err) {
    if (err instanceof PricingError) return errorJson(err.code, 422);
    throw err;
  }

  // 4) Comisión congelada: config del vendedor × total (server-side).
  const { data: vend, error: vendErr } = await supabase
    .from('admin_users')
    .select('comision_tipo, comision_valor')
    .eq('id', vendedorId)
    .maybeSingle();
  if (vendErr) return errorJson('error_bd', 500);
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
  if (insErr || !reserva) return errorJson('error_reserva', 500);

  // 6) Liga el hold a la reserva (solo si sigue activo y libre — carrera).
  const { data: linked, error: linkErr } = await supabase
    .from('holds')
    .update({ reserva_id: reserva.id })
    .eq('id', holdId)
    .eq('estado', 'activo')
    .is('reserva_id', null)
    .select('id')
    .maybeSingle();
  if (linkErr || !linked) return errorJson('hold_invalido', 409);

  // 7) Confirma la venta SIN Stripe: proveedor `manual`, ref = folio. La RPC
  //    marca `pagada`, incrementa cupo, consume el hold y registra el pago.
  const { error: confErr } = await supabase.rpc('confirmar_reserva', {
    p_reserva_id: reserva.id,
    p_provider: 'manual',
    p_provider_ref: reserva.folio,
    p_monto: publico.total,
    p_moneda: publico.moneda,
    p_raw: { canal: 'vendedor', metodo_cobro: metodoCobro, vendedor_id: vendedorId },
  });
  if (confErr) return errorJson('error_confirmacion', 500);

  return json({ ok: true, folio: reserva.folio }, 201);
};
