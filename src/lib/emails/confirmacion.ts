/**
 * Plantilla del correo de confirmación de reserva (Step 8.3b) — PURA.
 * Bilingüe es/en. Devuelve asunto + HTML + texto plano. Los emails requieren
 * estilos inline (muchos clientes ignoran <style>), por eso van en atributos.
 */

export interface DatosConfirmacion {
  folio: string;
  tourNombre: string;
  fecha: string; // ISO YYYY-MM-DD
  adultos: number;
  menores: number;
  total: number;
  moneda: string;
  clienteNombre: string;
  idioma: 'es' | 'en';
}

const COLORS = { navy: '#12192C', gold: '#D4AB3B', text: '#1A1A2E', muted: '#6B7280', sand: '#FAFAF6' };

/**
 * Escapa texto antes de interpolarlo en el HTML del correo. `clienteNombre`
 * llega del formulario público de checkout (sin filtro de caracteres): sin
 * esto, un "nombre" con etiquetas inyecta HTML en un correo legítimo nuestro.
 * La versión de texto plano NO se escapa (no es HTML).
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formatea una fecha ISO a texto largo local, sin líos de zona horaria. */
function formatearFecha(iso: string, lang: 'es' | 'en'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fecha);
}

interface Textos {
  subject: string;
  greeting: string;
  confirmed: string;
  labelFolio: string;
  labelTour: string;
  labelDate: string;
  labelPeople: string;
  labelTotal: string;
  adults: (n: number) => string;
  minors: (n: number) => string;
  closing: string;
  team: string;
}

function textos(d: DatosConfirmacion): Textos {
  if (d.idioma === 'en') {
    return {
      subject: `Your booking confirmation ${d.folio} — Tekila Tours`,
      greeting: `Hi ${d.clienteNombre},`,
      confirmed: 'Your payment was received and your booking is confirmed. 🎉',
      labelFolio: 'Booking reference',
      labelTour: 'Tour',
      labelDate: 'Date',
      labelPeople: 'Passengers',
      labelTotal: 'Total paid',
      adults: (n) => `${n} ${n === 1 ? 'adult' : 'adults'}`,
      minors: (n) => `${n} ${n === 1 ? 'minor' : 'minors'}`,
      closing: 'We look forward to seeing you. If you have any questions, just reply to this email.',
      team: 'The Tekila Tours team',
    };
  }
  return {
    subject: `Confirmación de tu reserva ${d.folio} — Tekila Tours`,
    greeting: `Hola ${d.clienteNombre},`,
    confirmed: 'Recibimos tu pago y tu reserva está confirmada. 🎉',
    labelFolio: 'Folio de reserva',
    labelTour: 'Tour',
    labelDate: 'Fecha',
    labelPeople: 'Pasajeros',
    labelTotal: 'Total pagado',
    adults: (n) => `${n} ${n === 1 ? 'adulto' : 'adultos'}`,
    minors: (n) => `${n} ${n === 1 ? 'menor' : 'menores'}`,
    closing: '¡Te esperamos! Si tienes cualquier duda, responde a este correo.',
    team: 'El equipo de Tekila Tours',
  };
}

function pasajerosStr(t: Textos, d: DatosConfirmacion): string {
  const partes = [t.adults(d.adultos)];
  if (d.menores > 0) partes.push(t.minors(d.menores));
  return partes.join(', ');
}

export interface EmailContenido {
  subject: string;
  html: string;
  text: string;
}

/** Construye el correo de confirmación (asunto + html + texto). */
export function plantillaConfirmacion(d: DatosConfirmacion): EmailContenido {
  const t = textos(d);
  const fechaTxt = formatearFecha(d.fecha, d.idioma);
  const pax = pasajerosStr(t, d);
  const totalTxt = `${d.moneda} ${d.total.toFixed(2)}`;

  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:8px 0;color:${COLORS.muted};font-size:14px;">${escapeHtml(label)}</td>
       <td style="padding:8px 0;color:${COLORS.text};font-size:14px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
     </tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:${COLORS.sand};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.sand};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${COLORS.navy};padding:20px 28px;">
          <span style="color:${COLORS.gold};font-size:20px;font-weight:700;letter-spacing:1px;">TEKILA TOURS</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 8px;color:${COLORS.text};font-size:16px;">${escapeHtml(t.greeting)}</p>
          <p style="margin:0 0 20px;color:${COLORS.text};font-size:16px;">${t.confirmed}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;">
            ${row(t.labelFolio, d.folio)}
            ${row(t.labelTour, d.tourNombre)}
            ${row(t.labelDate, fechaTxt)}
            ${row(t.labelPeople, pax)}
            ${row(t.labelTotal, totalTxt)}
          </table>
          <p style="margin:20px 0 0;color:${COLORS.muted};font-size:14px;">${t.closing}</p>
          <p style="margin:16px 0 0;color:${COLORS.text};font-size:14px;">${t.team}</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = [
    t.greeting,
    '',
    t.confirmed,
    '',
    `${t.labelFolio}: ${d.folio}`,
    `${t.labelTour}: ${d.tourNombre}`,
    `${t.labelDate}: ${fechaTxt}`,
    `${t.labelPeople}: ${pax}`,
    `${t.labelTotal}: ${totalTxt}`,
    '',
    t.closing,
    t.team,
  ].join('\n');

  return { subject: t.subject, html, text };
}
