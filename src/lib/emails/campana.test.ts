import { describe, expect, it } from 'vitest';
import { plantillaCampana, type DatosCampana } from '@/lib/emails/campana';

const base: DatosCampana = {
  asunto: 'Ofertas de verano 🌴',
  cuerpo: 'Hola,\n\nEste mes tenemos 2x1 en Isla Mujeres.\n¡No te lo pierdas!',
  idioma: 'es',
  bajaUrl: 'https://tekilatours.com/baja?token=abc-123',
};

describe('plantillaCampana', () => {
  it('usa el asunto tal cual y mete el cuerpo en el HTML', () => {
    const { subject, html, text } = plantillaCampana(base);
    expect(subject).toBe('Ofertas de verano 🌴');
    expect(html).toContain('Este mes tenemos 2x1 en Isla Mujeres.');
    expect(text).toContain('Este mes tenemos 2x1 en Isla Mujeres.');
  });

  it('SIEMPRE inyecta el link de baja (html y texto)', () => {
    const { html, text } = plantillaCampana(base);
    expect(html).toContain('https://tekilatours.com/baja?token=abc-123');
    expect(html).toContain('Cancelar suscripción');
    expect(text).toContain('https://tekilatours.com/baja?token=abc-123');
  });

  it('localiza el link de baja en inglés', () => {
    const { html } = plantillaCampana({ ...base, idioma: 'en' });
    expect(html).toContain('Unsubscribe');
    expect(html).toContain('subscribed to Tekila Tours');
  });

  it('convierte párrafos (doble salto) en <p> separados', () => {
    const { html } = plantillaCampana(base);
    // "Hola," y el bloque de la oferta son párrafos distintos.
    const parrafos = (html.match(/<p style="margin:0 0 16px/g) ?? []).length;
    expect(parrafos).toBeGreaterThanOrEqual(2);
  });

  it('escapa HTML del cuerpo y del asunto (no inyecta markup)', () => {
    const malicioso = plantillaCampana({
      ...base,
      cuerpo: '<script>alert(1)</script> visita <a href="https://phish.mx">esto</a>',
    });
    expect(malicioso.html).not.toContain('<script>alert(1)</script>');
    expect(malicioso.html).not.toContain('<a href="https://phish.mx">');
    expect(malicioso.html).toContain('&lt;script&gt;');
    // el texto plano NO se escapa (no es HTML)
    expect(malicioso.text).toContain('<script>alert(1)</script>');
  });

  it('escapa el bajaUrl al interpolarlo en el atributo href', () => {
    const inyeccion = plantillaCampana({
      ...base,
      bajaUrl: 'https://x.com/baja?token=1"><script>',
    });
    expect(inyeccion.html).not.toContain('token=1"><script>');
    expect(inyeccion.html).toContain('&quot;');
  });
});
