-- =====================================================================
-- Tekila Tours — Datos semilla (Step 4)
-- Los 10 tours de la landing con tarifas PLACEHOLDER (se reemplazan por
-- las listas reales de `fuentes/` en el Step 10). Re-ejecutable.
-- =====================================================================

-- ---- Tours ----
insert into tours (slug, nombre_es, nombre_en, categoria_es, categoria_en,
                   operador, grupo_xcaret, incluye_transporte, impuesto_online,
                   desc_corta_es, desc_corta_en, activo, orden)
values
  ('isla-mujeres', 'Isla Mujeres Pleasure', 'Isla Mujeres Pleasure', 'Mar y Diversión', 'Sea & Fun',
   'Catamarán La Victoria', false, true, false,
   'Snorkel en arrecife, catamarán, barra libre y club de playa VIP.',
   'Reef snorkeling, catamaran, open bar, and VIP beach club.', true, 1),
  ('chichen-clasico', 'Chichén Itzá Clásico by Xcaret', 'Chichén Itzá Classic by Xcaret', 'Historia', 'History',
   'Grupo Xcaret', true, true, false,
   'Autobús de lujo, guía profesional, cenote y Balancanche.',
   'Luxury bus, professional guide, cenote, and Balancanche.', true, 2),
  ('chichen-maya', 'Chichén Maya VIP', 'Chichén Maya VIP', 'Experiencia VIP', 'VIP Experience',
   'Mayab', false, true, false,
   'Transporte VIP, guía bilingüe, cenote sagrado y Valladolid.',
   'VIP transport, bilingual guide, sacred cenote, and Valladolid.', true, 3),
  ('xplor', 'Xplor Día', 'Xplor Day', 'Aventura Extrema', 'Extreme Adventure',
   'Grupo Xcaret', true, true, false,
   'Tirolesas, vehículos anfibios, balsas y hamacuatzaje.',
   'Zip-lines, amphibious vehicles, rafts, and hammock splash.', true, 4),
  ('xoximilco', 'Xoximilco', 'Xoximilco', 'Cultura y Fiesta', 'Culture & Party',
   'Grupo Xcaret', true, true, false,
   'Trajinera, cena degustación, barra libre y música en vivo.',
   'Trajinera, tasting dinner, open bar, and live music.', true, 5),
  ('xplor-fuego', 'Xplor Fuego', 'Xplor Fuego', 'Aventura Nocturna', 'Night Adventure',
   'Grupo Xcaret', true, true, false,
   'Tirolesas nocturnas, anfibios y nado en río iluminado.',
   'Night zip-lines, amphibious vehicles, and illuminated river swim.', true, 6),
  ('xenses', 'Xenses Xcaret', 'Xenses Xcaret', 'Sensaciones', 'Sensations',
   'Grupo Xcaret', true, true, false,
   'Xensatorium, El Pueblo, vuelo de pájaro, Xpa y Lodorama.',
   'Xensatorium, The Village, bird flight, Xpa, and Lodorama.', true, 7),
  ('xelha', 'Xel-Há', 'Xel-Há', 'Agua y Naturaleza', 'Water & Nature',
   'Grupo Xcaret', true, true, false,
   'Buffet, snorkel, toboganes y acuario natural todo el día.',
   'Buffet, snorkeling, slides, and a natural aquarium all day.', true, 8),
  ('xcaret-basico', 'Xcaret Básico', 'Xcaret Basic', 'Naturaleza', 'Nature',
   'Grupo Xcaret', true, true, false,
   'Ríos subterráneos, playas y show México Espectacular.',
   'Underground rivers, beaches, and México Espectacular show.', true, 9),
  ('xcaret-plus', 'Xcaret Plus', 'Xcaret Plus', 'Experiencia Completa', 'Full Experience',
   'Grupo Xcaret', true, true, false,
   'Buffet premium, Área Plus, +50 atracciones y show nocturno.',
   'Premium buffet, Plus Area, 50+ attractions, and evening show.', true, 10)
on conflict (slug) do nothing;

-- ---- Limpieza de datos semilla dependientes (re-ejecutable) ----
delete from tarifas where tour_id in (select id from tours);
delete from disponibilidad where tour_id in (select id from tours);
delete from temporadas;

-- ---- Tarifas PLACEHOLDER (USD, temporada única) ----
-- ⚠️ Precios de ejemplo. Reemplazar con las listas reales en el Step 10.
-- pp = Precio Público (venta) · pr = Precio Reporte (costo, confidencial).
insert into tarifas (tour_id, audiencia, temporada, moneda,
                     pp_adulto, pp_menor, pr_adulto, pr_menor, notas)
select t.id, a.audiencia, 'unica'::temporada_t, 'USD'::moneda_t,
       v.pp_adulto, v.pp_menor, v.pr_adulto, v.pr_menor,
       'PLACEHOLDER — reemplazar con lista real (Step 10)'
from tours t
join (values
  ('isla-mujeres',    89, 69, 55, 42),
  ('chichen-clasico', 129, 99, 82, 63),
  ('chichen-maya',    99, 79, 60, 48),
  ('xplor',           149, 119, 95, 76),
  ('xoximilco',       119, 95, 75, 60),
  ('xplor-fuego',     139, 111, 89, 71),
  ('xenses',          109, 87, 69, 55),
  ('xelha',           119, 95, 76, 61),
  ('xcaret-basico',   119, 95, 76, 61),
  ('xcaret-plus',     149, 119, 95, 76)
) as v(slug, pp_adulto, pp_menor, pr_adulto, pr_menor) on v.slug = t.slug
cross join (values ('extranjero'::audiencia_t), ('nacional'::audiencia_t)) as a(audiencia);

-- ---- Disponibilidad: próximos 60 días, cupo 40 por salida ----
insert into disponibilidad (tour_id, fecha, cupo_total, cupo_reservado)
select t.id, d::date, 40, 0
from tours t
cross join generate_series(current_date, current_date + interval '59 days', interval '1 day') as g(d)
on conflict (tour_id, fecha) do nothing;

-- ---- Temporadas Xcaret (ejemplo — ajustar en admin) ----
insert into temporadas (tipo, fecha_inicio, fecha_fin, etiqueta) values
  ('alta', '2026-12-15', '2027-01-06', 'Fin de año'),
  ('alta', '2027-03-28', '2027-04-12', 'Semana Santa'),
  ('baja', '2026-09-01', '2026-11-30', 'Temporada baja otoño');

-- ---- Admin: para promover un usuario a admin tras registrarse en /admin:
-- insert into admin_users (id, rol)
-- values ('<auth.users.id del usuario>', 'owner');
