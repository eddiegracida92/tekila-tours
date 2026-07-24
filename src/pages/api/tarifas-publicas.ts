import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';

// Ruta on-demand. Devuelve el "menú" de tarifas de un tour para que la isla de
// reserva pinte el selector de PROGRAMA (modalidad) y MONEDA (Step 10.0).
//
// Regla no negociable #5: se seleccionan SOLO columnas públicas
// (audiencia, temporada, modalidad, moneda, pp_adulto, pp_menor). El PR
// (`pr_adulto`/`pr_menor`) NUNCA se lee aquí ni se serializa. El precio final
// se sigue resolviendo en `/api/quote` (servidor); esto es solo para la UI.
export const prerender = false;

// Solo columnas públicas. Cualquier cambio aquí que agregue pr_* es un bug.
const COLUMNAS_PUBLICAS = 'audiencia, temporada, modalidad, moneda, pp_adulto, pp_menor';

const Schema = z.object({
  slug: z.string().min(1).max(120),
});

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { slug } = parsed.data;

  const supabase = createAdminClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo')
    .eq('slug', slug)
    .maybeSingle();

  if (tourErr) return errorJson('error_bd', 500);
  if (!tour || !tour.activo) return errorJson('tour_no_encontrado', 404);

  const { data: tarifas, error: tarErr } = await supabase
    .from('tarifas')
    .select(COLUMNAS_PUBLICAS)
    .eq('tour_id', tour.id)
    .eq('activo', true);

  if (tarErr) return errorJson('error_bd', 500);

  return json({ ok: true, tarifas: tarifas ?? [] }, 200);
};
