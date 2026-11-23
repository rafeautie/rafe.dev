import { describe, it } from 'vitest';
import { drawConditions, inCondition, ROSTER } from './roster';
import { createRace, drawGrid, random, RULES } from './sim';
import { getTrack, type TrackId } from './track';

// How the racing comes out over many races with the default rules: who wins
// from where on the grid, which cars win, and how often a race is wrecked.
// Too slow to run every time (a few hundred races take most of a minute), so
// it is skipped; drop the `.skip` to print the table, which comes out as the
// test's error since what a test logs is not shown.

const pct = (part: number, of: number) => `${Math.round((100 * part) / of)}%`;

function table(id: TrackId, races: number) {
	const track = getTrack(id);
	const slots = Array.from({ length: 6 }, () => 0);
	const wins = new Map<string, number>();
	let clean = 0;
	let retirements = 0;
	let cautions = 0;
	let seconds = 0;
	let longest = 0;
	for (let i = 0; i < races; i++) {
		const s = 1000 + i * 7919;
		const field = drawGrid(s, ROSTER, 6);
		const conditions = drawConditions(random(s + 1), 6);
		const cars = field.map((entry, k) => inCondition(entry, conditions[k]));
		const race = createRace(s + 2, cars, track, [], RULES);
		let out = 0;
		while (!race.done) {
			race.step();
			for (const event of race.events) {
				if (event.kind === 'retire') out++;
				if (event.kind === 'caution') cautions++;
			}
			race.events.length = 0;
		}
		const winner = race.order()[0];
		slots[race.cars.indexOf(winner)]++;
		wins.set(winner.entry.id, (wins.get(winner.entry.id) ?? 0) + 1);
		if (!out) clean++;
		retirements += out;
		seconds += race.time;
		longest = Math.max(longest, race.time);
	}
	return [
		`${id}, ${races} races`,
		`wins by grid slot ${slots.map((won) => pct(won, races)).join(' ')}`,
		`wins by car ${ROSTER.map(({ id }) => `${id} ${pct(wins.get(id) ?? 0, races)}`).join(' ')}`,
		`clean ${pct(clean, races)}, retirements ${(retirements / races).toFixed(2)} and cautions ${(cautions / races).toFixed(2)} a race`,
		`${(seconds / races).toFixed(0)} s a race on average, ${longest.toFixed(0)} s the longest`
	].join('\n');
}

describe('the balance of the racing', () => {
	it.skip('prints its table', { timeout: 600_000 }, () => {
		throw new Error(`\n${table('oval', 300)}\n\n${table('circuit', 300)}`);
	});
});
