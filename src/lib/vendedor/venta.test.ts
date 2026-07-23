import { describe, it, expect } from 'vitest';
import { calcularComision, RegistrarVentaSchema } from './venta';

describe('calcularComision', () => {
  it('porcentaje: total × valor%, redondeado a 2 decimales', () => {
    expect(calcularComision(2000, { tipo: 'porcentaje', valor: 10 })).toEqual({
      tipo: 'porcentaje',
      valor: 10,
      monto: 200,
    });
    // 1234.55 × 7.5% = 92.59125 → 92.59
    expect(calcularComision(1234.55, { tipo: 'porcentaje', valor: 7.5 }).monto).toBe(92.59);
  });

  it('monto: cantidad fija por venta, sin importar el total', () => {
    expect(calcularComision(5000, { tipo: 'monto', valor: 150 })).toEqual({
      tipo: 'monto',
      valor: 150,
      monto: 150,
    });
  });

  it('sin config de comisión → 0 (no congela tipo/valor)', () => {
    expect(calcularComision(3000, { tipo: null, valor: null })).toEqual({
      tipo: null,
      valor: null,
      monto: 0,
    });
  });
});

describe('RegistrarVentaSchema', () => {
  const base = {
    slug: 'chichen',
    holdId: '550e8400-e29b-41d4-a716-446655440000',
    fecha: '2026-08-10',
    audiencia: 'nacional',
    adultos: 2,
    menores: 0,
    cliente: { nombre: 'Ana' },
    metodoCobro: 'efectivo',
  };

  it('acepta una venta mínima (solo nombre del cliente) con teléfono/email vacíos', () => {
    const r = RegistrarVentaSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cliente.telefono).toBe('');
      expect(r.data.cliente.email).toBe('');
    }
  });

  it('rechaza un método de cobro fuera del enum (p. ej. online, que es modo B)', () => {
    expect(RegistrarVentaSchema.safeParse({ ...base, metodoCobro: 'online' }).success).toBe(false);
  });

  it('rechaza un email con formato inválido', () => {
    const r = RegistrarVentaSchema.safeParse({ ...base, cliente: { nombre: 'Ana', email: 'no-es-correo' } });
    expect(r.success).toBe(false);
  });
});
