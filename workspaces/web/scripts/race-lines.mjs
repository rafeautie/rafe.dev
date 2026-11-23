// Writes the racing line of each /race track (app/lib/race/line.ts works it
// out, which takes a second or so a track) to app/lib/race/lines/<id>.json, in
// centimetres across the road at each sample of its centre line, so that
// nobody waits for it to be worked out as a race loads.
// Run again whenever a track, or what the line is worked out for, changes:
//   node scripts/race-lines.mjs [id ...]   (every track, or just these)
// A test (line.test.ts) fails while what is kept is out of date.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const OUT = new URL('../app/lib/race/lines/', import.meta.url);
const load = async (path) =>
	(
		await runnerImport(new URL(path, import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
			configFile: false
		})
	).module;

const { racingLine } = await load('../app/lib/race/line.ts');
const { centreOf, MAX_OFFSET, TRACK_IDS } = await load('../app/lib/race/track.ts');

mkdirSync(OUT, { recursive: true });
const asked = process.argv.slice(2);
for (const id of asked.length ? asked : TRACK_IDS) {
	const { x, y, nx, ny, step, bank } = centreOf(id);
	const line = Array.from(racingLine(x, y, nx, ny, step, MAX_OFFSET, bank), (m) =>
		Math.round(m * 100)
	);
	writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(line) + '\n');
}
