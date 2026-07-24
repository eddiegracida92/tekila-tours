/**
 * Cliente del navegador para el flujo de reserva (Step 7).
 *
 * Envuelve los endpoints server-side (`/api/quote`, `/api/availability`,
 * `/api/hold`) con tipos y una forma de resultado uniforme. El precio y el
 * cupo SIEMPRE los decide el servidor; esto solo pregunta y muestra.
 */
import type { Audiencia, QuotePublico, Moneda } from '@/lib/pricing';
import type { FechaDisponibilidad } from '@/lib/availability';

export type { Audiencia, QuotePublico, Moneda, FechaDisponibilidad };

/** Una fila del menú de programas (tarifa pública) del Step 10.0. */
export interface TarifaPublica {
  audiencia: Audiencia;
  temporada: 'unica' | 'baja' | 'alta';
  modalidad: string | null;
  moneda: Moneda;
  pp_adulto: number;
  pp_menor: number | null;
}

/** Resultado uniforme: éxito con datos, o error con código estable. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'red' };
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: 'respuesta_invalida' };
  }

  if (!res.ok || payload?.ok === false) {
    return { ok: false, error: payload?.error ?? 'error_generico' };
  }
  return { ok: true, data: payload as T };
}

export function fetchAvailability(
  slug: string,
  desde: string,
  hasta: string,
  personas: number,
): Promise<ApiResult<{ ok: true; fechas: FechaDisponibilidad[] }>> {
  return postJson('/api/availability', { slug, desde, hasta, personas });
}

export function fetchQuote(
  slug: string,
  fecha: string,
  audiencia: Audiencia,
  adultos: number,
  menores: number,
  modalidad?: string | null,
  moneda?: Moneda,
): Promise<ApiResult<{ ok: true; cotizacion: QuotePublico }>> {
  return postJson('/api/quote', {
    slug,
    fecha,
    audiencia,
    adultos,
    menores,
    ...(modalidad != null ? { modalidad } : {}),
    ...(moneda ? { moneda } : {}),
  });
}

/** Menú de programas/monedas de un tour (para el selector). */
export function fetchTarifasPublicas(
  slug: string,
): Promise<ApiResult<{ ok: true; tarifas: TarifaPublica[] }>> {
  return postJson('/api/tarifas-publicas', { slug });
}

export function createHold(
  slug: string,
  fecha: string,
  personas: number,
): Promise<ApiResult<{ ok: true; holdId: string; expiraEn: string }>> {
  return postJson('/api/hold', { slug, fecha, personas });
}

/** Datos mínimos del cliente para la reserva. */
export interface CheckoutCliente {
  nombre: string;
  email: string;
  telefono: string;
}

export interface CheckoutInput {
  slug: string;
  holdId: string;
  fecha: string;
  audiencia: Audiencia;
  adultos: number;
  menores: number;
  cliente: CheckoutCliente;
  idioma: 'es' | 'en';
  /** Opt-in explícito de marketing (casilla del checkout). */
  marketingOptIn?: boolean;
  /** Programa y moneda elegidos (Step 10.0). */
  modalidad?: string | null;
  moneda?: Moneda;
}

/**
 * Crea la reserva y la sesión de pago. Devuelve la URL de Stripe a la que el
 * navegador debe redirigir. El precio se revalida SIEMPRE en el servidor.
 */
export function checkout(
  input: CheckoutInput,
): Promise<ApiResult<{ ok: true; folio: string; url: string }>> {
  return postJson('/api/checkout', input);
}
