import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';
import { cotizar, PricingError, type Tarifa, type RangoTemporada } from '@/lib/pricing';
import { stripeProvider } from '@/lib/payments/stripe';

// Ruta on-demand. Crea la reserva (estado `pago_iniciado`) y la sesión de pago.
// Regla no negociable #2: el monto a cobrar se REVALIDA aquí con `cotizar`; el
// cliente nunca es fuente de verdad. Regla #3: el pago se confirma por webhook
// idempotente, no desde el navegador.
export const prerender = false;

const CheckoutSchema = z.object({
  slug: z.string().min(1).max(120),
  holdId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
  audiencia: z.enum(['nacional', 'extranjero']),
  adultos: z.number().int().min(1).max(50),
  menores: z.number().int().min(0).max(50),
  cliente: z.object({
    nombre: z.string().min(1).max(160),
    email: z.string().email().max(200),
    telefono: z.string().min(1).max(40),
  }),
  idioma: z.enum(['es', 'en']).default('es'),
  zonaPickup: z.string().max(160).optional(),
});

const TARIFA_COLUMNS =
  'audiencia, temporada, modalidad, moneda, pp_adulto, pp_menor, ' +
  'pr_adulto, pr_menor, impuesto_adulto, impuesto_menor, activo';

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { slug, holdId, fecha, audiencia, adultos, menores, cliente, idioma, zonaPickup } =
    parsed.data;
  const personas = adultos + menores;

  const supabase = createAdminClient();

  // 1) Tour (contenido + reglas de impuesto/capacidad).
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo, impuesto_online, capacidad_max, nombre_es, nombre_en')
    .eq('slug', slug)
    .maybeSingle();

  if (tourErr) return errorJson('error_bd', 500);
  if (!tour || !tour.activo) return errorJson('tour_no_encontrado', 404);
  if (personas > tour.capacidad_max) {
    return errorJson('excede_capacidad', 422, { capacidadMax: tour.capacidad_max });
  }

  // 2) El hold debe existir, seguir vigente y corresponder a esta reserva.
  //    Garantiza que el cupo ya está apartado antes de cobrar (anti-sobreventa).
  const { data: hold, error: holdErr } = await supabase
    .from('holds')
    .select('id, tour_id, fecha, personas, estado, expira_en, reserva_id')
    .eq('id', holdId)
    .maybeSingle();

  if (holdErr) return errorJson('error_bd', 500);
  if (!hold || hold.estado !== 'activo' || hold.reserva_id) {
    return errorJson('hold_invalido', 409);
  }
  if (new Date(hold.expira_en).getTime() <= Date.now()) {
    return errorJson('hold_expirado', 409);
  }
  if (hold.tour_id !== tour.id || hold.fecha !== fecha || hold.personas !== personas) {
    return errorJson('hold_no_coincide', 409);
  }

  // 3) Revalida el precio en el servidor (fuente de verdad del monto a cobrar).
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

  // 4) Crea la reserva `pago_iniciado`. El PR/margen (`interno`) se guarda en la
  //    columna interna `costo_total_pr` — NUNCA se serializa al cliente.
  const { data: reserva, error: insErr } = await supabase
    .from('reservas')
    .insert({
      tour_id: tour.id,
      fecha,
      audiencia,
      adultos,
      menores,
      zona_pickup: zonaPickup ?? null,
      moneda: publico.moneda,
      subtotal: publico.subtotal,
      impuestos: publico.impuestos,
      total: publico.total,
      costo_total_pr: interno.costoTotalPr,
      estado: 'pago_iniciado',
      canal: 'web',
      cliente_nombre: cliente.nombre,
      cliente_email: cliente.email,
      cliente_telefono: cliente.telefono,
      idioma,
    })
    .select('id, folio')
    .single();

  if (insErr || !reserva) return errorJson('error_reserva', 500);

  // 5) Liga el hold a la reserva (solo si sigue activo y libre — carrera).
  const { data: linked, error: linkErr } = await supabase
    .from('holds')
    .update({ reserva_id: reserva.id })
    .eq('id', holdId)
    .eq('estado', 'activo')
    .is('reserva_id', null)
    .select('id')
    .maybeSingle();

  if (linkErr || !linked) return errorJson('hold_invalido', 409);

  // 6) Sesión de pago con el proveedor (Stripe). El monto = total revalidado.
  const nombreTour = idioma === 'en' ? tour.nombre_en : tour.nombre_es;
  const partes = [`${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}`];
  if (menores > 0) partes.push(`${menores} ${menores === 1 ? 'menor' : 'menores'}`);
  const descripcion = `${nombreTour} — ${partes.join(', ')} · ${fecha}`;

  const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';
  const prefijo = idioma === 'en' ? '/en' : '';

  let sesion;
  try {
    sesion = await stripeProvider.crearSesionDePago({
      reservaId: reserva.id,
      folio: reserva.folio,
      descripcion,
      moneda: publico.moneda,
      total: publico.total,
      clienteEmail: cliente.email,
      idioma,
      successUrl: `${siteUrl}${prefijo}/confirmacion/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}${prefijo}/confirmacion/cancelado?folio=${reserva.folio}`,
    });
  } catch {
    return errorJson('error_pago', 502);
  }

  // 7) Guarda la referencia del proveedor para reconciliar con el webhook.
  await supabase
    .from('reservas')
    .update({ provider: sesion.provider, provider_ref: sesion.sesionId })
    .eq('id', reserva.id);

  return json({ ok: true, folio: reserva.folio, url: sesion.url }, 201);
};
