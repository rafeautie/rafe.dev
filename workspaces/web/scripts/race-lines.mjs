// Writes the racing line of each /race track (app/lib/race/line.ts works it
// out, which takes a second or so a track) to app/lib/race/lines.json, in
// centimetres across the road at each sample of its centre line, so that
// nobody waits for it to be worked out as a race loads.
// Run again whenever a track, or what the line is worked out for, changes:
//   node scripts/race-lines.mjs
// A test (line.test.ts) fails while what is kept is out of date.
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const OUT = new URL('../app/lib/race/lines.json', import.meta.url);
const load = async (path) =>
	(
		await runnerImport(new URL(path, import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), {
			configFile: false
		})
	).module;

const { racingLine } = await load('../app/lib/race/line.ts');
const { centreOf, MAX_OFFSET, TRACK_IDS } = await load('../app/lib/race/track.ts');

const lines = {};
for (const id of TRACK_IDS) {
	const { x, y, nx, ny, step, bank } = centreOf(id);
	lines[id] = Array.from(racingLine(x, y, nx, ny, step, MAX_OFFSET, bank), (m) =>
		Math.round(m * 100)
	);
}
writeFileSync(OUT, JSON.stringify(lines) + '\n');
