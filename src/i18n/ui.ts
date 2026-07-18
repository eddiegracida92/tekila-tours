import es from './es.json';
import en from './en.json';

/** Idiomas soportados. El primero es el default (sin prefijo de ruta). */
export const languages = {
  es: 'Español',
  en: 'English',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'es';

const dictionaries: Record<Lang, Record<string, string>> = { es, en };

/**
 * Detecta el idioma a partir del pathname (`/en/...` → 'en', resto → 'es').
 */
export function getLangFromUrl(url: URL): Lang {
  const [, maybeLang] = url.pathname.split('/');
  if (maybeLang && maybeLang in languages) return maybeLang as Lang;
  return defaultLang;
}

/**
 * Devuelve la función de traducción para un idioma.
 * Cae al default y luego a la propia clave si no existe la cadena.
 */
export function useTranslations(lang: Lang) {
  return function t(key: string): string {
    return dictionaries[lang][key] ?? dictionaries[defaultLang][key] ?? key;
  };
}

/**
 * Prefija una ruta con el idioma (default sin prefijo).
 *   localizePath('/', 'es')       → '/'
 *   localizePath('/', 'en')       → '/en/'
 *   localizePath('/tours', 'en')  → '/en/tours'
 */
export function localizePath(path: string, lang: Lang): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLang) return clean;
  return `/${lang}${clean === '/' ? '/' : clean}`;
}
