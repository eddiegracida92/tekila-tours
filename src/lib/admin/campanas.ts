import { z } from 'zod';
import { localizePath, type Lang } from '@/i18n/ui';

/**
 * Validación del envío de campañas de marketing (Step 9.7.3, owner-only).
 *
 * El owner escribe asunto + cuerpo (texto plano) y elige el idioma del
 * segmento. El envío real y el filtrado por consentimiento viven en la página;
 * aquí solo se valida y normaliza el FormData.
 */

export const campanaSchema = z.object({
  asunto: z.string().trim().min(1, 'El asunto es obligatorio.').max(200),
  cuerpo: z.string().trim().min(1, 'El cuerpo es obligatorio.').max(5000),
  idioma: z.enum(['es', 'en']),
});

export type CampanaInput = z.infer<typeof campanaSchema>;

export function parseCampanaForm(form: FormData) {
  return campanaSchema.safeParse({
    asunto: form.get('asunto'),
    cuerpo: form.get('cuerpo'),
    idioma: form.get('idioma'),
  });
}

/**
 * URL de baja para un suscriptor. La ruta se localiza por idioma del
 * suscriptor (`/baja` es, `/en/baja` en) y lleva su `token_baja`.
 */
export function construirBajaUrl(origin: string, idioma: Lang, token: string): string {
  return `${origin}${localizePath('/baja', idioma)}?token=${token}`;
}
