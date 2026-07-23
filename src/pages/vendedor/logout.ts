export const prerender = false;

import type { APIRoute } from 'astro';
import { createServerSupabase } from '@/lib/auth';

/** Cierra la sesión del vendedor (limpia las cookies) y vuelve al login. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createServerSupabase(request, cookies);
  await supabase.auth.signOut();
  return redirect('/vendedor/login');
};
