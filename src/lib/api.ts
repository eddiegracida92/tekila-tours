/** Helpers compartidos por los endpoints `/api/*` (Step 6). */

/** Respuesta JSON con status y no-cache (precio/cupo se resuelven en vivo). */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** Respuesta de error uniforme: `{ ok: false, error, detalles? }`. */
export function errorJson(error: string, status = 400, detalles?: unknown): Response {
  return json({ ok: false, error, ...(detalles ? { detalles } : {}) }, status);
}
