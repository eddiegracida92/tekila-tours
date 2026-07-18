import type { Lang } from '@/i18n/ui';
import type { Audiencia, QuotePublico, FechaDisponibilidad } from '@/lib/booking-client';

/** Función de traducción (misma firma que `useTranslations`). */
export type Translate = (key: string) => string;

export type { Lang, Audiencia, QuotePublico, FechaDisponibilidad };

/** Locale BCP-47 para Intl según el idioma del sitio. */
export function localeFor(lang: Lang): string {
  return lang === 'es' ? 'es-MX' : 'en-US';
}

/** Fecha ISO `YYYY-MM-DD` a partir de componentes locales (sin líos de zona). */
export function isoDate(year: number, month0: number, day: number): string {
  const mm = String(month0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** ISO `YYYY-MM-DD` de hoy en hora local. */
export function todayIso(): string {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}
