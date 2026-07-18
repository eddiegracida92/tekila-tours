import { describe, it, expect } from 'vitest';
import {
  cotizar,
  temporadaDeFecha,
  elegirTarifa,
  PricingError,
  type Tarifa,
  type RangoTemporada,
} from './pricing';

/** Fábrica de tarifas con defaults sensatos. */
function tarifa(overrides: Partial<Tarifa> = {}): Tarifa {
  return {
    audiencia: 'extranjero',
    temporada: 'unica',
    modalidad: null,
    moneda: 'USD',
    pp_adulto: 89,
    pp_menor: 69,
    pr_adulto: 55,
    pr_menor: 42,
    impuesto_adulto: 0,
    impuesto_menor: 0,
    activo: true,
    ...overrides,
  };
}

const SIN_TEMPORADAS: RangoTemporada[] = [];

describe('temporadaDeFecha', () => {
  const rangos: RangoTemporada[] = [
    { tipo: 'alta', fecha_inicio: '2026-12-15', fecha_fin: '2027-01-06' },
    { tipo: 'baja', fecha_inicio: '2026-09-01', fecha_fin: '2026-11-30' },
  ];

  it('devuelve null si la fecha no cae en ningún rango', () => {
    expect(temporadaDeFecha('2026-07-18', rangos)).toBeNull();
  });

  it('detecta temporada baja', () => {
    expect(temporadaDeFecha('2026-10-10', rangos)).toBe('baja');
  });

  it('detecta temporada alta (inclusive en los bordes)', () => {
    expect(temporadaDeFecha('2026-12-15', rangos)).toBe('alta');
    expect(temporadaDeFecha('2027-01-06', rangos)).toBe('alta');
  });

  it('prioriza alta cuando dos rangos se traslapan', () => {
    const traslape: RangoTemporada[] = [
      { tipo: 'baja', fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31' },
      { tipo: 'alta', fecha_inicio: '2026-12-15', fecha_fin: '2027-01-06' },
    ];
    expect(temporadaDeFecha('2026-12-20', traslape)).toBe('alta');
  });
});

describe('elegirTarifa', () => {
  it('lanza sin_tarifa_audiencia si no hay tarifa para la audiencia', () => {
    const tarifas = [tarifa({ audiencia: 'extranjero' })];
    expect(() => elegirTarifa(tarifas, 'nacional', null)).toThrow(PricingError);
  });

  it('prefiere la temporada de la fecha sobre unica', () => {
    const tarifas = [
      tarifa({ temporada: 'unica', pp_adulto: 100 }),
      tarifa({ temporada: 'alta', pp_adulto: 130 }),
    ];
    expect(elegirTarifa(tarifas, 'extranjero', 'alta').pp_adulto).toBe(130);
  });

  it('cae a unica cuando no existe tarifa de esa temporada', () => {
    const tarifas = [tarifa({ temporada: 'unica', pp_adulto: 100 })];
    expect(elegirTarifa(tarifas, 'extranjero', 'alta').pp_adulto).toBe(100);
  });

  it('entre modalidades de la misma temporada toma la más barata', () => {
    const tarifas = [
      tarifa({ temporada: 'unica', modalidad: 'premium', pp_adulto: 120 }),
      tarifa({ temporada: 'unica', modalidad: 'base', pp_adulto: 90 }),
    ];
    expect(elegirTarifa(tarifas, 'extranjero', null).pp_adulto).toBe(90);
  });
});

describe('cotizar', () => {
  it('cotiza 2 adultos sin impuestos', () => {
    const r = cotizar({
      fecha: '2026-07-18',
      audiencia: 'extranjero',
      adultos: 2,
      menores: 0,
      impuestoOnline: false,
      tarifas: [tarifa({ pp_adulto: 89 })],
      temporadas: SIN_TEMPORADAS,
    });
    expect(r.publico.subtotal).toBe(178);
    expect(r.publico.impuestos).toBe(0);
    expect(r.publico.total).toBe(178);
    expect(r.publico.moneda).toBe('USD');
  });

  it('suma menores con su propio precio', () => {
    const r = cotizar({
      fecha: '2026-07-18',
      audiencia: 'extranjero',
      adultos: 2,
      menores: 1,
      impuestoOnline: false,
      tarifas: [tarifa({ pp_adulto: 89, pp_menor: 69 })],
      temporadas: SIN_TEMPORADAS,
    });
    expect(r.publico.menores.importe).toBe(69);
    expect(r.publico.total).toBe(2 * 89 + 69);
  });

  it('aplica impuestos solo si impuestoOnline es true', () => {
    const base = {
      fecha: '2026-07-18',
      audiencia: 'extranjero' as const,
      adultos: 2,
      menores: 0,
      tarifas: [tarifa({ pp_adulto: 100, impuesto_adulto: 15 })],
      temporadas: SIN_TEMPORADAS,
    };
    expect(cotizar({ ...base, impuestoOnline: false }).publico.total).toBe(200);
    expect(cotizar({ ...base, impuestoOnline: true }).publico.total).toBe(230);
  });

  it('nacional y extranjero pueden costar distinto', () => {
    const tarifas = [
      tarifa({ audiencia: 'extranjero', pp_adulto: 89 }),
      tarifa({ audiencia: 'nacional', pp_adulto: 69 }),
    ];
    const comun = {
      fecha: '2026-07-18',
      adultos: 1,
      menores: 0,
      impuestoOnline: false,
      tarifas,
      temporadas: SIN_TEMPORADAS,
    };
    expect(cotizar({ ...comun, audiencia: 'extranjero' }).publico.total).toBe(89);
    expect(cotizar({ ...comun, audiencia: 'nacional' }).publico.total).toBe(69);
  });

  it('calcula el margen internamente (PR nunca en lo público)', () => {
    const r = cotizar({
      fecha: '2026-07-18',
      audiencia: 'extranjero',
      adultos: 2,
      menores: 0,
      impuestoOnline: false,
      tarifas: [tarifa({ pp_adulto: 89, pr_adulto: 55 })],
      temporadas: SIN_TEMPORADAS,
    });
    expect(r.interno.costoTotalPr).toBe(110);
    expect(r.interno.margen).toBe(178 - 110);
    // Garantía: el objeto público no filtra costo/PR/margen (sin chocar con "precio").
    expect(r.publico).not.toHaveProperty('margen');
    expect(r.publico).not.toHaveProperty('costoTotalPr');
    expect(JSON.stringify(r.publico)).not.toMatch(/margen|costo|_pr|reporte/i);
  });

  it('usa la tarifa de temporada alta cuando la fecha cae en ese rango', () => {
    const r = cotizar({
      fecha: '2026-12-20',
      audiencia: 'extranjero',
      adultos: 1,
      menores: 0,
      impuestoOnline: false,
      tarifas: [
        tarifa({ temporada: 'unica', pp_adulto: 100 }),
        tarifa({ temporada: 'alta', pp_adulto: 150 }),
      ],
      temporadas: [{ tipo: 'alta', fecha_inicio: '2026-12-15', fecha_fin: '2027-01-06' }],
    });
    expect(r.publico.temporada).toBe('alta');
    expect(r.publico.total).toBe(150);
  });

  it('lanza menor_no_disponible si el tour no admite menores', () => {
    expect(() =>
      cotizar({
        fecha: '2026-07-18',
        audiencia: 'extranjero',
        adultos: 1,
        menores: 1,
        impuestoOnline: false,
        tarifas: [tarifa({ pp_menor: null })],
        temporadas: SIN_TEMPORADAS,
      }),
    ).toThrow(PricingError);
  });

  it('rechaza 0 adultos', () => {
    expect(() =>
      cotizar({
        fecha: '2026-07-18',
        audiencia: 'extranjero',
        adultos: 0,
        menores: 2,
        impuestoOnline: false,
        tarifas: [tarifa()],
        temporadas: SIN_TEMPORADAS,
      }),
    ).toThrow(PricingError);
  });
});
