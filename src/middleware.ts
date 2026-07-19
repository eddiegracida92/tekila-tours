import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from '@/lib/auth';

/**
 * Guardia del panel admin (Step 9.1).
 *
 * Protege TODO `/admin/*` en el servidor (no solo ocultando UI):
 *  - `/admin/login` es público; si ya hay sesión de gestión, va al dashboard.
 *  - Cualquier otra ruta `/admin/*` sin sesión de gestión válida → login.
 *
 * El panel `/admin/*` es solo para PERSONAL DE GESTIÓN (owner/staff). Un
 * 'vendedor' autenticado no entra aquí: su lugar es el portal `/vendedor/*`
 * (Step 9.5 UI). Por eso el guard exige rol owner/staff, no cualquier fila.
 *
 * El perfil (rol/permisos) se inyecta en `Astro.locals.admin` para que el
 * layout y las páginas no vuelvan a consultarlo. Fuera de `/admin` no hace nada.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith('/admin')) return next();

  const admin = await getAdminSession(context.request, context.cookies);
  // Solo owner/staff acceden al panel de gestión; un vendedor no cuenta aquí.
  const gestion = admin && admin.rol !== 'vendedor' ? admin : null;
  context.locals.admin = gestion;

  if (pathname === '/admin/login') {
    return gestion ? context.redirect('/admin') : next();
  }

  if (!gestion) return context.redirect('/admin/login');

  return next();
});
