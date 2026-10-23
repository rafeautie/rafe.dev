// Writes the outlines the /admin/stats map draws, already projected so the
// page needs no map data at run time:
//   app/components/admin/stats/world-map.json, one SVG path per country,
//     keyed by its two-letter code (what Cloudflare reports)
//   app/components/admin/stats/regions/XX.json, a country's states or
//     provinces, loaded when the map zooms into it
// Run again only to change the map's look (it downloads about 40MB):
//   node scripts/world-map.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoEqualEarth, geoPath } from 'd3-geo';
import countries from 'i18n-iso-countries';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, sphericalTriangleArea } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');
// Natural Earth's states and provinces, at a fixed release
const REGIONS_URL =
	'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';
const OUT = new URL('../app/components/admin/stats/', import.meta.url);

const WIDTH = 1000;
// Antarctica takes a fifth of the map and has no visitors
const shapes = feature(world, world.objects.countries).features.filter(
	(shape) => shape.properties.name !== 'Antarctica'
);
const collection = { type: 'FeatureCollection', features: shapes };
const projection = geoEqualEarth().fitWidth(WIDTH, collection);
const path = geoPath(projection).digits(1);
const [[, top], [, bottom]] = path.bounds(collection);

// a few places without an ISO number in the atlas
const BY_NAME = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };
const paths = {};
for (const shape of shapes) {
	const code = shape.id ? countries.numericToAlpha2(shape.id) : BY_NAME[shape.properties.name];
	if (!code) {
		console.warn(`No code for ${shape.properties.name}`);
		continue;
	}
	// a country drawn in pieces (N. Cyprus with Cyprus) shares one shape
	paths[code] = (paths[code] ?? '') + path(shape);
}

const viewBox = `0 ${Math.floor(top)} ${WIDTH} ${Math.ceil(bottom - Math.floor(top))}`;
writeFileSync(
	new URL('world-map.json', OUT),
	JSON.stringify({
		viewBox,
		// for placing cities on the same map (d3-geo's geoEqualEarth)
		projection: { scale: projection.scale(), translate: projection.translate() },
		paths
	}) + '\n'
);
process.stdout.write(`${Object.keys(paths).length} countries, ${viewBox}\n`);

// What a country zooms to: its biggest piece and the pieces near it, so
// France is not stretched to its islands in South America. Squared off
// enough that a long, thin country still fills the map.
function frame(features) {
	const pieces = features
		.flatMap((shape) =>
			shape.geometry.type === 'Polygon'
				? [shape.geometry.coordinates]
				: shape.geometry.type === 'MultiPolygon'
					? shape.geometry.coordinates
					: []
		)
		.map((coordinates) => path.bounds({ type: 'Polygon', coordinates }))
		.map(([[x0, y0], [x1, y1]]) => ({ x0, y0, x1, y1, size: (x1 - x0) * (y1 - y0) }))
		.sort((a, b) => b.size - a.size);
	const box = { ...pieces[0] };
	let grew = true;
	while (grew) {
		grew = false;
		const reach = 0.35 * Math.max(box.x1 - box.x0, box.y1 - box.y0);
		for (const piece of pieces) {
			const gap = Math.max(
				box.x0 - piece.x1,
				piece.x0 - box.x1,
				box.y0 - piece.y1,
				piece.y0 - box.y1
			);
			const inside =
				piece.x0 >= box.x0 && piece.x1 <= box.x1 && piece.y0 >= box.y0 && piece.y1 <= box.y1;
			if (!inside && gap < reach) {
				box.x0 = Math.min(box.x0, piece.x0);
				box.y0 = Math.min(box.y0, piece.y0);
				box.x1 = Math.max(box.x1, piece.x1);
				box.y1 = Math.max(box.y1, piece.y1);
				grew = true;
			}
		}
	}
	let width = (box.x1 - box.x0) * 1.08;
	let height = (box.y1 - box.y0) * 1.08;
	// no taller than wide, and no wider than the world map
	width = Math.max(width, height);
	height = Math.max(height, width / 2.4);
	const x = (box.x0 + box.x1) / 2 - width / 2;
	const y = (box.y0 + box.y1) / 2 - height / 2;
	return [x, y, width, height].map((n) => Math.round(n * 100) / 100);
}

// Simplifying can turn a small piece inside out, which d3 then draws as the
// whole globe minus that piece; such pieces are turned back.
function wound(shape) {
	const { geometry } = shape;
	if (!geometry) return shape;
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

const dir = new URL('regions/', OUT);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
let bytes = 0;
for (const [code, features] of byCountry) {
	const regions = { type: 'FeatureCollection', features };
	// detail in proportion to the country, so a small one keeps its shape
	let shared = presimplify(topology({ regions }, 1e6), sphericalTriangleArea);
	shared = simplify(shared, geoArea(regions) * 1.5e-5);
	const simple = feature(shared, shared.objects.regions).features.map(wound);
	const box = frame(features);
	const digits = Math.max(1, Math.min(3, Math.ceil(-Math.log10(box[2] / 3000))));
	const draw = geoPath(projection).digits(digits);
	const file = JSON.stringify({
		box,
		// each matched to Cloudflare's region code or name
		regions: simple
			.map((shape) => {
				const p = shape.properties;
				return {
					d: draw(shape),
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
				};
			})
			.filter((region) => region.d)
	});
	writeFileSync(new URL(`${code}.json`, dir), file + '\n');
	bytes += file.length;
}
process.stdout.write(`${byCountry.size} countries' regions, ${Math.round(bytes / 1024)}KB\n`);
