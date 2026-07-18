import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';

// Ruta on-demand. Aparta cupo temporalmente (15 min) vía la RPC atómica
// `crear_hold`, que solo el service_role puede ejecutar. El anti-sobreventa
// se resuelve en Postgres (FOR UPDATE), nunca en el navegador.
export const prerender = false;

const HoldSchema = z.object({
  slug: z.string().min(1).max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
  personas: z.number().int().min(1).max(50),
});

/** Mapea el mensaje de la excepción de Postgres a (código, status HTTP). */
function mapRpcError(message: string): { code: string; status: number } {
  const msg = message.toLowerCase();
  if (msg.includes('sin_cupo')) return { code: 'sin_cupo', status: 409 };
  if (msg.includes('fecha_bloqueada')) return { code: 'fecha_bloqueada', status: 409 };
  if (msg.includes('personas_invalido')) return { code: 'personas_invalido', status: 422 };
  return { code: 'error_hold', status: 500 };
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = HoldSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { slug, fecha, personas } = parsed.data;

  const supabase = createAdminClient();

  // Resuelve slug → tour_id (la RPC recibe el uuid, no el slug).
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, activo')
    .eq('slug', slug)
    .maybeSingle();

  if (tourErr) return errorJson('error_bd', 500);
  if (!tour || !tour.activo) return errorJson('tour_no_encontrado', 404);

  const { data, error } = await supabase.rpc('crear_hold', {
    p_tour_id: tour.id,
    p_fecha: fecha,
    p_personas: personas,
  });

  if (error) {
    const { code, status } = mapRpcError(error.message);
    return errorJson(code, status);
  }

  // `crear_hold` devuelve una tabla (hold_id, expira_en) → primera fila.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.hold_id) return errorJson('error_hold', 500);

  return json({ ok: true, holdId: row.hold_id, expiraEn: row.expira_en }, 201);
};
