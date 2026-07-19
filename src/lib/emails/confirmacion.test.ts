import { describe, expect, it } from 'vitest';
import { plantillaConfirmacion, type DatosConfirmacion } from '@/lib/emails/confirmacion';

const base: DatosConfirmacion = {
  folio: 'TK-2026-000123',
  tourNombre: 'Isla Mujeres Pleasure',
  fecha: '2026-08-15',
  adultos: 2,
  menores: 1,
  total: 247,
  moneda: 'USD',
  clienteNombre: 'Ana López',
  idioma: 'es',
};

describe('plantillaConfirmacion', () => {
  it('arma asunto, html y texto con el folio y el total', () => {
    const { subject, html, text } = plantillaConfirmacion(base);
    expect(subject).toContain('TK-2026-000123');
    expect(html).toContain('TK-2026-000123');
    expect(html).toContain('USD 247.00');
    expect(text).toContain('USD 247.00');
    expect(html).toContain('Isla Mujeres Pleasure');
  });

  it('pluraliza pasajeros (2 adultos, 1 menor)', () => {
    expect(plantillaConfirmacion(base).text).toContain('2 adultos, 1 menor');
    expect(plantillaConfirmacion({ ...base, adultos: 1, menores: 0 }).text).toContain('1 adulto');
  });

  it('omite menores cuando son 0', () => {
    const { text } = plantillaConfirmacion({ ...base, menores: 0 });
    expect(text).not.toMatch(/menor/);
  });

  it('formatea la fecha en español', () => {
    expect(plantillaConfirmacion(base).text).toContain('de agosto de 2026');
  });

  it('escapa HTML en nombre del cliente y del tour (solo en el html, no en el texto)', () => {
    const { html, text } = plantillaConfirmacion({
      ...base,
      clienteNombre: '<a href="https://phish.mx">Ana</a>',
      tourNombre: 'Isla <script>Mujeres',
    });
    expect(html).not.toContain('<a href="https://phish.mx">');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;a href=&quot;https://phish.mx&quot;&gt;Ana&lt;/a&gt;');
    expect(html).toContain('Isla &lt;script&gt;Mujeres');
    expect(text).toContain('<a href="https://phish.mx">Ana</a>');
  });

  it('cambia idioma a inglés (asunto y fecha)', () => {
    const en = plantillaConfirmacion({ ...base, idioma: 'en' });
    expect(en.subject).toContain('Your booking confirmation');
    expect(en.text).toContain('August');
    expect(en.text).toContain('2 adults, 1 minor');
  });
});
