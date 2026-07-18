import { useEffect, useMemo, useState } from 'react';
import { fetchAvailability, type FechaDisponibilidad } from '@/lib/booking-client';
import { isoDate, localeFor, todayIso, type Lang, type Translate } from './types';

interface Props {
  slug: string;
  lang: Lang;
  t: Translate;
  personas: number;
  selected: string | null;
  onSelect: (fecha: string) => void;
}

/**
 * Calendario mensual que consulta `/api/availability` para el mes visible.
 * Reglas de una celda:
 *  - fecha pasada → deshabilitada.
 *  - fila en BD y no disponible (bloqueada/llena) → deshabilitada.
 *  - fila en BD y disponible → seleccionable.
 *  - sin fila en BD → seleccionable (cupo por defecto ilimitado; el hold confirma).
 */
export default function AvailabilityCalendar({
  slug,
  lang,
  t,
  personas,
  selected,
  onSelect,
}: Props) {
  const today = todayIso();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month0, setMonth0] = useState(() => Number(today.slice(5, 7)) - 1);
  const [fechas, setFechas] = useState<Map<string, FechaDisponibilidad>>(new Map());
  const [loading, setLoading] = useState(false);

  const locale = localeFor(lang);

  // Primer y último día del mes visible (ISO).
  const firstIso = isoDate(year, month0, 1);
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const lastIso = isoDate(year, month0, lastDay);

  // Consulta disponibilidad del mes cuando cambian mes o personas.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // No pedir fechas ya pasadas: arranca en hoy si el mes es el actual.
    const desde = firstIso < today ? today : firstIso;
    fetchAvailability(slug, desde, lastIso, personas).then((res) => {
      if (cancelled) return;
      const map = new Map<string, FechaDisponibilidad>();
      if (res.ok) {
        for (const f of res.data.fechas) map.set(f.fecha, f);
      }
      setFechas(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, personas, firstIso, lastIso, today]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(year, month0, 1),
      ),
    [locale, year, month0],
  );

  // Nombres de días de la semana (Dom..Sáb / Sun..Sat según locale).
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // Semana base empezando en domingo (2024-01-07 fue domingo).
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [locale]);

  // Offset del primer día (0 = domingo) para alinear la cuadrícula.
  const startOffset = new Date(year, month0, 1).getDay();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  const atCurrentMonth =
    year === Number(today.slice(0, 4)) && month0 === Number(today.slice(5, 7)) - 1;

  function go(delta: number) {
    let m = month0 + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setYear(y);
    setMonth0(m);
  }

  function cellState(iso: string): 'past' | 'unavailable' | 'available' {
    if (iso < today) return 'past';
    const row = fechas.get(iso);
    if (row && !row.disponible) return 'unavailable';
    return 'available';
  }

  return (
    <div className="bk-cal">
      <div className="bk-cal-head">
        <button
          type="button"
          className="bk-cal-nav"
          onClick={() => go(-1)}
          disabled={atCurrentMonth}
          aria-label={t('booking.cal_prev')}
        >
          ‹
        </button>
        <span className="bk-cal-month">{monthLabel}</span>
        <button
          type="button"
          className="bk-cal-nav"
          onClick={() => go(1)}
          aria-label={t('booking.cal_next')}
        >
          ›
        </button>
      </div>

      <div className="bk-cal-grid bk-cal-weekdays">
        {weekdays.map((w) => (
          <span className="bk-cal-weekday" key={w}>
            {w}
          </span>
        ))}
      </div>

      <div className="bk-cal-grid" aria-busy={loading}>
        {Array.from({ length: startOffset }, (_, i) => (
          <span className="bk-cal-cell bk-cal-empty" key={`e${i}`} />
        ))}
        {days.map((d) => {
          const iso = isoDate(year, month0, d);
          const state = cellState(iso);
          const isSelected = iso === selected;
          const disabled = state !== 'available';
          return (
            <button
              type="button"
              key={iso}
              className={`bk-cal-cell bk-cal-${state}${isSelected ? ' bk-cal-selected' : ''}`}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={state === 'unavailable' ? `${iso} — ${t('booking.cal_full')}` : iso}
              onClick={() => !disabled && onSelect(iso)}
            >
              {d}
            </button>
          );
        })}
      </div>

      {loading && <p className="bk-cal-loading">{t('booking.cal_loading')}</p>}
    </div>
  );
}
