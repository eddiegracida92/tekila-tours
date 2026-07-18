/**
 * Disponibilidad (Step 6) — funciones PURAS y server-side.
 *
 * El cupo libre = cupo_total − cupo_reservado − holds activos vigentes.
 * `cupo_total` null = ilimitado (sujeto a confirmación con el operador).
 * La verdad del cupo se resuelve en el servidor; el cliente solo pregunta.
 */

/** Fila de `disponibilidad` (subconjunto necesario). */
export interface Disponibilidad {
  fecha: string; // ISO `YYYY-MM-DD`
  cupo_total: number | null;
  cupo_reservado: number;
  bloqueada: boolean;
}

/**
 * Cupo libre de una fecha. `null` = ilimitado.
 * @param holdsPersonas suma de personas en holds activos vigentes de esa fecha.
 */
export function cupoLibre(row: Disponibilidad, holdsPersonas: number): number | null {
  if (row.cupo_total == null) return null; // ilimitado
  return Math.max(0, row.cupo_total - row.cupo_reservado - holdsPersonas);
}

/** ¿Hay lugar para `personas` en esa fecha? */
export function estaDisponible(
  row: Disponibilidad,
  holdsPersonas: number,
  personas = 1,
): boolean {
  if (row.bloqueada) return false;
  const libre = cupoLibre(row, holdsPersonas);
  return libre == null || libre >= personas;
}

export interface FechaDisponibilidad {
  fecha: string;
  disponible: boolean;
  cupoLibre: number | null; // null = ilimitado
}

/**
 * Calcula la disponibilidad de un conjunto de fechas.
 * @param holdsPorFecha personas en holds activos vigentes, agrupadas por fecha.
 */
export function calcularDisponibilidad(
  filas: Disponibilidad[],
  holdsPorFecha: Map<string, number>,
  personas = 1,
): FechaDisponibilidad[] {
  return filas.map((row) => {
    const holds = holdsPorFecha.get(row.fecha) ?? 0;
    return {
      fecha: row.fecha,
      disponible: estaDisponible(row, holds, personas),
      cupoLibre: cupoLibre(row, holds),
    };
  });
}
