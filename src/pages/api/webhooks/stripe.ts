import type { APIRoute } from 'astro';
import { createAdminClient } from '@/lib/supabase';
import { construirEventoWebhook } from '@/lib/payments/stripe';

// Ruta on-demand. Único camino para confirmar un pago (regla no negociable #3):
// Stripe avisa aquí, verificamos la FIRMA, y confirmamos la reserva vía la RPC
// idempotente `confirmar_reserva`. El navegador nunca confirma el pago.
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('firma_ausente', { status: 400 });
  }

  // Cuerpo CRUDO: la firma se calcula sobre los bytes originales, no sobre un
  // JSON re-serializado. Por eso `request.text()`, nunca `request.json()`.
  const rawBody = await request.text();

  let event;
  try {
    event = construirEventoWebhook(rawBody, signature);
  } catch {
    // Firma inválida (o secreto mal configurado) → 400, Stripe reintenta.
    return new Response('firma_invalida', { status: 400 });
  }

  // Solo nos interesa el pago completado del Checkout. Otros eventos → 200
  // (los aceptamos para que Stripe no reintente, pero no hacen nada).
  if (event.type !== 'checkout.session.completed') {
    return new Response('ignorado', { status: 200 });
  }

  const session = event.data.object as {
    id: string;
    client_reference_id: string | null;
    metadata: Record<string, string> | null;
    amount_total: number | null;
    currency: string | null;
    payment_status: string | null;
  };

  const reservaId = session.metadata?.reservaId ?? session.client_reference_id;
  if (!reservaId) {
    // Sin referencia no podemos reconciliar; 200 para no forzar reintentos.
    return new Response('sin_reserva', { status: 200 });
  }
  if (session.payment_status !== 'paid') {
    return new Response('no_pagado', { status: 200 });
  }

  const monto = (session.amount_total ?? 0) / 100; // Stripe cobra en centavos.
  const moneda = (session.currency ?? 'usd').toUpperCase();

  const supabase = createAdminClient();
  const { error } = await supabase.rpc('confirmar_reserva', {
    p_reserva_id: reservaId,
    p_provider: 'stripe',
    p_provider_ref: session.id, // mismo ref que guardó /api/checkout
    p_monto: monto,
    p_moneda: moneda,
    p_raw: event as unknown as Record<string, unknown>,
  });

  if (error) {
    // Error transitorio de BD → 500 para que Stripe reintente el aviso.
    return new Response('error_confirmar', { status: 500 });
  }

  return new Response('ok', { status: 200 });
};
