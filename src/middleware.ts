import { defineMiddleware } from 'astro:middleware';
import { getAdminSession } from '@/lib/auth';

/**
 * Guardia del panel admin (Step 9.1).
 *
 * Protege TODO `/admin/*` en el servidor (no solo ocultando UI):
 *  - `/admin/login` es público; si ya hay sesión admin, va al dashboard.
 *  - Cualquier otra ruta `/admin/*` sin sesión admin válida → redirige al login.
 *
 * El perfil (rol/permisos) se inyecta en `Astro.locals.admin` para que el
 * layout y las páginas no vuelvan a consultarlo. Fuera de `/admin` no hace nada.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith('/admin')) return next();

  const admin = await getAdminSession(context.request, context.cookies);
  context.locals.admin = admin;

  if (pathname === '/admin/login') {
    return admin ? context.redirect('/admin') : next();
  }

  if (!admin) return context.redirect('/admin/login');

  return next();
});
