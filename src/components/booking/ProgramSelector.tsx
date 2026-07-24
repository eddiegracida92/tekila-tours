import type { Moneda } from '@/lib/booking-client';
import type { Translate } from './types';
import type { Programa } from './useProgramas';

interface Props {
  t: Translate;
  monedas: Moneda[];
  moneda: Moneda | undefined;
  onMoneda: (m: Moneda) => void;
  programas: Programa[];
  modalidad: string | undefined;
  onModalidad: (m: string) => void;
}

/**
 * Selector de programa (modalidad) + moneda (Step 10.0). Solo se renderiza
 * cuando el tour tiene más de un programa o más de una moneda; el precio
 * definitivo lo sigue calculando `/api/quote` en el servidor.
 */
export default function ProgramSelector({
  t,
  monedas,
  moneda,
  onMoneda,
  programas,
  modalidad,
  onModalidad,
}: Props) {
  return (
    <div className="bk-programs">
      {monedas.length > 1 && (
        <div className="bk-currency" role="group" aria-label={t('booking.currency')}>
          <span className="bk-programs-label">{t('booking.currency')}</span>
          <div className="bk-currency-toggle">
            {monedas.map((m) => (
              <button
                key={m}
                type="button"
                className={`bk-currency-opt${m === moneda ? ' on' : ''}`}
                aria-pressed={m === moneda}
                onClick={() => onMoneda(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {programas.length > 1 && (
        <div className="bk-program-list">
          <span className="bk-programs-label">{t('booking.program')}</span>
          {programas.map((p) => (
            <button
              key={p.modalidad}
              type="button"
              className={`bk-program-opt${p.modalidad === modalidad ? ' on' : ''}`}
              aria-pressed={p.modalidad === modalidad}
              onClick={() => onModalidad(p.modalidad)}
            >
              <span className="bk-program-name">{p.modalidad}</span>
              <span className="bk-program-price">
                {t('booking.program_from')} {moneda} {p.ppAdulto}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
