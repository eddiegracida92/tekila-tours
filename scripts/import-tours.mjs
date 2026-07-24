/**
 * Importador de catálogo (Step 10.1) — SOLO servidor, se corre a mano.
 *
 *   node --env-file=.env scripts/import-tours.mjs --dry-run   # muestra qué haría
 *   node --env-file=.env scripts/import-tours.mjs             # aplica a la BD
 *
 * Lee scripts/data/{tours,tarifas}.json (validados con zod), y:
 *  - upsert de cada tour por `slug` (idempotente).
 *  - por cada tour: BORRA sus tarifas y reinserta las del JSON. Es seguro:
 *    `reservas` guarda su propio snapshot de precio (no hay FK reservas→tarifas),
 *    así que reemplazar tarifas no afecta reservas existentes. Re-correr =
 *    mismo estado final (idempotente).
 *
 * DECISIÓN Step 10.1: el PR (costo) no está en las fuentes → pr = pp (margen 0);
 * el owner lo corrige luego por el panel. El PR nunca se expone al público.
 *
 * NO toca availability, temporadas ni desactiva los placeholders: eso es el
 * Paso 3 (acciones separadas y explícitas).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');

// ---------- Validación de los JSON de entrada ----------
const num = z.number().nullable();
const ProgramaSchema = z.object({
  modalidad: z.string().min(1).max(120),
  usd_adulto: num,
  usd_menor: num,
  mxn_adulto: num,
  mxn_menor: num,
});
const TarifasTourSchema = z.object({
  slug: z.string().min(1).max(120),
  programas: z.array(ProgramaSchema).min(1),
});
const TourSchema = z.object({
  slug: z.string().min(1).max(120),
  nombre_es: z.string().min(1),
  nombre_en: z.string().min(1),
  categoria_es: z.string().nullable().optional(),
  categoria_en: z.string().nullable().optional(),
  operador: z.string().nullable().optional(),
  desc_corta_es: z.string().nullable().optional(),
  desc_corta_en: z.string().nullable().optional(),
  desc_larga_es: z.string().nullable().optional(),
  desc_larga_en: z.string().nullable().optional(),
  duracion: z.string().nullable().optional(),
  dias_operacion: z.array(z.string()).optional(),
  horarios_salida: z.string().nullable().optional(),
  incluye_transporte: z.boolean().optional(),
  punto_salida: z.string().nullable().optional(),
  incluye_es: z.array(z.string()).optional(),
  incluye_en: z.array(z.string()).optional(),
  no_incluye_es: z.array(z.string()).optional(),
  no_incluye_en: z.array(z.string()).optional(),
  que_llevar_es: z.string().nullable().optional(),
  que_llevar_en: z.string().nullable().optional(),
  mostrar_que_llevar: z.boolean().optional(),
  restricciones_es: z.string().nullable().optional(),
  restricciones_en: z.string().nullable().optional(),
  mostrar_restricciones: z.boolean().optional(),
  edad_menor_min: z.number().int().nullable().optional(),
  edad_menor_max: z.number().int().nullable().optional(),
  capacidad_min: z.number().int().min(1).optional(),
  capacidad_max: z.number().int().min(1).optional(),
  anticipacion_horas: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().optional(),
});

function leer(nombre) {
  const raw = JSON.parse(readFileSync(join(__dirname, 'data', nombre), 'utf8'));
  return raw.tours;
}

// ---------- Construcción de filas ----------
/** Fila de `tours` con SOLO columnas conocidas (ignora claves `_*` del JSON). */
function filaTour(t) {
  return {
    slug: t.slug,
    nombre_es: t.nombre_es,
    nombre_en: t.nombre_en,
    categoria_es: t.categoria_es ?? null,
    categoria_en: t.categoria_en ?? null,
    operador: t.operador ?? null,
    grupo_xcaret: false,
    desc_corta_es: t.desc_corta_es ?? null,
    desc_corta_en: t.desc_corta_en ?? null,
    desc_larga_es: t.desc_larga_es ?? null,
    desc_larga_en: t.desc_larga_en ?? null,
    duracion: t.duracion ?? null,
    dias_operacion: t.dias_operacion ?? [],
    horarios_salida: t.horarios_salida ?? null,
    incluye_transporte: t.incluye_transporte ?? false,
    punto_salida: t.punto_salida ?? null,
    incluye_es: t.incluye_es ?? [],
    incluye_en: t.incluye_en ?? [],
    no_incluye_es: t.no_incluye_es ?? [],
    no_incluye_en: t.no_incluye_en ?? [],
    que_llevar_es: t.que_llevar_es ?? null,
    que_llevar_en: t.que_llevar_en ?? null,
    mostrar_que_llevar: t.mostrar_que_llevar ?? false,
    restricciones_es: t.restricciones_es ?? null,
    restricciones_en: t.restricciones_en ?? null,
    mostrar_restricciones: t.mostrar_restricciones ?? false,
    edad_menor_min: t.edad_menor_min ?? null,
    edad_menor_max: t.edad_menor_max ?? null,
    capacidad_min: t.capacidad_min ?? 1,
    capacidad_max: t.capacidad_max ?? 50,
    anticipacion_horas: t.anticipacion_horas ?? 24,
    impuesto_online: false,
    activo: t.activo ?? true,
    orden: t.orden ?? 0,
  };
}

