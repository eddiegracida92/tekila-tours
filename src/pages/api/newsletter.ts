import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { json, errorJson } from '@/lib/api';

// Ruta on-demand, público (sin sesión). Alta a la lista de marketing
// (Step 9.7): el `anon` no tiene policy de RLS sobre `email_suscriptores`
// (deny-all), así que la escritura pasa por aquí con service-role — mismo
// patrón que el opt-in de `/api/checkout`. Re-suscribirse con un email que
// ya estaba de baja lo regresa a 'suscrito' (opt-in explícito de nuevo).
export const prerender = false;

const NewsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nombre: z.string().trim().max(160).optional(),
  idioma: z.enum(['es', 'en']).default('es'),
  consentimiento: z.boolean().refine((v) => v === true, 'consentimiento_requerido'),
});

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = NewsletterSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('datos_invalidos', 422, parsed.error.flatten());
  }
  const { email, nombre, idioma, consentimiento } = parsed.data;

  // `nombre` solo se incluye si vino: así una re-suscripción desde el footer
  // (que no pide nombre) no pisa el nombre capturado antes en el checkout.
  const fila: Record<string, unknown> = {
    email,
    idioma,
    consentimiento,
    consent_origen: 'newsletter',
    consent_fecha: new Date().toISOString(),
    estado: 'suscrito',
  };
  if (nombre) fila.nombre = nombre;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('email_suscriptores')
    .upsert(fila, { onConflict: 'email' });
  if (error) return errorJson('error_guardar', 500);

  return json({ ok: true });
};
