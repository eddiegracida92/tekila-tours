import type { ImageMetadata } from 'astro';
import placeholder from '@/assets/placeholder-tour.jpg';

/**
 * Imágenes locales por `slug` de tour (Step 10.1).
 *
 * Los assets viven en `src/assets/tours/` nombrados `<slug>-<n>.jpg`
 * (ej. `dd-cozumel-1.jpg`, `dd-cozumel-2.jpg`). Se agrupan por slug (quitando
 * el sufijo `-<n>`) y se ordenan por nombre → la `-1` es la principal.
 * Optimizadas en build vía `astro:assets` (AVIF/WebP).
 *
 * Un tour sin fotos cae al placeholder de marca (`placeholder-tour.jpg`).
 */

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/tours/*.{png,jpg,jpeg,webp,avif}',
  { eager: true },
);

const bySlug = new Map<string, ImageMetadata[]>();
for (const [path, mod] of Object.entries(modules)) {
  const file = path.split('/').pop()!.replace(/\.[^.]+$/, ''); // sin extensión
  const slug = file.replace(/-\d+$/, ''); // quita el sufijo -<n>
  const arr = bySlug.get(slug) ?? [];
  arr.push(mod.default);
  bySlug.set(slug, arr);
}
// Orden estable por nombre de archivo (asegura -1, -2, -3…).
for (const arr of bySlug.values()) {
  arr.sort((a, b) => (a.src < b.src ? -1 : a.src > b.src ? 1 : 0));
}

/** Placeholder de marca para tours sin fotos. */
export const placeholderTour: ImageMetadata = placeholder;

/** Todas las imágenes de un tour (ordenadas). `[]` si no tiene ninguna. */
export function tourImages(slug: string): ImageMetadata[] {
  return bySlug.get(slug) ?? [];
}

/** Imagen principal del tour (la `-1`), o el placeholder de marca si no hay. */
export function tourImage(slug: string): ImageMetadata {
  return bySlug.get(slug)?.[0] ?? placeholder;
}
