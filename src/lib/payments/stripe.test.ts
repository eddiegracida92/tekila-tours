import { describe, expect, it } from 'vitest';
import { construirParamsCheckout } from '@/lib/payments/stripe';
import type { CrearSesionInput } from '@/lib/payments/provider';

const base: CrearSesionInput = {
  reservaId: 'res-123',
  folio: 'TK-2026-000123',
  descripcion: 'Tour Demo — 2 adultos · 2026-08-01',
  moneda: 'USD',
  total: 178,
  clienteEmail: 'cliente@example.com',
  idioma: 'es',
  successUrl: 'https://tekila.test/confirmacion/exito',
  cancelUrl: 'https://tekila.test/reservar/demo',
};

describe('construirParamsCheckout', () => {
  it('cobra un solo line item por el total, en centavos y moneda en minúsculas', () => {
    const p = construirParamsCheckout(base);
    expect(p.mode).toBe('payment');
    expect(p.line_items).toHaveLength(1);
    const item = p.line_items![0];
    expect(item.quantity).toBe(1);
    expect(item.price_data!.currency).toBe('usd');
    expect(item.price_data!.unit_amount).toBe(17800);
    expect(item.price_data!.product_data!.name).toBe(base.descripcion);
  });

  it('redondea a centavos sin ruido de coma flotante', () => {
    // 89.9 * 100 = 8989.999... en IEEE-754 → debe dar 8990, no 8989.
    expect(construirParamsCheckout({ ...base, total: 89.9 }).line_items![0].price_data!.unit_amount).toBe(8990);
    expect(construirParamsCheckout({ ...base, total: 247.35 }).line_items![0].price_data!.unit_amount).toBe(24735);
  });

  it('soporta MXN (también en centavos)', () => {
    const p = construirParamsCheckout({ ...base, moneda: 'MXN', total: 1500 });
    expect(p.line_items![0].price_data!.currency).toBe('mxn');
    expect(p.line_items![0].price_data!.unit_amount).toBe(150000);
  });

  it('mapea el idioma a locale de Stripe (es/en)', () => {
    expect(construirParamsCheckout({ ...base, idioma: 'es' }).locale).toBe('es');
    expect(construirParamsCheckout({ ...base, idioma: 'en' }).locale).toBe('en');
  });

  it('lleva la reserva en client_reference_id y en metadata (reconciliación del webhook)', () => {
    const p = construirParamsCheckout(base);
    expect(p.client_reference_id).toBe('res-123');
    expect(p.metadata).toEqual({ reservaId: 'res-123', folio: 'TK-2026-000123' });
  });

  it('prellena el correo y las URLs de retorno', () => {
    const p = construirParamsCheckout(base);
    expect(p.customer_email).toBe('cliente@example.com');
    expect(p.success_url).toBe(base.successUrl);
    expect(p.cancel_url).toBe(base.cancelUrl);
  });
});
