import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies, AstroCookieSetOptions } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auth del panel admin (Step 9.1).
 *
 * A diferencia de `src/lib/supabase.ts` (cliente anónimo sin sesión / service
 * role sin RLS), aquí construimos un cliente de Supabase **ligado a la sesión
 * del usuario** vía cookies. Con él sabemos QUIÉN está autenticado en cada
 * petición y respetamos la RLS (`is_admin()` / `is_owner()`).
 *
 * La sesión vive en cookies `httpOnly` que gestiona `@supabase/ssr`: el
 * JavaScript del navegador no puede leerlas. El precio/cupo siguen
 * resolviéndose con service role en `/api/*`; esto es solo para el panel.
 */

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env (ver .env.example).',
  );
}

/** Roles del panel (enum `admin_rol_t` en Postgres). */
export type AdminRol = 'owner' | 'staff' | 'vendedor';

/** Perfil del admin autenticado (fila de `admin_users` + email de auth). */
export interface AdminProfile {
  id: string;
  email: string;
  rol: AdminRol;
  nombre: string | null;
  activo: boolean;
  permisos: Record<string, unknown>;
}

/**
 * Cliente de Supabase con la sesión del usuario, leída/escrita en las cookies
 * de la petición Astro. Úsalo en middleware, páginas `/admin/*` y endpoints de
 * auth. `signInWithPassword` / `signOut` actualizan las cookies por este canal.
 */
export function createServerSupabase(request: Request, cookies: AstroCookies): SupabaseClient {
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, options as AstroCookieSetOptions);
        }
      },
    },
  });
}

/**
 * Devuelve el perfil admin si hay una sesión válida Y el usuario existe en
 * `admin_users` y está activo; si no, `null`. Valida el token contra Supabase
 * (`getUser`, no `getSession`), así que es seguro para proteger rutas.
 */
export async function getAdminSession(
  request: Request,
  cookies: AstroCookies,
): Promise<AdminProfile | null> {
  const supabase = createServerSupabase(request, cookies);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('admin_users')
    .select('id, rol, nombre, activo, permisos')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data || !data.activo) return null;

  return {
    id: data.id,
    email: user.email ?? '',
    rol: data.rol as AdminRol,
    nombre: data.nombre,
    activo: data.activo,
    permisos: (data.permisos ?? {}) as Record<string, unknown>,
  };
}

/** ¿Es owner? (único rol que edita tarifas y siempre ve el PR). */
export function esOwner(admin: AdminProfile | null): boolean {
  return admin?.rol === 'owner';
}

/**
 * ¿Puede ver el PR? Owner siempre; vendedor solo con `permisos.puede_ver_pr`.
 * Espejo en el servidor de la función SQL `puede_ver_pr()` — el candado real
 * vive en la BD (vista `tarifas_admin`); esto decide qué pinta el panel.
 */
export function puedeVerPr(admin: AdminProfile | null): boolean {
  if (!admin) return false;
  return admin.rol === 'owner' || admin.permisos?.puede_ver_pr === true;
}
