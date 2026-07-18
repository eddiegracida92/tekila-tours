import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';
import { calcularDisponibilidad, type Disponibilidad } from '@/lib/availability';

// Ruta on-demand. Lee `disponibilidad` + `holds` activos (holds NO es legible
// por anon), así que se resuelve en el servidor con el cliente service-role.
export const prerender = false;

const AvailabilitySchema = z
  .object({
    slug: z.string().min(1).max(120),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
    personas: z.number().int().min(1).max(50).default(1),
  })
  .refine((v) => v.hasta >= v.desde, { message: 'rango_invalido', path: ['hasta'] });

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = AvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { slug, desde, hasta, personas } = parsed.data;

  const supabase = createAdminClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo')
    .eq('slug', slug)
    .maybeSingle();

  if (tourErr) return errorJson('error_bd', 500);
  if (!tour || !tour.activo) return errorJson('tour_no_encontrado', 404);

  const [dispRes, holdsRes] = await Promise.all([
    supabase
      .from('disponibilidad')
      .select('fecha, cupo_total, cupo_reservado, bloqueada')
      .eq('tour_id', tour.id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true }),
    supabase
      .from('holds')
      .select('fecha, personas')
      .eq('tour_id', tour.id)
      .eq('estado', 'activo')
      .gt('expira_en', new Date().toISOString())
      .gte('fecha', desde)
      .lte('fecha', hasta),
  ]);

  if (dispRes.error || holdsRes.error) return errorJson('error_bd', 500);

  // Agrega personas de holds activos vigentes por fecha.
  const holdsPorFecha = new Map<string, number>();
  for (const h of holdsRes.data ?? []) {
    holdsPorFecha.set(h.fecha, (holdsPorFecha.get(h.fecha) ?? 0) + h.personas);
  }

  const fechas = calcularDisponibilidad(
    (dispRes.data ?? []) as Disponibilidad[],
    holdsPorFecha,
    personas,
  );

  return json({ ok: true, fechas }, 200);
};
