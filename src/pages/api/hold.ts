import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';

// Ruta on-demand. Aparta cupo temporalmente (15 min) vía la RPC atómica
// `crear_hold`, que solo el service_role puede ejecutar. El anti-sobreventa
// (y el rate limit por IP) se resuelven en Postgres, nunca en el navegador.
export const prerender = false;

const HoldSchema = z.object({
  slug: z.string().min(1).max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
  personas: z.number().int().min(1).max(50),
});

/** Mapea el mensaje de la excepción de Postgres a (código, status HTTP). */
function mapRpcError(message: string): { code: string; status: number } {
  const msg = message.toLowerCase();
  if (msg.includes('limite_ip')) return { code: 'demasiadas_solicitudes', status: 429 };
  if (msg.includes('sin_cupo')) return { code: 'sin_cupo', status: 409 };
  if (msg.includes('fecha_bloqueada')) return { code: 'fecha_bloqueada', status: 409 };
  if (msg.includes('personas_invalido')) return { code: 'personas_invalido', status: 422 };
  return { code: 'error_hold', status: 500 };
}

/**
 * Hash estable de la IP del cliente para el rate limit por IP de `crear_hold`.
 * NUNCA se guarda la IP cruda (PII): se manda solo el SHA-256 salado con el
 * secreto de servidor. Si no hay IP (entorno local sin proxy), devuelve null
 * y el límite no aplica (fail-open: no bloqueamos ventas por falta de IP).
 */
async function hashIp(clientAddress: string | null): Promise<string | null> {
  if (!clientAddress) return null;
  const salt = import.meta.env.SUPABASE_SECRET_KEY ?? '';
  const data = new TextEncoder().encode(`${salt}:${clientAddress}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * IP del cliente. Detrás de Vercel la fuente confiable es `x-forwarded-for`
 * (primera IP de la lista); `clientAddress` de Astro es el respaldo local.
 * `clientAddress` es un getter que puede lanzar si el adaptador no lo expone,
 * por eso se lee en try/catch en vez de destructurarlo.
 */
function obtenerIp(context: Parameters<APIRoute>[0]): string | null {
  const fwd = context.request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || null;
  try {
    return context.clientAddress ?? null;
  } catch {
    return null;
  }
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
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

  const ipHash = await hashIp(obtenerIp(context));

  const { data, error } = await supabase.rpc('crear_hold', {
    p_tour_id: tour.id,
    p_fecha: fecha,
    p_personas: personas,
    p_ip_hash: ipHash,
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
