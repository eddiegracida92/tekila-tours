import { useState } from 'react';
import { checkout, type Audiencia, type Moneda } from '@/lib/booking-client';
import type { Lang, Translate } from './types';

interface Props {
  t: Translate;
  lang: Lang;
  slug: string;
  holdId: string;
  fecha: string;
  audiencia: Audiencia;
  adultos: number;
  menores: number;
  modalidad?: string;
  moneda?: Moneda;
}

/** Traduce un código de error del checkout a una clave i18n. */
function checkoutErrorKey(code: string): string {
  if (code === 'hold_invalido' || code === 'hold_expirado' || code === 'hold_no_coincide') {
    return 'booking.err_hold_expiro';
  }
  if (code === 'error_pago') return 'booking.err_pago';
  if (code === 'payload_invalido') return 'booking.err_datos';
  return 'booking.err_generic';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Datos del cliente + consentimiento de marketing + botón de pago.
 * Al enviar, crea la reserva y redirige a la página de pago de Stripe.
 */
export default function CheckoutForm({
  t,
  lang,
  slug,
  holdId,
  fecha,
  audiencia,
  adultos,
  menores,
  modalidad,
  moneda,
}: Props) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreOk = nombre.trim().length >= 2;
  const emailOk = EMAIL_RE.test(email.trim());
  const telOk = telefono.trim().length >= 7;
  const formOk = nombreOk && emailOk && telOk;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formOk || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await checkout({
      slug,
      holdId,
      fecha,
      audiencia,
      adultos,
      menores,
      cliente: { nombre: nombre.trim(), email: email.trim(), telefono: telefono.trim() },
      idioma: lang,
      marketingOptIn: optIn,
      modalidad,
      moneda,
    });

    if (res.ok) {
      // Redirige a la página de pago alojada por Stripe.
      window.location.href = res.data.url;
      return; // se mantiene "submitting" durante la navegación
    }
    setError(t(checkoutErrorKey(res.error)));
    setSubmitting(false);
  }

  return (
    <form className="bk-checkout" onSubmit={onSubmit} noValidate>
      <h3 className="bk-checkout-title">{t('booking.pay_title')}</h3>

      <label className="bk-field">
        <span>{t('booking.field_name')}</span>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="name"
          required
        />
      </label>

      <label className="bk-field">
        <span>{t('booking.field_email')}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
      </label>

      <label className="bk-field">
        <span>{t('booking.field_phone')}</span>
        <input
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          autoComplete="tel"
          inputMode="tel"
          required
        />
      </label>

      <label className="bk-consent">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
        <span>{t('booking.marketing_optin')}</span>
      </label>

      <button type="submit" className="btn-primary bk-hold-btn" disabled={!formOk || submitting}>
        {submitting ? t('booking.pay_redirecting') : t('booking.pay_cta')}
      </button>

      {error && <p className="bk-summary-error">{error}</p>}
      <p className="bk-pay-note">{t('booking.pay_secure_note')}</p>
    </form>
  );
}
