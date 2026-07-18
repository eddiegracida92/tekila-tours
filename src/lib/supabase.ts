import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Clientes de Supabase.
 *
 * - `supabase` (publishable/anon): seguro para navegador y build. La RLS
 *   bloquea `tarifas` (PR) y demás tablas sensibles. Úsalo para leer el
 *   catálogo público: `tours`, `tour_imagenes`, `disponibilidad`, `temporadas`
 *   y la vista `precio_desde_publico` (Step 5).
 * - `createAdminClient()` (service role): IGNORA la RLS. Úsalo SOLO en el
 *   servidor (`src/pages/api/*`, Step 6+); nunca en código que llegue al
 *   navegador. El precio y el cupo se resuelven server-side con este cliente.
 */

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env (ver .env.example).',
  );
}

export const supabase: SupabaseClient = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Cliente con service role — SOLO servidor. Bypassa RLS. */
export function createAdminClient(): SupabaseClient {
  const secret = import.meta.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error('Falta SUPABASE_SECRET_KEY (secreto, solo servidor).');
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
