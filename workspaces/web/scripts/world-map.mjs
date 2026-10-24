// Writes the outlines the /admin/stats globe draws, as TopoJSON:
//   app/components/admin/stats/globe/world.json, every country, keyed by its
//     two-letter code (what Cloudflare reports)
// Run again only to change the globe's look:
//   node scripts/world-map.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import countries from 'i18n-iso-countries';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');
const OUT = new URL('../app/components/admin/stats/globe/', import.meta.url);

mkdirSync(OUT, { recursive: true });

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
