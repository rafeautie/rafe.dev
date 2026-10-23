// Writes app/components/admin/stats/world-map.json, the country outlines the
// /admin/stats map draws: one SVG path per country, keyed by its two-letter
// code (what Cloudflare reports), already projected so the page needs no map
// library. Run again only to change the map's look:
//   node scripts/world-map.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoEqualEarth, geoPath } from 'd3-geo';
import countries from 'i18n-iso-countries';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');

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
	new URL('../app/components/admin/stats/world-map.json', import.meta.url),
	JSON.stringify({ viewBox, paths }) + '\n'
);
process.stdout.write(`${Object.keys(paths).length} countries, ${viewBox}\n`);
