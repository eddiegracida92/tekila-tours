# Tekila Tours Web-App

Web-app de reservación de tours en Cancún (agencia revendedora). Catálogo bilingüe,
disponibilidad por fecha, matriz de precios, pago total en línea y panel admin.

## Commands
- `pnpm dev` — Servidor de desarrollo (http://localhost:4321)
- `pnpm build` — Build de producción
- `pnpm preview` — Previsualizar build
- `pnpm test` — Vitest (unit) · `pnpm test:e2e` — Playwright  _(se añaden en Steps 6/15)_
- `pnpm db:push` — Aplicar migraciones a Supabase _(Step 4)_
- `pnpm db:seed` — Cargar datos semilla _(Step 4)_

## Tech Stack
Astro 7 + TypeScript (strict) + CSS tokens + React 19 (islas) + Supabase (Postgres/Auth/Storage)
+ Stripe→MercadoPago→PayPal + Resend + Vercel.

## Architecture
- `src/pages/` — rutas Astro; `src/pages/api/` — serverless (quote, hold, checkout, webhooks).
- `src/components/site|tours` — Astro estático; `src/components/booking` — islas React.
- `src/lib/` — `pricing.ts`, `availability.ts`, `reservations.ts`, `payments/*`, `supabase.ts`.
- `supabase/migrations` — esquema + RLS + RPC (`crear_hold`, `confirmar_reserva`).
- Data flow: cliente → `/api/*` (service role) → Supabase. El **precio y el cupo se resuelven
  SIEMPRE en el servidor**; el cliente nunca es fuente de verdad.

## Key Patterns
- Astro estático por defecto; React solo en islas (checkout, calendario, admin) con `client:*`.
- Todo cobro pasa por `/api/checkout` + webhook; secretos solo en servidor.
- Anti-sobreventa vía holds + RPC atómicas de Postgres.
- i18n es/en con `src/i18n/*.json`; nunca hardcodear texto visible.

## Code Organization Rules
1. Un componente por archivo, máx. 300 líneas.
2. Alias `@/` para `src/`.
3. Sin barrel exports; importar directo.
4. Validar todo payload de API con zod.
5. Mobile-first; usar `astro:assets` para TODA imagen (nunca `<img>` a PNG crudo).

## Design System
Colores: Navy #12192C, Navy-mid #1E2D4A, Gold #D4AB3B, Teal #1CBFC0, Coral #E05A2B,
Sand #FAFAF6, Surface #F0EDE4, Text #1A1A2E, Muted #6B7280.
Tipografía: Oswald (display 600/700), Nunito (body 400/600/700), self-host con @fontsource.
Radio 8px (16px tarjetas), espaciado 4–8–12–16–24–32–48–64, max-width 1200px.
Tokens en `src/styles/tokens.css`.

## Environment Variables
Ver `.env.example`. Nunca prefijar secretos con `PUBLIC_`. Service role solo en `/api/*`.

## Reglas No Negociables
1. Ninguna API key/secreto en el frontend ni en variables `PUBLIC_*`.
2. El precio cobrado = salida de `/api/quote` (server); nunca confiar en el cliente.
3. Toda reserva pagada se confirma vía webhook idempotente, no desde el navegador.
4. Performance budget: home < 2–3 MB, LCP < 2.5 s; toda imagen vía `astro:assets`.
5. Precio Reporte (PR) jamás se expone al público anónimo. Visible a rol owner en admin y a
   vendedores que el owner autorice vía switch `puede_ver_pr` (default false), aplicado
   **server-side** (RLS/API) dentro del portal autenticado — nunca por ocultar solo en la UI.

## Legacy
El sitio original (landing monolítica GitHub Pages) está respaldado en `public/legacy/`
hasta terminar la migración (Steps 2–5).
