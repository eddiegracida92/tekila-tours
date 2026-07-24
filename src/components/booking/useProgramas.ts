import { useEffect, useMemo, useState } from 'react';
import {
  fetchTarifasPublicas,
  type Audiencia,
  type Moneda,
  type TarifaPublica,
} from '@/lib/booking-client';

/** Un programa (modalidad) disponible con su precio adulto representativo. */
export interface Programa {
  modalidad: string;
  ppAdulto: number;
}

export interface ProgramasState {
  /** El menú ya cargó (aunque sea vacío). */
  ready: boolean;
  monedas: Moneda[];
  /** Moneda efectiva a usar (override válido o la primera disponible). */
  moneda: Moneda | undefined;
  programas: Programa[];
  /** Modalidad efectiva (override válido, la primera, o undefined si no hay). */
  modalidad: string | undefined;
  /** Mostrar el selector (hay más de una moneda o más de un programa). */
  visible: boolean;
  setMoneda: (m: Moneda) => void;
  setModalidad: (m: string) => void;
}

/**
 * Carga el menú de tarifas públicas de un tour (Step 10.0) y deriva las monedas
 * y programas disponibles para la audiencia elegida. Los valores efectivos
 * (`moneda`/`modalidad`) son lo que hay que mandar a `/api/quote` y al checkout:
 * un override del usuario si sigue siendo válido, o el primero disponible.
 *
 * Compatibilidad: un tour de tarifa única (modalidad null, una sola moneda)
 * devuelve `visible=false`, `modalidad=undefined` → el motor toma esa tarifa.
 */
export function useProgramas(slug: string, audiencia: Audiencia): ProgramasState {
  const [menu, setMenu] = useState<TarifaPublica[] | null>(null);
  const [monedaSel, setMonedaSel] = useState<Moneda | null>(null);
  const [modalidadSel, setModalidadSel] = useState<string | null>(null);

  // Carga el menú al cambiar el tour; limpia overrides.
  useEffect(() => {
    let cancelled = false;
    setMenu(null);
    setMonedaSel(null);
    setModalidadSel(null);
    if (!slug) return;
    fetchTarifasPublicas(slug).then((res) => {
      if (cancelled) return;
      setMenu(res.ok ? res.data.tarifas : []);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Al cambiar la audiencia, los precios/programas pueden diferir → limpia overrides.
  useEffect(() => {
    setMonedaSel(null);
    setModalidadSel(null);
  }, [audiencia]);

  const derived = useMemo(() => {
    const rows = menu ?? [];
    const rowsAud = rows.filter((r) => r.audiencia === audiencia);

    const monedas = Array.from(new Set(rowsAud.map((r) => r.moneda))).sort((a, b) =>
      a === 'USD' ? -1 : b === 'USD' ? 1 : 0,
    );
    const moneda = monedaSel && monedas.includes(monedaSel) ? monedaSel : monedas[0];

    const rowsCur = rowsAud.filter((r) => r.moneda === moneda);
    const mods = new Map<string, number>();
    for (const r of rowsCur) {
      if (r.modalidad == null) continue;
      const prev = mods.get(r.modalidad);
      mods.set(r.modalidad, prev == null ? r.pp_adulto : Math.min(prev, r.pp_adulto));
    }
    const programas: Programa[] = Array.from(mods, ([modalidad, ppAdulto]) => ({ modalidad, ppAdulto }));
    const modalidad = modalidadSel && mods.has(modalidadSel) ? modalidadSel : programas[0]?.modalidad;

    const visible = monedas.length > 1 || programas.length > 1;
    return { ready: menu != null, monedas, moneda, programas, modalidad, visible };
  }, [menu, audiencia, monedaSel, modalidadSel]);

  return { ...derived, setMoneda: setMonedaSel, setModalidad: setModalidadSel };
}
