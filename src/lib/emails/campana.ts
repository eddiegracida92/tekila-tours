/**
 * Plantilla de campaña de marketing (Step 9.7.3) — PURA.
 *
 * El owner escribe asunto + cuerpo en texto plano; esta función los envuelve en
 * la marca (mismo estilo que el correo de confirmación) y **siempre inyecta el
 * link de baja** (obligatorio: LFPDPPP MX / CAN-SPAM / GDPR). Bilingüe es/en.
 *
 * El `bajaUrl` lo arma el caller por suscriptor (lleva su `token_baja`); aquí
 * solo se interpola escapado. Todo el contenido del owner se escapa antes de ir
 * al HTML — nunca confiamos en que no traiga `<` o comillas.
 */

const COLORS = { navy: '#12192C', gold: '#D4AB3B', text: '#1A1A2E', muted: '#6B7280', sand: '#FAFAF6' };

export interface DatosCampana {
  asunto: string;
  cuerpo: string; // texto plano del owner (saltos de línea respetados)
  idioma: 'es' | 'en';
  bajaUrl: string; // URL de baja con el token del suscriptor
}

export interface EmailContenido {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Textos {
  bajaLead: string;
  bajaLink: string;
  team: string;
}

function textos(idioma: 'es' | 'en'): Textos {
  if (idioma === 'en') {
    return {
      bajaLead: "You're receiving this because you subscribed to Tekila Tours.",
      bajaLink: 'Unsubscribe',
      team: 'The Tekila Tours team',
    };
  }
  return {
    bajaLead: 'Recibes este correo porque te suscribiste a Tekila Tours.',
    bajaLink: 'Cancelar suscripción',
    team: 'El equipo de Tekila Tours',
  };
}

/** Convierte el texto plano del owner a párrafos HTML (escapados). */
function cuerpoHtml(cuerpo: string): string {
  return cuerpo
    .split(/\n{2,}/)
    .map((par) => par.trim())
    .filter((par) => par.length > 0)
    .map((par) => {
      const conBr = escapeHtml(par).replace(/\n/g, '<br>');
      return `<p style="margin:0 0 16px;color:${COLORS.text};font-size:16px;line-height:1.6;">${conBr}</p>`;
    })
    .join('');
}

/** Construye la campaña (asunto + html + texto), con link de baja inyectado. */
export function plantillaCampana(d: DatosCampana): EmailContenido {
  const t = textos(d.idioma);
  const cuerpo = cuerpoHtml(d.cuerpo);
  const bajaUrlSafe = escapeHtml(d.bajaUrl);

  const html = `<!doctype html><html><body style="margin:0;background:${COLORS.sand};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.sand};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:${COLORS.navy};padding:20px 28px;">
          <span style="color:${COLORS.gold};font-size:20px;font-weight:700;letter-spacing:1px;">TEKILA TOURS</span>
        </td></tr>
        <tr><td style="padding:28px;">
          ${cuerpo}
          <p style="margin:24px 0 0;color:${COLORS.text};font-size:14px;">${escapeHtml(t.team)}</p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #eee;">
          <p style="margin:0;color:${COLORS.muted};font-size:12px;line-height:1.5;">
            ${escapeHtml(t.bajaLead)}<br>
            <a href="${bajaUrlSafe}" style="color:${COLORS.muted};text-decoration:underline;">${escapeHtml(t.bajaLink)}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = [
    d.cuerpo.trim(),
    '',
    t.team,
    '',
    '—',
    t.bajaLead,
    `${t.bajaLink}: ${d.bajaUrl}`,
  ].join('\n');

  return { subject: d.asunto, html, text };
}
