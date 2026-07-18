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
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en .env (ver .env.example).',
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Cliente con service role — SOLO servidor. Bypassa RLS. */
export function createAdminClient(): SupabaseClient {
  const secret = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (secreto, solo servidor).');
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