/** Expande un programa a filas de `tarifas` (audiencias × monedas; pr = pp). */
function filasTarifa(tourId, programas) {
  const rows = [];
  for (const p of programas) {
    const monedas = [
      { moneda: 'USD', a: p.usd_adulto, m: p.usd_menor },
      { moneda: 'MXN', a: p.mxn_adulto, m: p.mxn_menor },
    ];
    for (const { moneda, a, m } of monedas) {
      if (a == null) continue; // esa moneda no existe para este programa
      for (const audiencia of ['nacional', 'extranjero']) {
        rows.push({
          tour_id: tourId,
          audiencia,
          temporada: 'unica',
          modalidad: p.modalidad,
          moneda,
          pp_adulto: a,
          pp_menor: m,
          pr_adulto: a, // PR = PP por ahora (Step 10.1); el owner lo corrige luego
          pr_menor: m,
          impuesto_adulto: 0,
          impuesto_menor: 0,
          activo: true,
        });
      }
    }
  }
  return rows;
}

// ---------- Main ----------
async function main() {
  const toursIn = leer('tours.json').map((t, i) => {
    const r = TourSchema.safeParse(t);
    if (!r.success) {
      console.error(`✖ tours.json[${i}] (${t.slug ?? '?'}) inválido:`, r.error.flatten().fieldErrors);
      process.exit(1);
    }
    return r.data;
  });
  const tarifasIn = leer('tarifas.json').map((t, i) => {
    const r = TarifasTourSchema.safeParse(t);
    if (!r.success) {
      console.error(`✖ tarifas.json[${i}] (${t.slug ?? '?'}) inválido:`, r.error.flatten().fieldErrors);
      process.exit(1);
    }
    return r.data;
  });

  const tarifasPorSlug = new Map(tarifasIn.map((t) => [t.slug, t.programas]));
  const slugsSinTarifa = toursIn.filter((t) => !tarifasPorSlug.has(t.slug)).map((t) => t.slug);
  if (slugsSinTarifa.length) {
    console.error('✖ tours sin tarifas:', slugsSinTarifa.join(', '));
    process.exit(1);
  }

  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('✖ Faltan PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (usa --env-file=.env).');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n${DRY ? '🔎 DRY-RUN (no escribe)' : '⚠️  APLICANDO A LA BD'} — ${toursIn.length} tours\n`);

  let totalTarifas = 0;
  for (const t of toursIn) {
    const programas = tarifasPorSlug.get(t.slug);
    const nFilas = filasTarifa('DRY', programas).length;
    totalTarifas += nFilas;
    console.log(`• ${t.slug.padEnd(24)} ${String(programas.length).padStart(2)} programas → ${String(nFilas).padStart(2)} tarifas`);

    if (DRY) continue;

    // 1) upsert del tour por slug → obtener id
    const { data: tour, error: upErr } = await db
      .from('tours')
      .upsert(filaTour(t), { onConflict: 'slug' })
      .select('id')
      .single();
    if (upErr || !tour) {
      console.error(`  ✖ upsert tour ${t.slug}:`, upErr?.message);
      process.exit(1);
    }
    // 2) reemplaza tarifas (borra + inserta) — idempotente
    const { error: delErr } = await db.from('tarifas').delete().eq('tour_id', tour.id);
    if (delErr) {
      console.error(`  ✖ borrar tarifas ${t.slug}:`, delErr.message);
      process.exit(1);
    }
    const rows = filasTarifa(tour.id, programas);
    const { error: insErr } = await db.from('tarifas').insert(rows);
    if (insErr) {
      console.error(`  ✖ insertar tarifas ${t.slug}:`, insErr.message);
      process.exit(1);
    }
    console.log(`  ✓ tour + ${rows.length} tarifas`);
  }

  console.log(`\n${DRY ? 'Aplicaría' : 'Aplicado'}: ${toursIn.length} tours, ${totalTarifas} tarifas.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
