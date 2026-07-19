---
name: chequeo-seguridad
description: >-
  Chequeo de seguridad específico de Tekila Tours (Astro + Supabase + Stripe).
  Usar cuando el usuario pida revisar/auditar la seguridad, mencione
  "chequeo de seguridad", "vulnerabilidades", "¿es seguro?", "antes de subir a
  prod/deploy", o después de tocar /api/*, auth, middleware, RLS, migraciones,
  pagos, webhooks o el manejo del PR. También antes de cualquier release.
---

# Chequeo de seguridad — Tekila Tours

Auditoría estática de ESTE repo (no genérica). Sigue el orden tal cual; cada
sección dice qué buscar, con qué comando y qué es "normal aquí" para no
reportar falsos positivos.

## Mapa de 30 segundos (qué proteger y por qué)

Web-app de reservación de tours (Astro 7 estático + rutas on-demand en Vercel,
Supabase Postgres/Auth, Stripe Checkout, Resend). Las joyas de la corona:

1. **El PR (Precio Reporte = costo de la agencia).** Jamás visible al público
   ni a vendedores sin permiso. Vive en `tarifas.pr_adulto/pr_menor` y
   `reservas.costo_total_pr`. Candados: revoke de columnas + vista
   `tarifas_admin` + `interno` nunca serializado en `/api/quote`.
