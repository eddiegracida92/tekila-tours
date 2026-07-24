import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@/i18n/ui';
import { createHold, fetchQuote, type Audiencia, type QuotePublico } from '@/lib/booking-client';
import AvailabilityCalendar from '@/components/booking/AvailabilityCalendar';
import PassengerSelector from '@/components/booking/PassengerSelector';
import ProgramSelector from '@/components/booking/ProgramSelector';
import QuoteSummary from '@/components/booking/QuoteSummary';
import { useProgramas } from '@/components/booking/useProgramas';
// Opciones de cobro del punto de venta. `efectivo`/`terminal_externa` = modo A
// (se marca pagada al instante); `online` = modo B (genera link de pago Stripe).
const COBRO_OPCIONES = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'terminal_externa', label: 'Terminal propia' },
  { value: 'online', label: 'Pago en línea (link)' },
] as const;
type CobroUI = (typeof COBRO_OPCIONES)[number]['value'];
const COBRO_LABEL = Object.fromEntries(COBRO_OPCIONES.map((o) => [o.value, o.label])) as Record<
  CobroUI,
  string
>;

interface TourOpcion {
  slug: string;
  nombre: string;
  capacidadMax: number;
}
interface Props {
  tours: TourOpcion[];
}

interface Hold {
  holdId: string;
  expiraEn: string;
}

const ERRORES: Record<string, string> = {
  sin_cupo: 'Ya no hay cupo para esa fecha.',
  hold_expirado: 'El apartado venció. Vuelve a apartar el cupo.',
  hold_invalido: 'El apartado ya no es válido. Vuelve a apartar el cupo.',
  hold_no_coincide: 'La selección cambió. Vuelve a apartar el cupo.',
  no_autorizado: 'Tu cuenta no puede registrar ventas.',
  no_autenticado: 'Tu sesión expiró. Vuelve a entrar.',
  error_pago: 'No se pudo generar el link de pago. Intenta de nuevo.',
};
const errorMsg = (code: string) => ERRORES[code] ?? 'No se pudo registrar la venta. Intenta de nuevo.';

