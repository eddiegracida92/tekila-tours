// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // URL canónica del sitio (se sobreescribe en Vercel con PUBLIC_SITE_URL).
  site: process.env.PUBLIC_SITE_URL ?? 'https://tekilatours.com',

  // Estático por defecto (0 JS). Cada endpoint /api/* y ruta dinámica
  // que lo necesite opta por on-demand con `export const prerender = false`.
  output: 'static',

  // Hosting en Vercel: estáticos al CDN, rutas on-demand como Functions.
  adapter: vercel(),

  // Islas interactivas (checkout, calendario, admin). El resto es HTML estático.
  integrations: [react()],

  // astro:assets usa Sharp por defecto → WebP/AVIF + srcset/sizes (Step 3).
  // Las imágenes subidas por admin (Supabase Storage) se autorizan aquí más adelante:
  // image: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
});
