/**
 * Motor de precios (Step 6) — función PURA y server-side.
 *
 * Resuelve la temporada de una fecha, elige la tarifa correcta
 * (audiencia + temporada), y calcula subtotal, impuestos y total.
 *
 * Regla no negociable #2: el precio cobrado = salida de este motor (servidor);
 * nunca se confía en el cliente.
 * Regla no negociable #5: el PR (costo) se calcula para el margen del admin,
 * pero va en `interno` — el endpoint JAMÁS lo serializa al navegador.
 */

export type Audiencia = 'nacional' | 'extranjero';
export type Temporada = 'unica' | 'baja' | 'alta';
export type Moneda = 'USD' | 'MXN';

/** Fila de `tarifas` (subconjunto necesario para cotizar). */
export interface Tarifa {
  audiencia: Audiencia;
  temporada: Temporada;
  modalidad: string | null;
  moneda: Moneda;
  pp_adulto: number;
  pp_menor: number | null;
  pr_adulto: number;
  pr_menor: number | null;
  impuesto_adulto: number;
  impuesto_menor: number;
  activo: boolean;
}

/** Rango de temporada (tabla `temporadas`), fechas ISO `YYYY-MM-DD`. */
export interface RangoTemporada {
  tipo: Temporada;
  fecha_inicio: string;
  fecha_fin: string;
}

export interface QuoteInput {
  fecha: string; // ISO `YYYY-MM-DD`
  audiencia: Audiencia;
  adultos: number;
  menores: number;
  impuestoOnline: boolean;
  tarifas: Tarifa[];
  temporadas: RangoTemporada[];
  /** Programa elegido por el cliente. Si se omite, se toma el más barato. */
  modalidad?: string | null;
  /** Moneda elegida por el cliente. Si se omite, no se filtra por moneda. */
  moneda?: Moneda;
}

/** Filtros opcionales de selección de tarifa (Step 10.0). */
export interface OpcionesTarifa {
  modalidad?: string | null;
  moneda?: Moneda;
}

/** Cotización pública — lo único que puede ver el navegador. */
export interface QuotePublico {
  moneda: Moneda;
  temporada: Temporada;
  adultos: { cantidad: number; precioUnitario: number; importe: number };
  menores: { cantidad: number; precioUnitario: number; importe: number };
  subtotal: number;
  impuestos: number;
  total: number;
}

/** Datos internos (margen/PR) — solo servidor, NUNCA al cliente. */
export interface QuoteInterno {
  costoTotalPr: number;
  margen: number;
}

export interface QuoteResult {
  publico: QuotePublico;
  interno: QuoteInterno;
}

/** Error de negocio con código estable para el endpoint. */
export class PricingError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'PricingError';
  }
}

/** Redondeo monetario a 2 decimales (evita ruido de coma flotante). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Temporada que aplica a una fecha según los rangos configurados.
 * Compara strings ISO (mismo formato) → sin parsear Date ni líos de zona.
 * `alta` tiene prioridad si dos rangos se traslapan.
 */
export function temporadaDeFecha(
  fecha: string,
  temporadas: RangoTemporada[],
): Temporada | null {
  let encontrada: Temporada | null = null;
  for (const t of temporadas) {
    if (fecha >= t.fecha_inicio && fecha <= t.fecha_fin) {
      if (t.tipo === 'alta') return 'alta';
      encontrada = t.tipo;
    }
  }
  return encontrada;
}

/**
 * Elige la tarifa activa por audiencia, con preferencia de temporada:
 * primero la temporada de la fecha, luego `unica`, luego cualquiera activa.
 *
 * Si `opciones.moneda` y/o `opciones.modalidad` vienen (Step 10.0 — tours con
 * varios programas y 2 monedas), se filtra a ESA tarifa exacta antes de aplicar
 * la preferencia de temporada; si no existe, lanza `moneda_no_disponible` /
 * `modalidad_no_disponible`. Si no vienen, mantiene el comportamiento anterior:
 * entre varias modalidades toma la más barata (determinista).
 */
export function elegirTarifa(
  tarifas: Tarifa[],
  audiencia: Audiencia,
  temporadaFecha: Temporada | null,
  opciones: OpcionesTarifa = {},
): Tarifa {
  let activas = tarifas.filter((t) => t.activo && t.audiencia === audiencia);
  if (activas.length === 0) throw new PricingError('sin_tarifa_audiencia');

  if (opciones.moneda) {
    const enMoneda = activas.filter((t) => t.moneda === opciones.moneda);
    if (enMoneda.length === 0) throw new PricingError('moneda_no_disponible');
    activas = enMoneda;
  }

  if (opciones.modalidad != null) {
    const enModalidad = activas.filter((t) => t.modalidad === opciones.modalidad);
    if (enModalidad.length === 0) throw new PricingError('modalidad_no_disponible');
    activas = enModalidad;
  }

  const preferencias: Temporada[] = [];
  if (temporadaFecha) preferencias.push(temporadaFecha);
  if (!preferencias.includes('unica')) preferencias.push('unica');

  for (const temp of preferencias) {
    const candidatas = activas.filter((t) => t.temporada === temp);
    if (candidatas.length > 0) {
      return candidatas.reduce((a, b) => (b.pp_adulto < a.pp_adulto ? b : a));
    }
  }
  // Fallback: la más barata de las activas de esa audiencia.
  return activas.reduce((a, b) => (b.pp_adulto < a.pp_adulto ? b : a));
}

/** Cotiza una reserva. Lanza `PricingError` en casos de negocio inválidos. */
export function cotizar(input: QuoteInput): QuoteResult {
  const { fecha, audiencia, adultos, menores, impuestoOnline } = input;

  if (!Number.isInteger(adultos) || adultos < 1) {
    throw new PricingError('adultos_invalido');
  }
  if (!Number.isInteger(menores) || menores < 0) {
    throw new PricingError('menores_invalido');
  }

  const temporadaFecha = temporadaDeFecha(fecha, input.temporadas);
  const tarifa = elegirTarifa(input.tarifas, audiencia, temporadaFecha, {
    modalidad: input.modalidad,
    moneda: input.moneda,
  });

  if (menores > 0 && tarifa.pp_menor == null) {
    throw new PricingError('menor_no_disponible');
  }

  const ppAdulto = tarifa.pp_adulto;
  const ppMenor = tarifa.pp_menor ?? 0;

  const importeAdultos = round2(adultos * ppAdulto);
  const importeMenores = round2(menores * ppMenor);
  const subtotal = round2(importeAdultos + importeMenores);

  const impuestos = impuestoOnline
    ? round2(adultos * tarifa.impuesto_adulto + menores * tarifa.impuesto_menor)
    : 0;

  const total = round2(subtotal + impuestos);

  // PR (costo) — solo para el margen del admin. NUNCA sale al cliente.
  const prMenor = tarifa.pr_menor ?? 0;
  const costoTotalPr = round2(adultos * tarifa.pr_adulto + menores * prMenor);
  const margen = round2(total - costoTotalPr);

  return {
    publico: {
      moneda: tarifa.moneda,
      temporada: tarifa.temporada,
      adultos: { cantidad: adultos, precioUnitario: ppAdulto, importe: importeAdultos },
      menores: { cantidad: menores, precioUnitario: ppMenor, importe: importeMenores },
      subtotal,
      impuestos,
      total,
    },
    interno: { costoTotalPr, margen },
  };
}
