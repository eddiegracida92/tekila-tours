import { useMemo } from 'react';
import type { Audiencia, Lang, QuotePublico, Translate } from './types';
import { localeFor } from './types';

interface Props {
  t: Translate;
  lang: Lang;
  fecha: string | null;
  adultos: number;
  menores: number;
  quote: QuotePublico | null;
  loading: boolean;
  error: string | null;
}

function useMoney(lang: Lang, moneda: string | undefined) {
  return useMemo(() => {
    const fmt = new Intl.NumberFormat(localeFor(lang), {
      style: 'currency',
      currency: moneda ?? 'USD',
    });
    return (n: number) => fmt.format(n);
  }, [lang, moneda]);
}

function useDateLabel(lang: Lang, fecha: string | null) {
  return useMemo(() => {
    if (!fecha) return null;
    const [y, m, d] = fecha.split('-').map(Number);
    return new Intl.DateTimeFormat(localeFor(lang), {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, d));
  }, [lang, fecha]);
}

/** Panel de resumen: fecha, pasajeros y desglose de precio (server = verdad). */
export default function QuoteSummary({
  t,
  lang,
  fecha,
  adultos,
  menores,
  quote,
  loading,
  error,
}: Props) {
  const money = useMoney(lang, quote?.moneda);
  const dateLabel = useDateLabel(lang, fecha);

  return (
    <div className="bk-summary">
      <h3 className="bk-summary-title">{t('booking.summary_title')}</h3>

      <dl className="bk-summary-meta">
        <div>
          <dt>{t('booking.summary_date')}</dt>
          <dd>{dateLabel ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('booking.summary_people')}</dt>
          <dd>
            {adultos} {t(adultos === 1 ? 'booking.adult_one' : 'booking.adults_word')}
            {menores > 0
              ? ` · ${menores} ${t(menores === 1 ? 'booking.minor_one' : 'booking.minors_word')}`
              : ''}
          </dd>
        </div>
      </dl>

      {!fecha && <p className="bk-summary-hint">{t('booking.select_date_first')}</p>}

      {fecha && loading && <p className="bk-summary-hint">{t('booking.quote_loading')}</p>}

      {fecha && !loading && error && <p className="bk-summary-error">{error}</p>}

      {fecha && !loading && !error && quote && (
        <>
          <dl className="bk-price-lines">
            {quote.adultos.cantidad > 0 && (
              <div>
                <dt>
                  {t('booking.adults')} × {quote.adultos.cantidad}
                </dt>
                <dd>{money(quote.adultos.importe)}</dd>
              </div>
            )}
            {quote.menores.cantidad > 0 && (
              <div>
                <dt>
                  {t('booking.minors')} × {quote.menores.cantidad}
                </dt>
                <dd>{money(quote.menores.importe)}</dd>
              </div>
            )}
            <div>
              <dt>{t('booking.subtotal')}</dt>
              <dd>{money(quote.subtotal)}</dd>
            </div>
            {quote.impuestos > 0 && (
              <div>
                <dt>{t('booking.taxes')}</dt>
                <dd>{money(quote.impuestos)}</dd>
              </div>
            )}
          </dl>
          <div className="bk-total">
            <span>{t('booking.total')}</span>
            <strong>{money(quote.total)}</strong>
          </div>
        </>
      )}
    </div>
  );
}
