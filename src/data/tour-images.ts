import type { ImageMetadata } from 'astro';

/**
 * Mapa de imagen local por `slug` de tour.
 *
 * Las imágenes se mantienen como assets locales optimizados vía `astro:assets`
 * (AVIF/WebP responsive — Lighthouse 100). En la BD `imagen_principal` /
 * `tour_imagenes` están vacías hasta el Step 10, que sube los assets reales
 * (Supabase Storage). Mientras tanto, resolvemos la imagen por el slug del tour.
 */

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/tours/*.{png,jpg,jpeg,webp,avif}',
  { eager: true },
);

const bySlug = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(modules)) {
  const slug = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  bySlug.set(slug, mod.default);
}

/** Imagen principal del tour (o `undefined` si aún no hay asset local). */
export function tourImage(slug: string): ImageMetadata | undefined {
  return bySlug.get(slug);
}
