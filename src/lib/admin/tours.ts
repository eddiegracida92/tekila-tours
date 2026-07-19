import { z } from 'zod';

/**
 * Validación y normalización del formulario de tours (Step 9.2, panel admin).
 *
 * El form del panel manda todo como texto (FormData). Aquí lo convertimos a un
 * objeto tipado y lo validamos con zod ANTES de escribir en Supabase (regla
 * "validar todo payload"). El guardado usa la sesión del admin → la RLS
 * (`is_admin()`) es el candado real; esto es la barrera de datos correctos.
 *
 * `tours` NO contiene PR (eso vive en `tarifas`, Step 9.3), así que este módulo
 * no toca información confidencial.
 */

/** Campos editables de un tour (coincide con las columnas de la tabla `tours`). */
export const tourSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'El slug es obligatorio.')
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones (ej. isla-mujeres).'),
  nombre_es: z.string().trim().min(1, 'El nombre en español es obligatorio.').max(200),
  nombre_en: z.string().trim().min(1, 'El nombre en inglés es obligatorio.').max(200),
  categoria_es: z.string().trim().max(120).nullable(),
  categoria_en: z.string().trim().max(120).nullable(),
  operador: z.string().trim().max(120).nullable(),
  grupo_xcaret: z.boolean(),
  desc_corta_es: z.string().trim().max(400).nullable(),
  desc_corta_en: z.string().trim().max(400).nullable(),
  desc_larga_es: z.string().trim().nullable(),
  desc_larga_en: z.string().trim().nullable(),
  duracion: z.string().trim().max(120).nullable(),
  dias_operacion: z.array(z.string().trim().min(1)),
  horarios_salida: z.string().trim().max(200).nullable(),
  incluye_transporte: z.boolean(),
  punto_salida: z.string().trim().max(200).nullable(),
  incluye_es: z.array(z.string().trim().min(1)),
  incluye_en: z.array(z.string().trim().min(1)),
  no_incluye_es: z.array(z.string().trim().min(1)),
  no_incluye_en: z.array(z.string().trim().min(1)),
  que_llevar_es: z.string().trim().nullable(),
  que_llevar_en: z.string().trim().nullable(),
  mostrar_que_llevar: z.boolean(),
  restricciones_es: z.string().trim().nullable(),
  restricciones_en: z.string().trim().nullable(),
  mostrar_restricciones: z.boolean(),
  edad_menor_min: z.number().int().min(0).max(120).nullable(),
  edad_menor_max: z.number().int().min(0).max(120).nullable(),
  capacidad_min: z.number().int().min(1).max(1000),
  capacidad_max: z.number().int().min(1).max(1000),
  anticipacion_horas: z.number().int().min(0).max(2160),
  corte_horario: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Usa formato HH:MM (ej. 18:00).')
    .nullable(),
  solo_prepago: z.boolean(),
  impuesto_online: z.boolean(),
  activo: z.boolean(),
  orden: z.number().int().min(0).max(9999),
  imagen_principal: z.string().trim().max(300).nullable(),
});

export type TourInput = z.infer<typeof tourSchema>;

// ---- Helpers para leer FormData (todo llega como string) ----

/** Texto opcional: recorta y convierte '' → null. */
function texto(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Casilla: presente (=cualquier valor) → true. */
function casilla(form: FormData, key: string): boolean {
  return form.get(key) != null;
}

/** Entero opcional: '' o inválido → null. */
function enteroOpc(form: FormData, key: string): number | null {
  const v = texto(form, key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Entero con default si viene vacío/ inválido. */
function entero(form: FormData, key: string, def: number): number {
  const n = enteroOpc(form, key);
  return n ?? def;
}

/** Textarea → arreglo (una línea = un ítem; ignora líneas vacías). */
function lineas(form: FormData, key: string): string[] {
  const v = form.get(key);
  if (typeof v !== 'string') return [];
  return v
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Convierte el FormData del panel en un objeto validado, listo para
 * `insert`/`update`. Lanza si algo no cumple (mensajes en español).
 */
export function parseTourForm(form: FormData): { data: TourInput } | { errors: string[] } {
  const crudo = {
    slug: (texto(form, 'slug') ?? '').toLowerCase(),
    nombre_es: texto(form, 'nombre_es') ?? '',
    nombre_en: texto(form, 'nombre_en') ?? '',
    categoria_es: texto(form, 'categoria_es'),
    categoria_en: texto(form, 'categoria_en'),
    operador: texto(form, 'operador'),
    grupo_xcaret: casilla(form, 'grupo_xcaret'),
    desc_corta_es: texto(form, 'desc_corta_es'),
    desc_corta_en: texto(form, 'desc_corta_en'),
    desc_larga_es: texto(form, 'desc_larga_es'),
    desc_larga_en: texto(form, 'desc_larga_en'),
    duracion: texto(form, 'duracion'),
    dias_operacion: lineas(form, 'dias_operacion'),
    horarios_salida: texto(form, 'horarios_salida'),
    incluye_transporte: casilla(form, 'incluye_transporte'),
    punto_salida: texto(form, 'punto_salida'),
    incluye_es: lineas(form, 'incluye_es'),
    incluye_en: lineas(form, 'incluye_en'),
    no_incluye_es: lineas(form, 'no_incluye_es'),
    no_incluye_en: lineas(form, 'no_incluye_en'),
    que_llevar_es: texto(form, 'que_llevar_es'),
    que_llevar_en: texto(form, 'que_llevar_en'),
    mostrar_que_llevar: casilla(form, 'mostrar_que_llevar'),
    restricciones_es: texto(form, 'restricciones_es'),
    restricciones_en: texto(form, 'restricciones_en'),
    mostrar_restricciones: casilla(form, 'mostrar_restricciones'),
    edad_menor_min: enteroOpc(form, 'edad_menor_min'),
    edad_menor_max: enteroOpc(form, 'edad_menor_max'),
    capacidad_min: entero(form, 'capacidad_min', 1),
    capacidad_max: entero(form, 'capacidad_max', 50),
    anticipacion_horas: entero(form, 'anticipacion_horas', 24),
    corte_horario: texto(form, 'corte_horario'),
    solo_prepago: casilla(form, 'solo_prepago'),
    impuesto_online: casilla(form, 'impuesto_online'),
    activo: casilla(form, 'activo'),
    orden: entero(form, 'orden', 0),
    imagen_principal: texto(form, 'imagen_principal'),
  };

  const parsed = tourSchema.safeParse(crudo);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => i.message) };
  }

  // Reglas cruzadas simples.
  const d = parsed.data;
  const errores: string[] = [];
  if (d.capacidad_max < d.capacidad_min) {
    errores.push('La capacidad máxima no puede ser menor que la mínima.');
  }
  if (d.edad_menor_min != null && d.edad_menor_max != null && d.edad_menor_max < d.edad_menor_min) {
    errores.push('La edad máxima de menor no puede ser menor que la mínima.');
  }
  if (errores.length) return { errors: errores };

  return { data: d };
}
