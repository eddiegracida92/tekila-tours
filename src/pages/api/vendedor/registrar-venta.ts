import type { APIRoute } from 'astro';
import { createAdminClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/auth';
import { json, errorJson } from '@/lib/api';
import { RegistrarVentaSchema } from '@/lib/vendedor/venta';
import { prepararReservaVendedor } from '@/lib/vendedor/crear-reserva';

// Portal de vendedores — modo A: venta cobrada en efectivo/terminal propia. Crea
// la reserva atribuida (helper compartido) y la marca `pagada` SIN Stripe,
// reutilizando la RPC atómica `confirmar_reserva` (cupo + consumo de hold +
// registro de pago, idempotente).
//
// Autorización: sesión de vendedor activo. La atribución (`vendedor_id`) sale de
// la sesión, NUNCA del payload. El precio y la comisión se resuelven server-side
// dentro del helper.
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

  const parsed = RegistrarVentaSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson('payload_invalido', 422, parsed.error.flatten());
  }
  const { metodoCobro, ...base } = parsed.data;

  const supabase = createAdminClient();
  const prep = await prepararReservaVendedor(supabase, perfil.id, { ...base, metodoCobro });
  if (!prep.ok) return errorJson(prep.error, prep.status);

  // Confirma la venta SIN Stripe: proveedor `manual`, ref = folio. La RPC marca
  // `pagada`, incrementa cupo, consume el hold y registra el pago (idempotente).
  const { error: confErr } = await supabase.rpc('confirmar_reserva', {
    p_reserva_id: prep.reserva.id,
    p_provider: 'manual',
    p_provider_ref: prep.reserva.folio,
    p_monto: prep.publico.total,
    p_moneda: prep.publico.moneda,
    p_raw: { canal: 'vendedor', metodo_cobro: metodoCobro, vendedor_id: perfil.id },
  });
  if (confErr) return errorJson('error_confirmacion', 500);

  return json({ ok: true, folio: prep.reserva.folio }, 201);
};
