// Names for people, villages and places, built from short syllables so they
// sound like one invented language and belong to no real culture. All draws
// come from the Rng, so the same seed names the same people.

import type { Rng } from '../rng';

const STARTS = ['b', 'd', 'g', 'k', 'l', 'm', 'n', 'r', 's', 't', 'v', 'z', 'h', 'th', 'sh', 'br'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'ou'];
const ENDS = ['', '', 'n', 'r', 'l', 'm', 'k', 's'];

function syllable(rng: Rng, end: boolean): string {
	return rng.pick(STARTS) + rng.pick(VOWELS) + (end ? rng.pick(ENDS) : '');
}

function capital(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function word(rng: Rng, syllables: number): string {
	let out = '';
	for (let i = 0; i < syllables; i++) out += syllable(rng, i === syllables - 1);
	return capital(out);
}

// two syllables mostly, sometimes one or three
export function personName(rng: Rng): string {
	return word(rng, rng.weighted([1, 2, 3], (n) => (n === 2 ? 6 : 1)) ?? 2);
}

// a name not already used, so followers can tell people apart
export function uniqueName(rng: Rng, taken: Set<string>): string {
	for (let tries = 0; tries < 20; tries++) {
		const name = personName(rng);
		if (!taken.has(name)) return name;
	}
	return personName(rng) + rng.pick(['a', 'o', 'i']);
}

export function villageName(rng: Rng): string {
	return word(rng, 3);
}

const PLACE_KINDS = ['Ford', 'Hill', 'Spring', 'Meadow', 'Bend', 'Grove', 'Stones', 'Shallows'];

// the word a kind of feature takes, so a lake is not called a hill
const FEATURE_KINDS: Record<string, string[]> = {
	ford: ['Ford', 'Bend'],
	lake: ['Shallows', 'Meadow'],
	spring: ['Spring'],
	hill: ['Hill', 'Stones'],
	stones: ['Stones']
};

// a named place: "Kemar Ford"
export function placeName(rng: Rng, feature?: string): string {
	return `${word(rng, 2)} ${rng.pick(FEATURE_KINDS[feature ?? ''] ?? PLACE_KINDS)}`;
}