function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function PuntoDeVenta({ tours }: Props) {
  const t = useMemo(() => useTranslations('es'), []);

  const [slug, setSlug] = useState('');
  const [audiencia, setAudiencia] = useState<Audiencia>('nacional');
  const [adultos, setAdultos] = useState(1);
  const [menores, setMenores] = useState(0);
  const [fecha, setFecha] = useState<string | null>(null);

  // Programa (modalidad) + moneda elegidos (Step 10.0).
  const programas = useProgramas(slug, audiencia);

  const [quote, setQuote] = useState<QuotePublico | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [hold, setHold] = useState<Hold | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [metodoCobro, setMetodoCobro] = useState<CobroUI>('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [ventaError, setVentaError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null); // modo A: venta registrada
  const [linkPago, setLinkPago] = useState<{ folio: string; url: string } | null>(null); // modo B
  const [copiado, setCopiado] = useState(false);

  const personas = adultos + menores;
  const tourSel = tours.find((x) => x.slug === slug) ?? null;

  const resetHold = useCallback(() => {
    setHold(null);
    setHoldError(null);
    setExpired(false);
    setVentaError(null);
  }, []);

  // Cotiza en vivo cuando hay tour y fecha (espera el menú de programas).
  useEffect(() => {
    if (!slug || !fecha || !programas.ready) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    fetchQuote(slug, fecha, audiencia, adultos, menores, programas.modalidad, programas.moneda).then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setQuote(res.data.cotizacion);
        else {
          setQuote(null);
          setQuoteError('No hay tarifa para esa selección.');
        }
        setQuoteLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug, fecha, audiencia, adultos, menores, programas.ready, programas.modalidad, programas.moneda]);

  // Temporizador del apartado (15 min).
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

  function onTour(s: string) {
    resetHold();
    setSlug(s);
    setFecha(null);
    setFolio(null);
  }

  async function apartar() {
    if (!slug || !fecha) return;
    setHoldLoading(true);
    setHoldError(null);
    setExpired(false);
    const res = await createHold(slug, fecha, personas);
    if (res.ok) setHold({ holdId: res.data.holdId, expiraEn: res.data.expiraEn });
    else setHoldError(errorMsg(res.error));
    setHoldLoading(false);
  }

  async function registrar() {
    if (!hold || !fecha || !slug || !nombre.trim()) return;
    setEnviando(true);
    setVentaError(null);

    const online = metodoCobro === 'online';
    const url = online ? '/api/vendedor/checkout-online' : '/api/vendedor/registrar-venta';
    // Modo B no manda metodoCobro (el servidor fija 'online'); modo A sí.
    const cuerpo: Record<string, unknown> = {
      slug,
      holdId: hold.holdId,
      fecha,
      audiencia,
      adultos,
      menores,
      cliente: { nombre: nombre.trim(), telefono: telefono.trim(), email: email.trim() },
    };
    if (programas.modalidad) cuerpo.modalidad = programas.modalidad;
    if (programas.moneda) cuerpo.moneda = programas.moneda;
    if (!online) cuerpo.metodoCobro = metodoCobro;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
    } catch {
      setVentaError('Error de red. Intenta de nuevo.');
      setEnviando(false);
      return;
    }
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.ok) {
      setHold(null);
      if (online) setLinkPago({ folio: payload.folio, url: payload.url });
      else setFolio(payload.folio);
    } else {
      setVentaError(errorMsg(payload?.error ?? 'error'));
    }
    setEnviando(false);
  }

  function nuevaVenta() {
    setSlug('');
    setFecha(null);
    setAudiencia('nacional');
    setAdultos(1);
    setMenores(0);
    setQuote(null);
    resetHold();
    setNombre('');
    setTelefono('');
    setEmail('');
    setMetodoCobro('efectivo');
    setFolio(null);
    setLinkPago(null);
    setCopiado(false);
  }

  // Modo A — venta cobrada registrada.
  if (folio) {
    return (
      <div className="pv-done">
        <div className="pv-done-check">✅</div>
        <h2>Venta registrada</h2>
        <p>
          Folio <strong>{folio}</strong> — cobrada por {COBRO_LABEL[metodoCobro]}.
        </p>
        <div className="pv-done-actions">
          <button type="button" className="btn-primary" onClick={nuevaVenta}>
            Registrar otra venta
          </button>
          <a href="/vendedor" className="pv-link">
            Ver mis ventas →
          </a>
        </div>
      </div>
    );
  }

  // Modo B — link de pago generado (el cliente paga; se marca pagada por webhook).
  if (linkPago) {
    return (
      <div className="pv-done">
        <div className="pv-done-check">🔗</div>
        <h2>Link de pago generado</h2>
        <p>
          Folio <strong>{linkPago.folio}</strong>. Comparte este link con el cliente o ábrelo para
          que pague. La venta aparecerá como <strong>Pagada</strong> en tus ventas cuando el cliente
          complete el pago.
        </p>
        <div className="pv-done-actions">
          <a className="btn-primary" href={linkPago.url} target="_blank" rel="noopener noreferrer">
            Abrir pago
          </a>
          <button
            type="button"
            className="pv-link"
            onClick={() => {
              navigator.clipboard?.writeText(linkPago.url).then(
                () => setCopiado(true),
                () => setCopiado(false),
              );
            }}
          >
            {copiado ? '¡Link copiado! ✓' : 'Copiar link'}
          </button>
          <button type="button" className="pv-link" onClick={nuevaVenta}>
            Registrar otra venta
          </button>
          <a href="/vendedor" className="pv-link">
            Ver mis ventas →
          </a>
        </div>
      </div>
    );
  }

  const canHold = !!slug && !!fecha && !quoteLoading && !quoteError && !!quote && !holdLoading && !hold;

  return (
    <div className="bk-wizard">
      <div className="bk-cols">
        <div className="bk-main">
          <section className="bk-block">
            <h2 className="bk-block-title">Tour</h2>
            <select className="pv-select" value={slug} onChange={(e) => onTour(e.target.value)}>
              <option value="">Elige un tour…</option>
              {tours.map((tr) => (
                <option key={tr.slug} value={tr.slug}>
                  {tr.nombre}
                </option>
              ))}
            </select>
          </section>

          {slug && (
            <>
              <section className="bk-block">
                <h2 className="bk-block-title">Fecha</h2>
                <AvailabilityCalendar
                  slug={slug}
                  lang="es"
                  t={t}
                  personas={personas}
                  selected={fecha}
                  onSelect={(f: string) => {
                    resetHold();
                    setFecha(f);
                  }}
                />
              </section>

              <section className="bk-block">
                <h2 className="bk-block-title">Pasajeros</h2>
                <PassengerSelector
                  t={t}
                  audiencia={audiencia}
                  adultos={adultos}
                  menores={menores}
                  maxPersonas={tourSel?.capacidadMax ?? 20}
                  onAudiencia={(a: Audiencia) => {
                    resetHold();
                    setAudiencia(a);
                  }}
                  onAdultos={(n: number) => {
                    resetHold();
                    setAdultos(Math.max(1, n));
                  }}
                  onMenores={(n: number) => {
                    resetHold();
                    setMenores(Math.max(0, n));
                  }}
                />
              </section>

              {programas.visible && (
                <section className="bk-block">
                  <h2 className="bk-block-title">Programa</h2>
                  <ProgramSelector
                    t={t}
                    monedas={programas.monedas}
                    moneda={programas.moneda}
                    onMoneda={(m) => {
                      resetHold();
                      programas.setMoneda(m);
                    }}
                    programas={programas.programas}
                    modalidad={programas.modalidad}
                    onModalidad={(m) => {
                      resetHold();
                      programas.setModalidad(m);
                    }}
                  />
                </section>
              )}
            </>
          )}
        </div>

        <aside className="bk-aside">
          <QuoteSummary
            t={t}
            lang="es"
            fecha={fecha}
            adultos={adultos}
            menores={menores}
            quote={quote}
            loading={quoteLoading}
            error={quoteError}
          />

          {!hold && (
            <>
              <button type="button" className="btn-primary bk-hold-btn" disabled={!canHold} onClick={apartar}>
                {holdLoading ? 'Apartando…' : 'Apartar cupo'}
              </button>
              {expired && <p className="bk-summary-error">El apartado venció. Aparta de nuevo.</p>}
              {holdError && <p className="bk-summary-error">{holdError}</p>}
            </>
          )}

          {hold && (
            <div className="bk-held">
              <div className="bk-held-check">✅</div>
              <h3>Cupo apartado</h3>
              <p className="bk-held-timer">
                Vence en <strong>{mmss(remaining)}</strong>
              </p>

              <form
                className="pv-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  registrar();
                }}
              >
                <label>
                  <span>Nombre del cliente *</span>
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={160} />
                </label>
                <label>
                  <span>Teléfono (opcional)</span>
                  <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={40} />
                </label>
                <label>
                  <span>Correo (opcional)</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
                </label>
                <label>
                  <span>Cobro</span>
                  <select value={metodoCobro} onChange={(e) => setMetodoCobro(e.target.value as CobroUI)}>
                    {COBRO_OPCIONES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" className="btn-primary" disabled={enviando || !nombre.trim()}>
                  {metodoCobro === 'online'
                    ? enviando
                      ? 'Generando…'
                      : 'Generar link de pago'
                    : enviando
                      ? 'Registrando…'
                      : 'Registrar venta cobrada'}
                </button>
                {ventaError && <p className="bk-summary-error">{ventaError}</p>}
              </form>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
