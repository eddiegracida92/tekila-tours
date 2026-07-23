import type { APIRoute } from 'astro';
import { createAdminClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/auth';
import { json, errorJson } from '@/lib/api';
import { CheckoutOnlineSchema } from '@/lib/vendedor/venta';
import { prepararReservaVendedor } from '@/lib/vendedor/crear-reserva';
import { stripeProvider } from '@/lib/payments/stripe';

// Portal de vendedores — modo B: el vendedor genera un link de pago en línea para
// que el cliente pague con tarjeta. Crea la reserva atribuida (helper compartido,
// estado `pago_iniciado`, comisión congelada) y una sesión de Stripe; el pago lo
// confirma el webhook idempotente del Step 8 (SIN cambios), marcándola `pagada`.
//
// Autorización: sesión de vendedor activo. La atribución sale de la sesión; el
// precio y la comisión, del servidor. El monto cobrado = total revalidado.
export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const perfil = await getAdminSession(request, cookies);
  if (!perfil) return errorJson('no_autenticado', 401);
  if (perfil.rol !== 'vendedor') return errorJson('no_autorizado', 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('json_invalido', 400);
  }

  const parsed = CheckoutOnlineSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }

  const supabase = createAdminClient();
  const prep = await prepararReservaVendedor(supabase, perfil.id, {
    ...parsed.data,
    metodoCobro: 'online',
  });
  if (!prep.ok) return errorJson(prep.error, prep.status);

  // Descripción del cobro (idioma del portal = es).
  const { adultos, menores } = parsed.data;
  const partes = [`${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}`];
  if (menores > 0) partes.push(`${menores} ${menores === 1 ? 'menor' : 'menores'}`);
  const descripcion = `${prep.tourNombre} — ${partes.join(', ')} · ${parsed.data.fecha}`;

  const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';

  let sesion;
  try {
    sesion = await stripeProvider.crearSesionDePago({
      reservaId: prep.reserva.id,
      folio: prep.reserva.folio,
      descripcion,
      moneda: prep.publico.moneda,
      total: prep.publico.total,
      clienteEmail: parsed.data.cliente.email || undefined,
      idioma: 'es',
      successUrl: `${siteUrl}/confirmacion/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/confirmacion/cancelado?folio=${prep.reserva.folio}`,
    });
  } catch {
    return errorJson('error_pago', 502);
  }

  // Guarda la referencia del proveedor para reconciliar con el webhook.
  await supabase
    .from('reservas')
    .update({ provider: sesion.provider, provider_ref: sesion.sesionId })
    .eq('id', prep.reserva.id);

  return json({ ok: true, folio: prep.reserva.folio, url: sesion.url }, 201);
};
