import type { Audiencia, Translate } from './types';

interface Props {
  t: Translate;
  audiencia: Audiencia;
  adultos: number;
  menores: number;
  maxPersonas: number;
  onAudiencia: (a: Audiencia) => void;
  onAdultos: (n: number) => void;
  onMenores: (n: number) => void;
}

interface StepperProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  canInc: boolean;
  onChange: (n: number) => void;
}

function Stepper({ label, hint, value, min, canInc, onChange }: StepperProps) {
  return (
    <div className="bk-stepper">
      <div className="bk-stepper-label">
        <span>{label}</span>
        <small>{hint}</small>
      </div>
      <div className="bk-stepper-ctrl">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`− ${label}`}
        >
          −
        </button>
        <span className="bk-stepper-val" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={!canInc}
          aria-label={`+ ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Audiencia (nacional/extranjero) con aviso de ID + steppers de pasajeros. */
export default function PassengerSelector({
  t,
  audiencia,
  adultos,
  menores,
  maxPersonas,
  onAudiencia,
  onAdultos,
  onMenores,
}: Props) {
  const total = adultos + menores;
  const canInc = total < maxPersonas;

  return (
    <div className="bk-pax">
      <fieldset className="bk-audience">
        <legend>{t('booking.audience')}</legend>
        <div className="bk-audience-opts">
          <button
            type="button"
            className={`bk-chip${audiencia === 'nacional' ? ' bk-chip-on' : ''}`}
            aria-pressed={audiencia === 'nacional'}
            onClick={() => onAudiencia('nacional')}
          >
            {t('booking.audience_national')}
          </button>
          <button
            type="button"
            className={`bk-chip${audiencia === 'extranjero' ? ' bk-chip-on' : ''}`}
            aria-pressed={audiencia === 'extranjero'}
            onClick={() => onAudiencia('extranjero')}
          >
            {t('booking.audience_foreign')}
          </button>
        </div>
        <p className="bk-id-notice">
          {audiencia === 'nacional'
            ? t('booking.id_notice_national')
            : t('booking.id_notice_foreign')}
        </p>
      </fieldset>

      <Stepper
        label={t('booking.adults')}
        hint={t('booking.adults_hint')}
        value={adultos}
        min={1}
        canInc={canInc}
        onChange={onAdultos}
      />
      <Stepper
        label={t('booking.minors')}
        hint={t('booking.minors_hint')}
        value={menores}
        min={0}
        canInc={canInc}
        onChange={onMenores}
      />
    </div>
  );
}
