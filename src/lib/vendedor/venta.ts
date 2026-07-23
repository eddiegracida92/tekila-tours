import { z } from 'zod';

/**
 * Registro de venta del portal de vendedores (Step 9.5-portal, modo A).
 *
 * Modo A = venta cobrada en EFECTIVO o en la terminal propia del vendedor: la
 * reserva se marca `pagada` sin pasar por Stripe. La atribución (`vendedor_id`)
 * viene SIEMPRE de la sesión autenticada, nunca del payload; el precio se
 * revalida en el servidor con `cotizar`; y la comisión se calcula y se CONGELA
 * aquí con la config del vendedor (nunca desde el navegador).
 */

export const METODOS_COBRO = ['efectivo', 'terminal_externa'] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];

export const RegistrarVentaSchema = z.object({
  slug: z.string().min(1).max(120),
  holdId: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha_iso_invalida'),
  audiencia: z.enum(['nacional', 'extranjero']),
  adultos: z.number().int().min(1).max(50),
  menores: z.number().int().min(0).max(50),
  cliente: z
    .object({
      nombre: z.string().trim().min(1).max(160),
      // En una venta en efectivo el vendedor puede no tener correo/teléfono del
      // cliente; son opcionales (las columnas son NOT NULL → se guardan vacías).
      telefono: z.string().trim().max(40).optional(),
      email: z.string().trim().max(200).optional(),
    })
    // Solo valida el formato si viene un correo no vacío.
    .refine((c) => !c.email || z.string().email().safeParse(c.email).success, {
      message: 'email_invalido',
      path: ['email'],
    })
    // Normaliza ausentes a '' para satisfacer las columnas NOT NULL.
    .transform((c) => ({ nombre: c.nombre, telefono: c.telefono ?? '', email: c.email ?? '' })),
  metodoCobro: z.enum(METODOS_COBRO),
});

export type RegistrarVentaInput = z.infer<typeof RegistrarVentaSchema>;

/** Config de comisión del vendedor (de `admin_users`). */
export interface ComisionConfig {
  tipo: 'porcentaje' | 'monto' | null;
  valor: number | null;
}

/** Comisión congelada por venta: snapshot de tipo/valor + monto calculado. */
export interface ComisionCongelada {
  tipo: 'porcentaje' | 'monto' | null;
  valor: number | null;
  monto: number;
}

/**
 * Calcula la comisión sobre el TOTAL de la venta (nunca sobre margen/PR).
 * - `porcentaje`: total × valor%, redondeado a 2 decimales.
 * - `monto`: cantidad fija por venta.
 * - sin config: 0 (el vendedor no tiene comisión definida).
 * El resultado se guarda congelado en la reserva; cambiar la config del
 * vendedor después NO altera ventas ya registradas.
 */
export function calcularComision(total: number, cfg: ComisionConfig): ComisionCongelada {
  if (cfg.tipo == null || cfg.valor == null) {
    return { tipo: null, valor: null, monto: 0 };
  }
  const monto =
    cfg.tipo === 'porcentaje'
      ? Math.round(total * cfg.valor) / 100 // total × valor/100, a 2 decimales
      : cfg.valor;
  return { tipo: cfg.tipo, valor: cfg.valor, monto };
}
