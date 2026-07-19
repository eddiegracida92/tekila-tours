import { z } from 'zod';

/**
 * Validación y normalización del formulario de tarifas (Step 9.3a).
 *
 * Escribe SOLO el owner (RLS `is_owner()` + guardia en la página). El PR
 * (`pr_adulto`/`pr_menor`) se escribe aquí pero el candado de LECTURA vive en
 * la BD (columna revocada + vista `tarifas_admin`); ver migración
 * `20260719130000_tarifas_pr_gate.sql`.
 */

export const AUDIENCIAS = ['nacional', 'extranjero'] as const;
export const TEMPORADAS = ['unica', 'baja', 'alta'] as const;
export const MONEDAS = ['USD', 'MXN'] as const;

export const tarifaSchema = z.object({
  audiencia: z.enum(AUDIENCIAS),
  temporada: z.enum(TEMPORADAS),
  operador_variante: z.string().trim().max(120).nullable(),
  modalidad: z.string().trim().max(120).nullable(),
  moneda: z.enum(MONEDAS),
  pp_adulto: z.number().min(0).max(1_000_000),
  pp_menor: z.number().min(0).max(1_000_000).nullable(),
  pr_adulto: z.number().min(0).max(1_000_000),
  pr_menor: z.number().min(0).max(1_000_000).nullable(),
  impuesto_adulto: z.number().min(0).max(1_000_000),
  impuesto_menor: z.number().min(0).max(1_000_000),
  impuesto_moneda: z.enum(MONEDAS).nullable(),
  activo: z.boolean(),
  notas: z.string().trim().nullable(),
});

export type TarifaInput = z.infer<typeof tarifaSchema>;

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
/** Número opcional: '' → null; inválido → NaN (para detectar el error). */
function numeroOpc(form: FormData, key: string): number | null {
  const v = texto(form, key);
  if (v == null) return null;
  return Number(v);
}

/** Convierte el FormData en una tarifa validada, o devuelve errores en español. */
export function parseTarifaForm(form: FormData): { data: TarifaInput } | { errors: string[] } {
  const errores: string[] = [];

  // Requeridos numéricos con mensajes amables (antes de zod).
  const ppAdulto = numeroOpc(form, 'pp_adulto');
  const prAdulto = numeroOpc(form, 'pr_adulto');
  if (ppAdulto == null || Number.isNaN(ppAdulto)) errores.push('El PP adulto es obligatorio y numérico.');
  if (prAdulto == null || Number.isNaN(prAdulto)) errores.push('El PR adulto es obligatorio y numérico.');

  const ppMenor = numeroOpc(form, 'pp_menor');
  const prMenor = numeroOpc(form, 'pr_menor');
  if (ppMenor != null && Number.isNaN(ppMenor)) errores.push('El PP menor debe ser numérico.');
  if (prMenor != null && Number.isNaN(prMenor)) errores.push('El PR menor debe ser numérico.');

  if (errores.length) return { errors: errores };

  const impMoneda = texto(form, 'impuesto_moneda');

  const crudo = {
    audiencia: texto(form, 'audiencia') ?? '',
    temporada: texto(form, 'temporada') ?? 'unica',
    operador_variante: texto(form, 'operador_variante'),
    modalidad: texto(form, 'modalidad'),
    moneda: texto(form, 'moneda') ?? '',
    pp_adulto: ppAdulto,
    pp_menor: ppMenor,
    pr_adulto: prAdulto,
    pr_menor: prMenor,
    impuesto_adulto: numeroOpc(form, 'impuesto_adulto') ?? 0,
    impuesto_menor: numeroOpc(form, 'impuesto_menor') ?? 0,
    impuesto_moneda: impMoneda,
    activo: casilla(form, 'activo'),
    notas: texto(form, 'notas'),
  };

  const parsed = tarifaSchema.safeParse(crudo);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'campo'}: ${i.message}`) };
  }

  // Regla de negocio: el PR no debería superar al PP (margen negativo).
  const d = parsed.data;
  if (d.pr_adulto > d.pp_adulto) {
    errores.push('El PR adulto es mayor que el PP adulto (margen negativo). Revisa los precios.');
  }
  if (d.pr_menor != null && d.pp_menor != null && d.pr_menor > d.pp_menor) {
    errores.push('El PR menor es mayor que el PP menor (margen negativo). Revisa los precios.');
  }
  if (errores.length) return { errors: errores };

  return { data: d };
}
