import type { ImageMetadata } from 'astro';
import type { Lang } from '@/i18n/ui';

import islaMujeres from '@/assets/tours/isla-mujeres.png';
import chichenClasico from '@/assets/tours/chichen-clasico.png';
import chichenMaya from '@/assets/tours/chichen-maya.png';
import xplor from '@/assets/tours/xplor.png';
import xoximilco from '@/assets/tours/xoximilco.png';
import xplorFuego from '@/assets/tours/xplor-fuego.png';
import xenses from '@/assets/tours/xenses.png';
import xelha from '@/assets/tours/xelha.png';
import xcaretBasico from '@/assets/tours/xcaret-basico.png';
import xcaretPlus from '@/assets/tours/xcaret-plus.png';

/** Contenido de un tour en un idioma. */
export interface TourContent {
  name: string;
  tag: string;
  desc: string;
}

/**
 * Catálogo semilla (Step 2). En el Step 5 esto se reemplaza por datos
 * de Supabase; la forma bilingüe se mantiene compatible.
 */
export interface Tour {
  id: string;
  image: ImageMetadata;
  es: TourContent;
  en: TourContent;
}

export const tours: Tour[] = [
  {
    id: 'isla-mujeres',
    image: islaMujeres,
    es: { name: 'Isla Mujeres Pleasure', tag: 'Mar y Diversión', desc: 'Snorkel en arrecife, catamarán La Victoria, barra libre nacional, festín mexicano en buffet y club de playa VIP. ¡Sol, mar y momentos inolvidables!' },
    en: { name: 'Isla Mujeres Pleasure', tag: 'Sea & Fun', desc: 'Reef snorkeling, La Victoria catamaran, open bar, Mexican buffet, and VIP beach club. Sun, sea, and unforgettable moments!' },
  },
  {
    id: 'chichen-clasico',
    image: chichenClasico,
    es: { name: 'Chichén Itzá Clásico by Xcaret', tag: 'Historia', desc: 'Autobús de lujo, acceso completo a Chichén Itzá con guía profesional, Cenote Ikkil o Maya y Balancanche. Explora la historia con estilo.' },
    en: { name: 'Chichén Itzá Classic by Xcaret', tag: 'History', desc: 'Luxury bus, full access to Chichén Itzá with a professional guide, Ikkil or Maya Cenote, and Balancanche. Explore history in style.' },
  },
  {
    id: 'chichen-maya',
    image: chichenMaya,
    es: { name: 'Chichén Maya VIP', tag: 'Experiencia VIP', desc: 'Transporte VIP panorámico, guía bilingüe, acceso a Chichén Itzá, cenote sagrado, sabor yucateco y recorrido por Valladolid. Un viaje legendario.' },
    en: { name: 'Chichén Maya VIP', tag: 'VIP Experience', desc: 'Panoramic VIP transport, bilingual guide, Chichén Itzá access, sacred cenote, Yucatán food, and Valladolid tour. A legendary journey.' },
  },
  {
    id: 'xplor',
    image: xplor,
    es: { name: 'Xplor Día', tag: 'Aventura Extrema', desc: 'Tirolesas épicas, vehículos anfibios por la selva, balsas subterráneas y hamacuatzaje. La aventura más intensa de Cancún bajo el sol.' },
    en: { name: 'Xplor Day', tag: 'Extreme Adventure', desc: "Epic zip-lines, amphibious vehicles through the jungle, underground rafts, and hammock splash. Cancún's most intense daytime adventure." },
  },
  {
    id: 'xoximilco',
    image: xoximilco,
    es: { name: 'Xoximilco', tag: 'Cultura y Fiesta', desc: 'Noche de trajinera, cena degustación con más de 10 platillos típicos, barra libre nacional, música en vivo y animación. La fiesta más mexicana sobre el agua.' },
    en: { name: 'Xoximilco', tag: 'Culture & Party', desc: 'Trajinera night cruise, tasting dinner with 10+ traditional dishes, open bar, live music, and entertainment. The most Mexican party on water.' },
  },
  {
    id: 'xplor-fuego',
    image: xplorFuego,
    es: { name: 'Xplor Fuego', tag: 'Aventura Nocturna', desc: 'Tirolesas nocturnas, vehículos anfibios, balsas de remos y nado en río de estalactitas iluminadas. La noche más intensa en la selva.' },
    en: { name: 'Xplor Fuego', tag: 'Night Adventure', desc: 'Night zip-lines, amphibious vehicles, rowing rafts, and swim through illuminated stalactite rivers. The most intense night in the jungle.' },
  },
  {
    id: 'xenses',
    image: xenses,
    es: { name: 'Xenses Xcaret', tag: 'Sensaciones', desc: 'Xensatorium, El Pueblo, vuelo de pájaro, Xpa y Lodorama. Un viaje fantástico diseñado para despertar todos tus sentidos.' },
    en: { name: 'Xenses Xcaret', tag: 'Sensations', desc: 'Xensatorium, The Village, bird flight, Xpa, and Lodorama. A fantastic journey designed to awaken all your senses.' },
  },
  {
    id: 'xelha',
    image: xelha,
    es: { name: 'Xel-Há', tag: 'Agua y Naturaleza', desc: 'Comida buffet, snorkel, toboganes, bicicletas acuáticas, margaritas y flotadores. Un acuario natural para disfrutar todo el día.' },
    en: { name: 'Xel-Há', tag: 'Water & Nature', desc: 'Buffet, snorkeling, slides, water bikes, margaritas, and floats. A natural aquarium to enjoy all day long.' },
  },
  {
    id: 'xcaret-basico',
    image: xcaretBasico,
    es: { name: 'Xcaret Básico', tag: 'Naturaleza', desc: 'Ríos subterráneos, playas y albercas naturales, recorrido por Xcaret, show México Espectacular y transporte incluido. Tu día a tu manera.' },
    en: { name: 'Xcaret Basic', tag: 'Nature', desc: 'Underground rivers, natural beaches and pools, Xcaret tour, México Espectacular show, and transport included. Your day, your way.' },
  },
  {
    id: 'xcaret-plus',
    image: xcaretPlus,
    es: { name: 'Xcaret Plus', tag: 'Experiencia Completa', desc: 'Comida buffet premium, acceso Área Plus con equipo de snorkel incluido, +50 atracciones naturales y show México Espectacular. Una experiencia épica.' },
    en: { name: 'Xcaret Plus', tag: 'Full Experience', desc: 'Premium buffet, Plus Area access with snorkel gear included, 50+ natural attractions, and México Espectacular show. An epic experience.' },
  },
];

/** Helper: contenido del tour en el idioma dado. */
export function tourContent(tour: Tour, lang: Lang): TourContent {
  return tour[lang];
}
