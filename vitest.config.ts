import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitarios de la lógica pura (pricing/availability/payments). No cargan
// Astro, así que basta con Vitest en entorno Node. Los tests viven junto al
// código (`*.test.ts`). Se resuelve el alias `@/` igual que en Astro para poder
// testear módulos que importan con él (p. ej. `payments/stripe.ts`).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
