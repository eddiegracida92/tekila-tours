import { z } from 'zod';

/**
 * Validación y normalización del formulario de disponibilidad (Step 9.3b).
 *
 * Una fila = cupo de un tour en una fecha. La escribe cualquier admin
 * (RLS `is_admin()`): es operación diaria (ajustar cupo, bloquear un día).
 *
 * OJO: `cupo_reservado` NO se toca desde el panel — lo mueve el motor de
 * reservas (RPC `crear_hold`/`confirmar_reserva`). Aquí solo se gestionan
 * `cupo_total` (null = ilimitado) y `bloqueada`.
 */

/** `YYYY-MM-DD` (lo que emite <input type="date">). */
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const disponibilidadSchema = z.object({
  fecha: z.string().regex(FECHA_ISO, 'Fecha inválida (usa el selector de fecha).'),
  cupo_total: z.number().int('El cupo debe ser un número entero.').min(0).max(100_000).nullable(),
  bloqueada: z.boolean(),
});

export type DisponibilidadInput = z.infer<typeof disponibilidadSchema>;

// ---- Helpers FormData ----
function texto(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}
function casilla(form: FormData, key: string): boolean {
  return form.get(key) != null;
}

/** Convierte el FormData en una fila validada, o devuelve errores en español. */
export function parseDisponibilidadForm(
  form: FormData,
): { data: DisponibilidadInput } | { errors: string[] } {
  const errores: string[] = [];

  // Cupo opcional: '' → null (ilimitado); presente → entero.
  const cupoRaw = texto(form, 'cupo_total');
  let cupo: number | null = null;
  if (cupoRaw != null) {
    cupo = Number(cupoRaw);
    if (Number.isNaN(cupo)) errores.push('El cupo total debe ser numérico (déjalo vacío para ilimitado).');
  }
  if (errores.length) return { errors: errores };

  const crudo = {
    fecha: texto(form, 'fecha') ?? '',
    cupo_total: cupo,
    bloqueada: casilla(form, 'bloqueada'),
  };

  const parsed = disponibilidadSchema.safeParse(crudo);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => i.message) };
  }
  return { data: parsed.data };
}
