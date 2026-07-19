import { z } from 'zod';

/**
 * Dashboard de ventas / margen / comisiones (Step 9.4, panel del owner/staff).
 *
 * Los datos salen de la RPC `dashboard_ventas(p_desde, p_hasta)` (definer):
 * agregados de reservas pagada/confirmada por (vendedor, moneda) en el rango de
 * FECHA DE VENTA (`creado_en`). El candado del PR vive en la BD: `margen` llega
 * `null` a quien no puede verlo (staff), y la función devuelve 0 filas a quien
 * no es owner/staff. Aquí solo validamos el rango de fechas y formateamos.
 */

/** Una fila del resultado de `dashboard_ventas`. */
export interface FilaVentas {
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  moneda: 'MXN' | 'USD';
  num_ventas: number;
  ingresos: number;
  comisiones: number;
  /** Suma de margen en esa moneda; `null` si el admin no puede ver el PR. */
  margen: number | null;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.');

/** Rango de fechas validado (ambos extremos inclusivos). */
export const rangoSchema = z
  .object({ desde: isoDate, hasta: isoDate })
  .refine((d) => d.desde <= d.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final.',
    path: ['hasta'],
  });

export type Rango = z.infer<typeof rangoSchema>;

/** Formatea una fecha local como AAAA-MM-DD (sin corrimiento por zona). */
function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Rango por defecto: del día 1 del mes en curso a hoy. */
export function rangoPorDefecto(hoy: Date = new Date()): Rango {
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: aISO(primero), hasta: aISO(hoy) };
}

/**
 * Lee el rango de los query params. Si faltan ambos, usa el mes en curso; si
 * vienen pero son inválidos, cae al rango por defecto y expone el mensaje de
 * error para mostrarlo en la UI (sin romper la página).
 */
export function parseRango(params: URLSearchParams): { rango: Rango; error: string | null } {
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  if (!desde && !hasta) return { rango: rangoPorDefecto(), error: null };

  const parsed = rangoSchema.safeParse({ desde: desde ?? '', hasta: hasta ?? '' });
  if (!parsed.success) {
    return {
      rango: rangoPorDefecto(),
      error: parsed.error.issues[0]?.message ?? 'Rango de fechas inválido.',
    };
  }
  return { rango: parsed.data, error: null };
}

/** Totales consolidados POR MONEDA (nunca se mezclan monedas distintas). */
export interface TotalMoneda {
  moneda: 'MXN' | 'USD';
  num_ventas: number;
  ingresos: number;
  comisiones: number;
  /** `null` si el admin no puede ver el PR. */
  margen: number | null;
}

/** Suma las filas por moneda para las tarjetas de totales. */
export function totalesPorMoneda(filas: FilaVentas[]): TotalMoneda[] {
  const acc = new Map<string, TotalMoneda>();
  for (const f of filas) {
    const t =
      acc.get(f.moneda) ??
      { moneda: f.moneda, num_ventas: 0, ingresos: 0, comisiones: 0, margen: f.margen === null ? null : 0 };
    t.num_ventas += Number(f.num_ventas);
    t.ingresos += Number(f.ingresos);
    t.comisiones += Number(f.comisiones);
    if (t.margen !== null && f.margen !== null) t.margen += Number(f.margen);
    acc.set(f.moneda, t);
  }
  // Orden estable: MXN primero, luego USD.
  return [...acc.values()].sort((a, b) => a.moneda.localeCompare(b.moneda));
}

/** Formatea un monto con separadores y la moneda. */
export function fmtDinero(monto: number, moneda: string): string {
  return `${moneda} ${Number(monto).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
