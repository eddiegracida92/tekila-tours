/**
 * Publicar catálogo (Step 10.1, Paso 3) — SOLO servidor, se corre a mano.
 * Acciones de "salir al aire", DESPUÉS de import-tours.mjs:
 *
 *   node --env-file=.env scripts/publicar-catalogo.mjs --dry-run
 *   node --env-file=.env scripts/publicar-catalogo.mjs
 *
 *  1) Siembra `disponibilidad` para los 8 tours nuevos: DIAS_ADELANTE días
 *     (1 año) desde hoy, con cupo_total = null (ilimitado, sujeto a confirmación con el
 *     operador). Idempotente (upsert por unique(tour_id,fecha)); NO pisa
 *     `cupo_reservado` ni `bloqueada` de filas ya existentes con reserva —
 *     usa insert-if-absent (ignora duplicados), no sobrescribe.
 *  2) DESACTIVA (activo=false, NO borra) todo tour cuyo slug no esté en el JSON:
 *     los 10 placeholders viejos (parques Xcaret) dejan de mostrarse.
 *
 * El cupo real por fecha se ajusta luego en el panel (/admin/tours/[id]/disponibilidad).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const DIAS_ADELANTE = 365;

function slugsDelJson() {
  const raw = JSON.parse(readFileSync(join(__dirname, 'data', 'tours.json'), 'utf8'));
  return raw.tours.map((t) => t.slug);
}

/** ISO YYYY-MM-DD de hoy + n días (hora local). */
function fechaISO(offsetDias) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function main() {
  const slugs = slugsDelJson();
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('✖ Faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (usa --env-file=.env).');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n${DRY ? '🔎 DRY-RUN (no escribe)' : '⚠️  APLICANDO A LA BD'}\n`);

  // IDs de los tours del JSON (ya importados).
  const { data: tours, error: tErr } = await db
    .from('tours')
    .select('id, slug, activo')
    .in('slug', slugs);
  if (tErr) {
    console.error('✖ leer tours:', tErr.message);
    process.exit(1);
  }
  const faltan = slugs.filter((s) => !tours.some((t) => t.slug === s));
  if (faltan.length) {
    console.error(`✖ estos slugs no están en la BD (¿corriste import-tours primero?): ${faltan.join(', ')}`);
    process.exit(1);
  }

  // 1) Disponibilidad: fechas hoy..+DIAS_ADELANTE, cupo null (ilimitado).
  const fechas = Array.from({ length: DIAS_ADELANTE }, (_, i) => fechaISO(i));
  console.log(`1) Disponibilidad: ${slugs.length} tours × ${fechas.length} días (cupo ilimitado, sujeto a confirmación).`);
  if (!DRY) {
    for (const t of tours) {
      const rows = fechas.map((f) => ({ tour_id: t.id, fecha: f, cupo_total: null, bloqueada: false }));
      // ignoreDuplicates: NO pisa filas existentes (preserva cupo_reservado/bloqueada).
      const { error } = await db
        .from('disponibilidad')
        .upsert(rows, { onConflict: 'tour_id,fecha', ignoreDuplicates: true });
      if (error) {
        console.error(`  ✖ disponibilidad ${t.slug}:`, error.message);
        process.exit(1);
      }
      console.log(`  ✓ ${t.slug}`);
    }
  }

  // 2) Desactivar placeholders (todo tour cuyo slug NO esté en el JSON).
  const { data: otros, error: oErr } = await db
    .from('tours')
    .select('slug, activo')
    .not('slug', 'in', `(${slugs.join(',')})`);
  if (oErr) {
    console.error('✖ leer otros tours:', oErr.message);
    process.exit(1);
  }
  const aDesactivar = otros.filter((t) => t.activo);
  console.log(`\n2) Desactivar placeholders: ${aDesactivar.length} tours → ${aDesactivar.map((t) => t.slug).join(', ') || '(ninguno)'}`);
  if (!DRY && aDesactivar.length) {
    const { error } = await db
      .from('tours')
      .update({ activo: false })
      .not('slug', 'in', `(${slugs.join(',')})`)
      .eq('activo', true);
    if (error) {
      console.error('  ✖ desactivar:', error.message);
      process.exit(1);
    }
    console.log('  ✓ desactivados');
  }

  console.log(`\n${DRY ? 'Nada escrito (dry-run).' : 'Listo.'}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
