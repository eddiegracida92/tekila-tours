import { z } from 'zod';
import { randomInt } from 'node:crypto';

/**
 * Validación del alta/edición de vendedores (Step 9.5, panel del owner).
 *
 * Solo el owner gestiona vendedores (RLS `admin_users_owner_write` + guardia
 * en la página). El alta necesita `email` (para crear la cuenta de Auth); la
 * edición NO cambia email ni contraseña, solo nombre/comisión/permisos/activo.
 *
 * Comisión: `tipo` (porcentaje|monto) + `valor`. Se calcula sobre el TOTAL de
 * la venta (nunca sobre margen/PR) y se congela por reserva al vender (columnas
 * `comision_*` de `reservas`); esto solo define el modelo por vendedor.
 */

export const COMISION_TIPOS = ['porcentaje', 'monto'] as const;

/** Switches de `admin_users.permisos` que el owner puede conceder. */
export const PERMISOS = [
  { key: 'puede_ver_pr', label: 'Puede ver el PR (costo)', hint: 'Le permite ver el precio de costo para negociar. Default: no.' },
  { key: 'puede_descuentos', label: 'Puede aplicar descuentos', hint: 'Autoriza ajustar el precio al vender.' },
  { key: 've_disponibilidad_todos', label: 'Ve disponibilidad de todos los tours', hint: 'Si no, solo la de los que se le asignen.' },
] as const;

/** Base común (comisión + permisos + nombre). */
const baseVendedor = z
  .object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(120),
    comision_tipo: z.enum(COMISION_TIPOS).nullable(),
    comision_valor: z.number().min(0).max(1_000_000).nullable(),
    puede_ver_pr: z.boolean(),
    puede_descuentos: z.boolean(),
    ve_disponibilidad_todos: z.boolean(),
  })
  .refine((d) => (d.comision_tipo == null) === (d.comision_valor == null), {
    message: 'La comisión necesita tipo Y valor (o dejar ambos vacíos).',
    path: ['comision_valor'],
  })
  .refine((d) => d.comision_tipo !== 'porcentaje' || (d.comision_valor ?? 0) <= 100, {
    message: 'Un porcentaje de comisión no puede ser mayor a 100.',
    path: ['comision_valor'],
  });

export const vendedorNuevoSchema = z.intersection(
  z.object({ email: z.string().trim().toLowerCase().email('Correo inválido.') }),
  baseVendedor,
);

export const vendedorEditarSchema = baseVendedor;

export type VendedorNuevo = z.infer<typeof vendedorNuevoSchema>;
export type VendedorEditar = z.infer<typeof vendedorEditarSchema>;

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

/** Campos comunes crudos desde el FormData (comisión + permisos + nombre). */
function baseCrudo(form: FormData) {
  const tipo = texto(form, 'comision_tipo');
  const valorRaw = texto(form, 'comision_valor');
  return {
    nombre: texto(form, 'nombre') ?? '',
    comision_tipo: tipo,
    comision_valor: valorRaw == null ? null : Number(valorRaw),
    puede_ver_pr: casilla(form, 'puede_ver_pr'),
    puede_descuentos: casilla(form, 'puede_descuentos'),
    ve_disponibilidad_todos: casilla(form, 've_disponibilidad_todos'),
  };
}

export function parseVendedorNuevo(form: FormData): { data: VendedorNuevo } | { errors: string[] } {
  const crudo = { email: texto(form, 'email') ?? '', ...baseCrudo(form) };
  if (crudo.comision_valor != null && Number.isNaN(crudo.comision_valor)) {
    return { errors: ['El valor de comisión debe ser numérico.'] };
  }
  const parsed = vendedorNuevoSchema.safeParse(crudo);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  return { data: parsed.data };
}

export function parseVendedorEditar(form: FormData): { data: VendedorEditar } | { errors: string[] } {
  const crudo = baseCrudo(form);
  if (crudo.comision_valor != null && Number.isNaN(crudo.comision_valor)) {
    return { errors: ['El valor de comisión debe ser numérico.'] };
  }
  const parsed = vendedorEditarSchema.safeParse(crudo);
  if (!parsed.success) return { errors: parsed.error.issues.map((i) => i.message) };
  return { data: parsed.data };
}

/** Arma el objeto `permisos` (jsonb) a partir de los flags validados. */
export function armarPermisos(d: {
  puede_ver_pr: boolean;
  puede_descuentos: boolean;
  ve_disponibilidad_todos: boolean;
}): Record<string, boolean> {
  return {
    puede_ver_pr: d.puede_ver_pr,
    puede_descuentos: d.puede_descuentos,
    ve_disponibilidad_todos: d.ve_disponibilidad_todos,
  };
}

/**
 * Contraseña temporal legible para la primera entrada del vendedor. Se muestra
 * UNA vez al owner (nunca se guarda en claro por nosotros: Supabase la guarda
 * hasheada). El vendedor debería cambiarla al entrar. Sin caracteres ambiguos.
 */
export function generarPasswordTemporal(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I, O
  const num = '23456789'; // sin 0, 1
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[randomInt(set.length)]).join('');
  return `${pick(abc, 4)}-${pick(num, 4)}-${pick(abc, 4)}`;
}
