import type { ImageMetadata } from 'astro';
import type { Lang } from '@/i18n/ui';
import { supabase } from '@/lib/supabase';
import { tourImage, tourImages } from '@/data/tour-images';

/** Contenido de un tour en un idioma. */
export interface TourContent {
  name: string;
  tag: string; // categoría
  desc: string; // descripción corta
  descLarga: string;
  incluye: string[];
  noIncluye: string[];
}

/** Precio "desde" (Precio Público mínimo). Nunca contiene PR. */
export interface PrecioDesde {
  moneda: string;
  monto: number;
}

/** Tour normalizado del catálogo (bilingüe + imagen + precio desde). */
export interface CatalogTour {
  slug: string;
  orden: number;
  image: ImageMetadata; // principal (con fallback a placeholder de marca)
  images: ImageMetadata[]; // galería (vacía si el tour no tiene fotos)
  duracion: string | null;
  incluyeTransporte: boolean;
  precioDesde: PrecioDesde | null;
  es: TourContent;
  en: TourContent;
}

/** Fila cruda de `tours` (solo columnas públicas). */
interface TourRow {
  id: string;
  slug: string;
  nombre_es: string;
  nombre_en: string;
  categoria_es: string | null;
  categoria_en: string | null;
  desc_corta_es: string | null;
  desc_corta_en: string | null;
  desc_larga_es: string | null;
  desc_larga_en: string | null;
  duracion: string | null;
  incluye_transporte: boolean;
  incluye_es: string[] | null;
  incluye_en: string[] | null;
  no_incluye_es: string[] | null;
  no_incluye_en: string[] | null;
  orden: number;
}

const TOUR_COLUMNS =
  'id, slug, nombre_es, nombre_en, categoria_es, categoria_en, ' +
  'desc_corta_es, desc_corta_en, desc_larga_es, desc_larga_en, ' +
  'duracion, incluye_transporte, incluye_es, incluye_en, ' +
  'no_incluye_es, no_incluye_en, orden';

function content(row: TourRow, lang: Lang): TourContent {
  const es = lang === 'es';
  return {
    name: es ? row.nombre_es : row.nombre_en,
    tag: (es ? row.categoria_es : row.categoria_en) ?? '',
    desc: (es ? row.desc_corta_es : row.desc_corta_en) ?? '',
    descLarga: (es ? row.desc_larga_es : row.desc_larga_en) ?? '',
    incluye: (es ? row.incluye_es : row.incluye_en) ?? [],
    noIncluye: (es ? row.no_incluye_es : row.no_incluye_en) ?? [],
  };
}

function toCatalogTour(row: TourRow, precio: PrecioDesde | null): CatalogTour {
  return {
    slug: row.slug,
    orden: row.orden,
    image: tourImage(row.slug),
    images: tourImages(row.slug),
    duracion: row.duracion,
    incluyeTransporte: row.incluye_transporte,
    precioDesde: precio,
    es: content(row, 'es'),
    en: content(row, 'en'),
  };
}

/**
 * Lee el "precio desde" (pp mínimo) por tour desde la vista pública.
 * Si la vista aún no existe en la nube (falta `pnpm db:push`), degrada a un
 * mapa vacío en vez de romper el build: el catálogo funciona sin badge.
 */
async function getPreciosDesde(): Promise<Map<string, PrecioDesde>> {
  const map = new Map<string, PrecioDesde>();
  const { data, error } = await supabase
    .from('precio_desde_publico')
    .select('tour_id, moneda, desde_adulto');

  if (error) {
    console.warn(
      `[catalog] precio_desde_publico no disponible (¿falta db:push?): ${error.message}`,
    );
    return map;
  }

  for (const p of data ?? []) {
    // Una fila por (tour, moneda); nos quedamos con la primera (seed = USD).
    if (!map.has(p.tour_id)) {
      map.set(p.tour_id, { moneda: p.moneda, monto: Number(p.desde_adulto) });
    }
  }
  return map;
}

/** Todos los tours activos, ordenados, con precio desde. */
export async function getCatalogTours(): Promise<CatalogTour[]> {
  const { data, error } = await supabase
    .from('tours')
    .select(TOUR_COLUMNS)
    .eq('activo', true)
    .order('orden', { ascending: true });

  if (error) {
    throw new Error(`Supabase (tours): ${error.message}`);
  }

  const precios = await getPreciosDesde();
  const rows = (data ?? []) as unknown as TourRow[];
  return rows.map((row) => toCatalogTour(row, precios.get(row.id) ?? null));
}

/** Contenido del tour en el idioma dado. */
export function tourContent(tour: CatalogTour, lang: Lang): TourContent {
  return tour[lang];
}
