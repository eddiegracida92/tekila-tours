import { defineConfig } from 'vitest/config';

// Tests unitarios de la lógica pura (pricing/availability). No cargan Astro,
// así que basta con Vitest en entorno Node. Los tests viven junto al código
// (`*.test.ts`) e importan con rutas relativas para no depender del alias `@/`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
