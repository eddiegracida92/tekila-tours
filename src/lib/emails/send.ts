/**
 * Envío de correos con Resend (Step 8.3b) — SOLO servidor.
 *
 * Remitente configurable vía EMAIL_FROM. Sin dominio verificado se usa el
 * remitente de prueba de Resend (`onboarding@resend.dev`), que SOLO entrega
 * a la dirección de la cuenta Resend. En producción: verificar dominio propio
 * y poner EMAIL_FROM = "Tekila Tours <reservas@tudominio.com>".
 */

import { Resend } from 'resend';
import { plantillaConfirmacion, type DatosConfirmacion } from '@/lib/emails/confirmacion';
import { plantillaCampana, type DatosCampana } from '@/lib/emails/campana';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const key = import.meta.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('Falta RESEND_API_KEY (secreto, solo servidor). Ver .env.example.');
  }
  _resend = new Resend(key);
  return _resend;
}

function remitente(): string {
  return import.meta.env.EMAIL_FROM ?? 'Tekila Tours <onboarding@resend.dev>';
}

/** Resultado uniforme del envío (no lanza; el caller decide qué hacer). */
export type EnvioResult = { ok: true; id: string } | { ok: false; error: string };

/** Envía el correo de confirmación de reserva. */
export async function enviarConfirmacion(
  destinatario: string,
  datos: DatosConfirmacion,
): Promise<EnvioResult> {
  const { subject, html, text } = plantillaConfirmacion(datos);
  try {
    const { data, error } = await getResend().emails.send({
      from: remitente(),
      to: destinatario,
      subject,
      html,
      text,
    });
    if (error) return { ok: false, error: error.message ?? 'resend_error' };
    return { ok: true, id: data?.id ?? '' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'resend_exception' };
  }
}

/** Envía un correo de campaña (marketing, Step 9.7.3) a un destinatario. */
export async function enviarCampana(
  destinatario: string,
  datos: DatosCampana,
): Promise<EnvioResult> {
  const { subject, html, text } = plantillaCampana(datos);
  try {
    const { data, error } = await getResend().emails.send({
      from: remitente(),
      to: destinatario,
      subject,
      html,
      text,
    });
    if (error) return { ok: false, error: error.message ?? 'resend_error' };
    return { ok: true, id: data?.id ?? '' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'resend_exception' };
  }
}
