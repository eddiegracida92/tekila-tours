/**
 * Implementación Stripe del `PaymentProvider` (Step 8.1) — SOLO servidor.
 *
 * Usa Stripe Checkout (página de pago alojada por Stripe): el servidor crea
 * la sesión con la Secret key y devuelve la URL de redirección. No se usa la
 * Publishable key porque el formulario de tarjeta vive en Stripe, no en el sitio.
 *
 * El monto se cobra tal cual llega en `input.total` (fuente de verdad =
 * `/api/quote`). Un solo line item con el total evita discrepancias de redondeo.
 */

import Stripe from 'stripe';
import type { CrearSesionInput, PaymentProvider, SesionPago } from '@/lib/payments/provider';

let _stripe: Stripe | null = null;

/** Cliente Stripe perezoso (se crea al primer uso, ya en runtime del servidor). */
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Falta STRIPE_SECRET_KEY (secreto, solo servidor). Ver .env.example.');
  }
  _stripe = new Stripe(key);
  return _stripe;
}

/**
 * USD y MXN cobran en la unidad mínima (centavos) → total × 100.
 * (Ambas son monedas de 2 decimales en Stripe; no aplican reglas de
 * monedas sin decimales como JPY, que aquí no se usan.)
 */
function aCentavos(monto: number): number {
  return Math.round((monto + Number.EPSILON) * 100);
}

/**
 * Construye los parámetros de la sesión de Checkout. PURA y testeable
 * (sin red): se separa de la llamada para poder verificar moneda, centavos,
 * metadata y locale sin tocar la API de Stripe.
 */
export function construirParamsCheckout(
  input: CrearSesionInput,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'payment',
    customer_email: input.clienteEmail,
    client_reference_id: input.reservaId,
    locale: input.idioma === 'en' ? 'en' : 'es',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.moneda.toLowerCase(),
          unit_amount: aCentavos(input.total),
          product_data: { name: input.descripcion },
        },
      },
    ],
    // Reconciliación con el webhook (Step 8.2): de la sesión al negocio.
    metadata: { reservaId: input.reservaId, folio: input.folio },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

/** Proveedor Stripe. Se inyecta en `/api/checkout` (Step 8.2). */
export const stripeProvider: PaymentProvider = {
  nombre: 'stripe',

  async crearSesionDePago(input: CrearSesionInput): Promise<SesionPago> {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(construirParamsCheckout(input));
    if (!session.url) {
      throw new Error('Stripe no devolvió URL de checkout.');
    }
    return { provider: 'stripe', sesionId: session.id, url: session.url };
  },
};

/**
 * Verifica la firma de un webhook de Stripe y devuelve el evento tipado.
 * `rawBody` DEBE ser el cuerpo crudo (texto exacto), no el JSON re-serializado:
 * la firma se calcula sobre los bytes originales. Lanza si la firma no valida.
 */
export function construirEventoWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Falta STRIPE_WEBHOOK_SECRET (secreto, solo servidor). Ver .env.example.');
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