2. **Secretos:** `SUPABASE_SECRET_KEY` (service role, ignora RLS),
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`. Solo servidor.
3. **El dinero:** el monto cobrado sale de `cotizar()` en el servidor
   ([checkout.ts](src/pages/api/checkout.ts)); la confirmación de pago SOLO
   entra por el webhook firmado ([stripe.ts](src/pages/api/webhooks/stripe.ts)).
4. **PII de clientes:** `reservas.cliente_*` y `email_suscriptores`.
5. **Sesiones admin:** cookies httpOnly vía `@supabase/ssr`
   ([auth.ts](src/lib/auth.ts)) + guard en [middleware.ts](src/middleware.ts).

Superficie de ataque: endpoints públicos sin auth (`/api/quote`, `/api/hold`,
`/api/checkout`, `/api/webhooks/stripe`), páginas públicas on-demand
(`/confirmacion/*`), formularios POST del panel `/admin/*`, y la RLS en
`supabase/migrations/`.

## Orden del chequeo

### 1. Secretos expuestos o committeados

```bash
git ls-files | grep -iE '\.env'          # debe salir SOLO .env.example (sin valores)
git grep -nE 'sb_secret_[A-Za-z0-9]{8,}|sk_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|re_[A-Za-z0-9]{16,}' -- ':!*.example'
# Historial completo (lento pero necesario si hay sospecha):
git rev-list --all | xargs -I{} git grep -lE 'sb_secret_[A-Za-z0-9]{8,}|sk_(test|live)_[A-Za-z0-9]{8,}' {} -- 2>/dev/null
```

- **Falso positivo conocido:** `.env.example` documenta los prefijos
  (`sk_test_`, `whsec_`, `re_`) sin valores — un grep de prefijos lo marca; no
  es hallazgo.
- `git grep -n 'PUBLIC_' src astro.config.mjs` → los únicos `PUBLIC_` legítimos
  son `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `PUBLIC_SITE_URL`. Cualquier otro `PUBLIC_` nuevo = sospechoso (regla no
  negociable #1 del CLAUDE.md).
- Secretos solo en código de servidor:
  ```bash
  git grep -n 'createAdminClient\|SUPABASE_SECRET_KEY\|STRIPE_SECRET_KEY\|STRIPE_WEBHOOK_SECRET\|RESEND_API_KEY' src/
  ```
  Permitido en: `src/lib/supabase.ts`, `src/lib/payments/stripe.ts`,
  `src/lib/emails/send.ts`, `src/pages/api/*`, y el frontmatter de archivos
  `.astro` (corre en servidor; hoy lo usan `src/pages/admin/vendedores/*` y
  `src/components/booking/ConfirmationView.astro` — intencional).
  **PROHIBIDO** en cualquier `.tsx` de `src/components/booking/` (islas React
  que viajan al navegador) y en `src/lib/booking-client.ts`.
- Si existe `dist/`: `grep -rl 'sb_secret_\|sk_test_\|sk_live_\|whsec_' dist/client/`
  debe salir vacío.

### 2. Validación de lo que entra

Inventario de entradas y su validador esperado — verificar que TODAS lo usen y
que ningún endpoint/página nueva se haya saltado el patrón:

| Entrada | Validación esperada |
|---|---|
| `src/pages/api/quote.ts`, `hold.ts`, `checkout.ts` | `Schema.safeParse` (zod) ANTES de tocar la BD |
| `src/pages/api/webhooks/stripe.ts` | La validación ES la firma: `construirEventoWebhook(rawBody, signature)` sobre `request.text()` crudo. Nunca `request.json()` antes de verificar |
| POST de `/admin/*` (login, tours, tarifas, temporadas, disponibilidad, vendedores) | `parse*Form` de `src/lib/admin/*.ts` (zod sobre FormData) |

```bash
grep -rL 'safeParse' src/pages/api --include='*.ts'   # cualquier hit sin justificación = hallazgo
```

- **CSRF:** los forms del panel dependen del `security.checkOrigin` de Astro
  (activo por default en rutas on-demand). Verificar que
  [astro.config.mjs](astro.config.mjs) NO tenga `security: { checkOrigin: false }`.
- Límites: los schemas acotan tamaños (`max(50)` personas, `max(200)` email…).
  Un schema nuevo sin `.max()` en strings/números es hallazgo (severidad media).

### 3. Autorización — quién puede tocar qué (no solo quién entra)

- [middleware.ts](src/middleware.ts) cubre SOLO `/admin/*` y excluye al rol
  `vendedor`. Si aparece una sección nueva (p. ej. `/vendedor/*`), el
  middleware actual NO la protege: exige su propio guard. Grep de rutas nuevas:
  `ls src/pages/`.
- [auth.ts](src/lib/auth.ts): `getAdminSession` usa `auth.getUser()` (valida
  el token contra Supabase). Si alguien lo cambió a `getSession()` (confía en
  la cookie sin validar) → hallazgo crítico.
- El panel escribe con `createServerSupabase` (sesión del admin → la RLS es el
  candado real). Excepción documentada: `src/pages/admin/vendedores/*` usa
  `createAdminClient` para crear usuarios de Auth — verificar que esas páginas
  sigan detrás del middleware y validen rol owner.
- **RLS en migraciones** (`supabase/migrations/`): toda tabla nueva debe tener
  `enable row level security` + policies + grants mínimos. Deny-all para
  `anon` en: `tarifas`, `reservas`, `holds`, `pagos`, `promos`, `admin_users`,
  `email_suscriptores`.
- **Candado del PR (dos capas,** [20260719130000_tarifas_pr_gate.sql](supabase/migrations/20260719130000_tarifas_pr_gate.sql)**):**
  revoke del SELECT de `pr_adulto/pr_menor` a `authenticated` + vista
  `tarifas_admin` con `puede_ver_pr()`. Peligro típico: un
  `grant select on tarifas to authenticated` SIN lista de columnas en una
  migración posterior rompe la capa 1 silenciosamente.
- **Aislamiento de vendedores** ([20260719150000_aislar_vendedores.sql](supabase/migrations/20260719150000_aislar_vendedores.sql)):
  `is_admin()` = owner/staff **activo**; vendedor solo lee reservas con
  `vendedor_id = auth.uid()`.
- **RPCs** (`crear_hold`, `confirmar_reserva`, `expirar_holds` en
  [20260717120200_rpc.sql](supabase/migrations/20260717120200_rpc.sql)):
  `execute` revocado de `public`, otorgado solo a `service_role`.
- **NO reportar como hallazgo:** las vistas `tarifas_admin` y
  `precio_desde_publico` son security definer INTENCIONALMENTE (el lint de
  Supabase las marca; está documentado en las migraciones).

### 4. Inyección

- SQL: supabase-js parametriza `.eq/.insert/.update`. Buscar interpolación de
  input en filtros crudos: `git grep -nE '\.(or|filter)\(' src/` y SQL dinámico
  en migraciones.
- XSS: Astro escapa por default. `git grep -n 'set:html\|dangerouslySetInnerHTML' src/`
  debe salir vacío (hoy lo está); cualquier hit nuevo exige revisar el origen
  del dato.
- **HTML de emails:** [confirmacion.ts](src/lib/emails/confirmacion.ts)
  interpola datos en HTML a mano. `clienteNombre` viene del formulario público
  de checkout (hasta 160 chars, sin filtro de caracteres) — verificar que se
  escape antes de interpolar. (Hallazgo conocido a la fecha de esta skill: NO
  se escapa.)
- Redirecciones: `success_url`/`cancel_url` se arman con `PUBLIC_SITE_URL` +
  folio en el servidor. Ningún redirect debe usar input del usuario crudo.

### 5. Datos sensibles en logs y respuestas

- **PR:** `interno`, `costoTotalPr`, `pr_adulto|pr_menor` jamás en un
  `json(...)` de `/api/*` público ni en HTML de páginas públicas.
  ```bash
  git grep -n 'interno\|costo_total_pr\|pr_adulto\|pr_menor' src/pages src/components
  ```
  Revisar cada hit: ¿a qué rol le llega esa respuesta/página?
- Errores de API públicos: códigos opacos vía `errorJson('error_bd', 500)`
  ([api.ts](src/lib/api.ts)); nunca el `error.message` de Postgres al público
  (revela esquema). En el panel admin sí se muestra `message` — aceptable, es
  interno.
- PII: email/teléfono del cliente nunca en URLs ni en `console.*`.
  `git grep -n 'console\.' src/` y revisar qué se loguea.
- Punto conocido a vigilar: [ConfirmationView.astro](src/components/booking/ConfirmationView.astro)
  muestra `cliente_email` a quien tenga el `session_id` de Stripe (no
  adivinable, riesgo aceptado). Si alguien lo cambia a buscar por `folio` u
  otro identificador corto/enumerable → hallazgo alto.

### 6. Dependencias con hoyos conocidos

```bash
pnpm audit --prod     # lo que llega a producción; lo de dev repórtalo aparte
pnpm outdated         # focos: stripe, @supabase/supabase-js, @supabase/ssr, astro, zod, resend
```

## Regla de oro

Cada hallazgo lleva: **archivo:línea + severidad + cómo se explota en UNA
frase**. Si no puedes escribir la frase de explotación, no es hallazgo — es
opinión y va en "Notas", no en el reporte.

## Antes de reportar: intenta tumbar cada hallazgo propio

Solo sobreviven los que resisten estas cuatro preguntas:

1. ¿El código es alcanzable desde fuera? (¿ruta on-demand o estática?, ¿detrás
   del middleware?, ¿la corre `anon`, `authenticated` o solo `service_role`?)
2. ¿Otra capa ya lo bloquea? (RLS, revoke de columnas, firma del webhook, zod,
   checkOrigin)
3. ¿Es intencional y está documentado? (vistas security definer,
   `createAdminClient` en `vendedores/*`, prefijos en `.env.example`)
4. ¿Puedo trazar el camino completo del dato, de la entrada al daño?

## Severidades (calibradas a ESTE negocio)

- **Crítica:** PR legible por anónimo o por vendedor sin `puede_ver_pr`;
  secreto en el bundle del cliente o en git; cobrar un monto dictado por el
  navegador; confirmar una reserva sin verificar la firma del webhook.
- **Alta:** endpoint `/api` nuevo sin zod; tabla nueva sin RLS; escalada
  staff→owner; PII de clientes visible a un rol que no debería.
- **Media:** inyección de HTML en emails; enumeración de datos con
  identificadores semi-públicos; ausencia de rate limiting en `/api/hold`
  (agotar el cupo real con holds de 15 min es un ataque al inventario).
- **Baja:** mensajes de error verbosos dentro del panel; dependencias
  desactualizadas sin CVE conocido.

## Formato de salida

```markdown
# Chequeo de seguridad — <fecha>

## Hallazgos
### Crítica
- archivo:línea — qué es. **Explotación:** <una frase>. **Arreglo:** <concreto>.
### Alta / Media / Baja
- (igual)

## Qué NO se revisó (lista honesta, siempre presente)
- Estado real de la RLS en la BD viva (las migraciones pueden divergir de lo
  aplicado; verificar con el dashboard de Supabase o `supabase db diff`).
- Variables de entorno en Vercel y config del endpoint del webhook en Stripe.
- Rotación/exposición de llaves fuera del repo; DNS/SPF/DKIM del dominio de email.
- <lo que esta corrida en particular no alcanzó a cubrir>

## Notas (opiniones sin frase de explotación — no son hallazgos)
- ...
```
