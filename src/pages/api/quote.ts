import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';
import { cotizar, PricingError, type Tarifa, type RangoTemporada } from '@/lib/pricing';

// Ruta on-demand (Function en Vercel). El precio se resuelve SIEMPRE aquí,
// en el servidor, con el cliente service-role. El cliente nunca es fuente de verdad.
export const prerender = false;

const QuoteSchema = z.object({
  slug: z.string().min(1).max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
  audiencia: z.enum(['nacional', 'extranjero']),
  adultos: z.number().int().min(1).max(50),
  menores: z.number().int().min(0).max(50),
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

  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { slug, fecha, audiencia, adultos, menores } = parsed.data;

  const supabase = createAdminClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo, impuesto_online, capacidad_max')
    .eq('slug', slug)
    .maybeSingle();

  if (tourErr) return errorJson('error_bd', 500);
  if (!tour || !tour.activo) return errorJson('tour_no_encontrado', 404);

  if (adultos + menores > tour.capacidad_max) {
    return errorJson('excede_capacidad', 422, { capacidadMax: tour.capacidad_max });
  }

  const [tarifasRes, temporadasRes] = await Promise.all([
    supabase.from('tarifas').select(TARIFA_COLUMNS).eq('tour_id', tour.id).eq('activo', true),
    supabase.from('temporadas').select('tipo, fecha_inicio, fecha_fin'),
  ]);

  if (tarifasRes.error || temporadasRes.error) return errorJson('error_bd', 500);

  try {
    const { publico } = cotizar({
      fecha,
      audiencia,
      adultos,
      menores,
      impuestoOnline: tour.impuesto_online,
      tarifas: (tarifasRes.data ?? []) as unknown as Tarifa[],
      temporadas: (temporadasRes.data ?? []) as unknown as RangoTemporada[],
    });
    // Solo `publico` viaja al cliente; el margen/PR (`interno`) se queda aquí.
    return json({ ok: true, cotizacion: publico }, 200);
  } catch (err) {
    if (err instanceof PricingError) return errorJson(err.code, 422);
    throw err;
  }
};
