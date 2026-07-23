import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from '@/lib/auth';

/**
 * Guardia de las dos áreas autenticadas del servidor.
 *
 * `/admin/*` — PERSONAL DE GESTIÓN (owner/staff). Un 'vendedor' no entra aquí.
 * `/vendedor/*` — PORTAL DE VENDEDORES (rol 'vendedor'). Owner/staff no entran
 *   aquí: su lugar es `/admin`. Cada rol se enruta a su propio login.
 *
 * Ambas leen la sesión de `admin_users` con `getAdminSession` (valida el token
 * con `getUser`) y filtran por rol. El perfil se inyecta en `Astro.locals`
 * (`admin` o `vendedor`) para que las páginas no vuelvan a consultarlo. Fuera de
 * estas dos áreas el middleware no hace nada.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const enAdmin = pathname.startsWith('/admin');
  const enVendedor = pathname.startsWith('/vendedor');
  if (!enAdmin && !enVendedor) return next();

  const perfil = await getAdminSession(context.request, context.cookies);

  if (enAdmin) {
    // Solo owner/staff acceden al panel de gestión; un vendedor no cuenta aquí.
    const gestion = perfil && perfil.rol !== 'vendedor' ? perfil : null;
    context.locals.admin = gestion;

    if (pathname === '/admin/login') {
      return gestion ? context.redirect('/admin') : next();
    }
    if (!gestion) return context.redirect('/admin/login');
    return next();
  }

  // enVendedor: solo el rol 'vendedor' activo entra al portal.
  const vendedor = perfil && perfil.rol === 'vendedor' ? perfil : null;
  context.locals.vendedor = vendedor;

  if (pathname === '/vendedor/login') {
    return vendedor ? context.redirect('/vendedor') : next();
  }
  if (!vendedor) return context.redirect('/vendedor/login');
  return next();
});
