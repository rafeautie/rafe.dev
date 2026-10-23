// Writes the outlines the /admin/stats globe draws, as TopoJSON:
//   app/components/admin/stats/globe/world.json, every country, keyed by its
//     two-letter code (what Cloudflare reports)
//   app/components/admin/stats/globe/regions/XX.json, a country's states or
//     provinces, loaded when the globe zooms in on a country with visitors
// Run again only to change the globe's look (it downloads about 40MB):
//   node scripts/world-map.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea } from 'd3-geo';
import countries from 'i18n-iso-countries';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, sphericalTriangleArea } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');
// Natural Earth's states and provinces, at a fixed release
const REGIONS_URL =
	'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';
const OUT = new URL('../app/components/admin/stats/globe/', import.meta.url);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(new URL('regions/', OUT), { recursive: true });

// a few places without an ISO number in the atlas
const BY_NAME = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };
const shapes = [];
for (const shape of feature(world, world.objects.countries).features) {
	const code = shape.id ? countries.numericToAlpha2(shape.id) : BY_NAME[shape.properties.name];
	if (!code) {
		console.warn(`No code for ${shape.properties.name}`);
		continue;
	}
	// a country drawn in pieces (N. Cyprus with Cyprus) is one code twice
	shapes.push({ type: 'Feature', id: code, properties: {}, geometry: shape.geometry });
}
const worldFile = JSON.stringify(
	topology({ countries: { type: 'FeatureCollection', features: shapes } }, 1e5)
);
writeFileSync(new URL('world.json', OUT), worldFile + '\n');
process.stdout.write(`${shapes.length} countries, ${Math.round(worldFile.length / 1024)}KB\n`);

// Simplifying can turn a small piece inside out, which d3 then draws as the
// whole globe minus that piece; such pieces are turned back.
function wound(shape) {
	const { geometry } = shape;
	const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	const fixed = polygons.map((rings) =>
		geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
			? rings.map((ring) => [...ring].reverse())
			: rings
	);
	return {
		...shape,
		geometry:
			geometry.type === 'Polygon'
				? { type: 'Polygon', coordinates: fixed[0] }
				: { type: 'MultiPolygon', coordinates: fixed }
	};
}

const unique = (values) => [...new Set(values.filter(Boolean))];
const after = (code) => (code ? String(code).split('-').pop() : null);

const response = await fetch(REGIONS_URL);
if (!response.ok) throw new Error(`Natural Earth: ${response.status}`);
const byCountry = new Map();
for (const shape of (await response.json()).features) {
	const code = shape.properties.iso_a2;
	if (!/^[A-Z]{2}$/.test(code) || !shape.geometry) continue;
	byCountry.set(code, [...(byCountry.get(code) ?? []), shape]);
}

let bytes = 0;
for (const [code, features] of byCountry) {
	const regions = { type: 'FeatureCollection', features };
	// detail in proportion to the country, so a small one keeps its shape
	let shared = presimplify(topology({ regions }, 1e6), sphericalTriangleArea);
	shared = simplify(shared, geoArea(regions) * 1.5e-5);
	const simple = feature(shared, shared.objects.regions)
		.features.filter((shape) => shape.geometry)
		.map(wound)
		.map((shape) => {
			const p = shape.properties;
			return {
				...shape,
				// each matched to Cloudflare's region code or name
				properties: {
					name: p.name_en ?? p.name,
					codes: unique([after(p.iso_3166_2)]),
					names: unique(
						[p.name, p.name_en, p.gn_name, p.woe_name, ...String(p.name_alt ?? '').split('|')].map(
							(name) => name?.toLowerCase().trim()
						)
					),
					// the larger region it is part of, which some countries report
					// instead: Île-de-France for its départements, England for its
					// counties. Matched only when nothing else is.
					groups: unique([
						after(p.region_cod),
						p.region?.toLowerCase(),
						p.geonunit === p.admin ? null : p.geonunit?.toLowerCase()
					])
				}
			};
		});
	const file = JSON.stringify(
		topology({ regions: { type: 'FeatureCollection', features: simple } }, 1e4)
	);
	writeFileSync(new URL(`regions/${code}.json`, OUT), file + '\n');
	bytes += file.length;
}
process.stdout.write(`${byCountry.size} countries' regions, ${Math.round(bytes / 1024)}KB\n`);
