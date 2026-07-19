/**
 * Abstracción de pasarela de pago (Step 8.1).
 *
 * `PaymentProvider` es el CONTRATO común que implementan Stripe (MVP),
 * y más adelante Mercado Pago y PayPal (Step 13), sin tocar `/api/checkout`.
 * El endpoint depende de esta interfaz, no de un proveedor concreto.
 *
 * Regla no negociable #2: el monto cobrado = `total` que viene de `/api/quote`
 * (servidor). El proveedor solo crea la sesión de cobro por ese monto; nunca
 * recalcula precios ni confía en el cliente.
 */

import type { Moneda } from '@/lib/pricing';

/** Datos para crear una sesión de cobro. El `total` es la fuente de verdad. */
export interface CrearSesionInput {
  /** Id de nuestra reserva (estado `pago_iniciado`). Se usa para reconciliar el webhook. */
  reservaId: string;
  /** Folio legible (`TK-2026-000123`) — para descripción/metadata. */
  folio: string;
  /** Descripción del cargo que verá el cliente (ej. "Tour X — 2 adultos, 1 menor · 2026-08-01"). */
  descripcion: string;
  moneda: Moneda;
  /** Monto total a cobrar (salida de `/api/quote`). En la unidad mayor (p. ej. 178.00). */
  total: number;
  /** Correo del cliente (prellena el checkout y liga el recibo). */
  clienteEmail: string;
  /** Idioma de la página de pago y de los correos. */
  idioma: 'es' | 'en';
  /** A dónde vuelve el cliente tras pagar / cancelar. */
  successUrl: string;
  cancelUrl: string;
}

/** Resultado de crear la sesión: a dónde redirigir y cómo identificarla. */
export interface SesionPago {
  /** Nombre del proveedor (`'stripe'`, `'mercadopago'`, `'paypal'`). */
  provider: string;
  /** Id de la sesión/pedido en el proveedor (se guarda como `provider_ref`). */
  sesionId: string;
  /** URL a la que se redirige al cliente para pagar. */
  url: string;
}

/** Contrato de una pasarela de pago. */
export interface PaymentProvider {
  /** Identificador estable del proveedor. */
  readonly nombre: string;
  /** Crea una sesión de cobro alojada por el proveedor y devuelve la URL de pago. */
  crearSesionDePago(input: CrearSesionInput): Promise<SesionPago>;
}
