import { z } from 'zod';

/**
 * Validación y normalización del formulario de temporadas (Step 9.3b).
 *
 * Las temporadas son rangos de fecha (baja/alta) que el motor de precios
 * (`pricing.ts`) resuelve por rango para elegir la tarifa correcta. NO hay FK
 * directa: se comparan las fechas como strings ISO. Escribe SOLO el owner
 * (RLS `is_owner()` + guardia en la página); la lectura es de cualquier admin.
 */

export const TIPOS_TEMPORADA = ['baja', 'alta'] as const;

/** `YYYY-MM-DD` (lo que emite <input type="date">). */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const temporadaSchema = z
  .object({
    tipo: z.enum(TIPOS_TEMPORADA),
    fecha_inicio: z.string().regex(FECHA_ISO, 'Fecha de inicio inválida (usa el selector de fecha).'),
    fecha_fin: z.string().regex(FECHA_ISO, 'Fecha de fin inválida (usa el selector de fecha).'),
    etiqueta: z.string().trim().max(120).nullable(),
  })
  .refine((d) => d.fecha_fin >= d.fecha_inicio, {
    message: 'La fecha de fin no puede ser anterior a la de inicio.',
    path: ['fecha_fin'],
  });

export type TemporadaInput = z.infer<typeof temporadaSchema>;

// ---- Helpers FormData ----
function texto(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Convierte el FormData en una temporada validada, o devuelve errores en español. */
export function parseTemporadaForm(form: FormData): { data: TemporadaInput } | { errors: string[] } {
  const crudo = {
    tipo: texto(form, 'tipo') ?? '',
    fecha_inicio: texto(form, 'fecha_inicio') ?? '',
    fecha_fin: texto(form, 'fecha_fin') ?? '',
    etiqueta: texto(form, 'etiqueta'),
  };

  const parsed = temporadaSchema.safeParse(crudo);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => i.message) };
  }
  return { data: parsed.data };
}
