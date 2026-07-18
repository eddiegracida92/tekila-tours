import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@/i18n/ui';
import { createHold, fetchQuote, type Audiencia, type QuotePublico } from '@/lib/booking-client';
import AvailabilityCalendar from './AvailabilityCalendar';
import PassengerSelector from './PassengerSelector';
import QuoteSummary from './QuoteSummary';
import type { Lang } from './types';

interface Props {
  slug: string;
  lang: Lang;
  maxPersonas?: number;
}

interface Hold {
  holdId: string;
  expiraEn: string;
}

/** Traduce un código de error del quote a una clave i18n. */
function quoteErrorKey(code: string): string {
  if (code === 'excede_capacidad') return 'booking.err_excede_capacidad';
  return 'booking.err_no_price';
}

/** Traduce un código de error del hold a una clave i18n. */
function holdErrorKey(code: string): string {
  if (code === 'sin_cupo') return 'booking.err_sin_cupo';
  if (code === 'fecha_bloqueada') return 'booking.err_fecha_bloqueada';
  if (code === 'excede_capacidad') return 'booking.err_excede_capacidad';
  return 'booking.err_generic';
}

function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function BookingWizard({ slug, lang, maxPersonas = 20 }: Props) {
  // `useTranslations` devuelve una función nueva cada vez; memoizarla por idioma
  // la mantiene estable y evita re-disparar los efectos (bucle de fetch).
  const t = useMemo(() => useTranslations(lang), [lang]);

  const [audiencia, setAudiencia] = useState<Audiencia>('nacional');
  const [adultos, setAdultos] = useState(1);
  const [menores, setMenores] = useState(0);
  const [fecha, setFecha] = useState<string | null>(null);

  const [quote, setQuote] = useState<QuotePublico | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [hold, setHold] = useState<Hold | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const personas = adultos + menores;

  /** Invalida cualquier apartado al cambiar la selección (queda obsoleto). */
  const resetHold = useCallback(() => {
    setHold(null);
    setHoldError(null);
    setExpired(false);
  }, []);

  // Cotiza en vivo cuando hay fecha y cambian los parámetros.
  useEffect(() => {
    if (!fecha) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    fetchQuote(slug, fecha, audiencia, adultos, menores).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setQuote(res.data.cotizacion);
      } else {
        setQuote(null);
        setQuoteError(t(quoteErrorKey(res.error)));
      }
      setQuoteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, fecha, audiencia, adultos, menores, t]);

  // Temporizador del apartado (15 min). Al expirar, libera el estado.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!hold) return;
    const target = new Date(hold.expiraEn).getTime();
    const tick = () => {
      const secs = Math.round((target - Date.now()) / 1000);
      setRemaining(secs);
      if (secs <= 0) {
        setHold(null);
        setExpired(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hold]);

  function onSelectFecha(f: string) {
    resetHold();
    setFecha(f);
  }
  function onAudiencia(a: Audiencia) {
    resetHold();
    setAudiencia(a);
  }
  function onAdultos(n: number) {
    resetHold();
    setAdultos(Math.max(1, n));
  }
  function onMenores(n: number) {
    resetHold();
    setMenores(Math.max(0, n));
  }

  async function apartar() {
    if (!fecha) return;
    setHoldLoading(true);
    setHoldError(null);
    setExpired(false);
    const res = await createHold(slug, fecha, personas);
    if (res.ok) {
      setHold({ holdId: res.data.holdId, expiraEn: res.data.expiraEn });
    } else {
      setHoldError(t(holdErrorKey(res.error)));
    }
    setHoldLoading(false);
  }

  const canHold = !!fecha && !quoteLoading && !quoteError && !!quote && !holdLoading && !hold;

  return (
    <div className="bk-wizard">
      <div className="bk-cols">
        <div className="bk-main">
          <section className="bk-block">
            <h2 className="bk-block-title">{t('booking.step_date')}</h2>
            <AvailabilityCalendar
              slug={slug}
              lang={lang}
              t={t}
              personas={personas}
              selected={fecha}
              onSelect={onSelectFecha}
            />
          </section>

          <section className="bk-block">
            <h2 className="bk-block-title">{t('booking.step_people')}</h2>
            <PassengerSelector
              t={t}
              audiencia={audiencia}
              adultos={adultos}
              menores={menores}
              maxPersonas={maxPersonas}
              onAudiencia={onAudiencia}
              onAdultos={onAdultos}
              onMenores={onMenores}
            />
          </section>
        </div>

        <aside className="bk-aside">
          <QuoteSummary
            t={t}
            lang={lang}
            fecha={fecha}
            adultos={adultos}
            menores={menores}
            quote={quote}
            loading={quoteLoading}
            error={quoteError}
          />

          {!hold && (
            <>
              <button
                type="button"
                className="btn-primary bk-hold-btn"
                disabled={!canHold}
                onClick={apartar}
              >
                {holdLoading ? t('booking.holding') : t('booking.hold_cta')}
              </button>
              {expired && <p className="bk-summary-error">{t('booking.held_expired')}</p>}
              {holdError && <p className="bk-summary-error">{holdError}</p>}
            </>
          )}

          {hold && (
            <div className="bk-held">
              <div className="bk-held-check">✅</div>
              <h3>{t('booking.held_title')}</h3>
              <p>{t('booking.held_msg')}</p>
              <p className="bk-held-timer">
                {t('booking.held_timer')} <strong>{mmss(remaining)}</strong>
              </p>
              <button type="button" className="btn-primary bk-hold-btn" disabled>
                {t('booking.continue_payment')}
              </button>
              <small className="bk-held-soon">{t('booking.continue_soon')}</small>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
