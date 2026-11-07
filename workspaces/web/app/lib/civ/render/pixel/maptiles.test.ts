import { describe, expect, it } from 'vitest';
import { Biome, Built, Deposit, Water, type MapLayers } from '../../types';
import {
	BUILT_ICON,
	DEPOSIT_ICON,
	E,
	N,
	NE,
	NW,
	S,
	SE,
	SW,
	SEASON_RECOLOR,
	W,
	allTileSprites,
	newPick,
	normalizeShore,
	pickTile,
	downstreamOf,
	riverCode,
	riverLinks,
	riverTile,
	shoreQuarter,
	shoreTile
} from './maptiles';
import { generateWorld } from '../../world/generate';
import { pixels } from './sprite';

const SIZE = 6;

function fake() {
	const n = SIZE * SIZE;
	const layers: MapLayers = {
		size: SIZE,
		height: new Float32Array(n).fill(0.5),
		moisture: new Float32Array(n).fill(0.5),
		ground: new Uint8Array(n),
		water: new Uint8Array(n),
		biome: new Uint8Array(n).fill(Biome.grassland),
		deposit: new Uint8Array(n)
	};
	const living = {
		plants: new Float32Array(n).fill(1),
		wood: new Float32Array(n),
		built: new Uint8Array(n)
	};
	return { layers, living };
}

describe('tile sprites', () => {
	it('are all 16 x 16 and only use keyed letters', () => {
		for (const def of allTileSprites()) {
			expect(def.rows.length).toBe(16);
			for (const row of def.rows) expect(row.length).toBe(16);
			expect(() => pixels(def)).not.toThrow();
		}
	});

	it('keeps icons rectangular and keyed, under every season', () => {
		const icons = [...Object.values(BUILT_ICON), ...Object.values(DEPOSIT_ICON)];
		expect(icons.length).toBe(8 + 9);
		for (const def of icons) {
			expect(def).toBeTruthy();
			for (const row of def!.rows) expect(row.length).toBe(def!.rows[0].length);
			for (const recolor of SEASON_RECOLOR) expect(() => pixels(def!, recolor)).not.toThrow();
		}
	});
});

describe('shore autotiling', () => {
	it('picks a piece for each quarter from the neighbours', () => {
		expect(shoreQuarter(0, 0)).toBe('none');
		expect([0, 1, 2, 3].map((q) => shoreQuarter(N, q))).toEqual(['edgeV', 'edgeV', 'none', 'none']);
		expect([0, 1, 2, 3].map((q) => shoreQuarter(N | W, q))).toEqual([
			'corner',
			'edgeV',
			'edgeH',
			'none'
		]);
		expect(shoreQuarter(NE, 1)).toBe('notch');
		expect(shoreQuarter(E, 1)).toBe('edgeH');
	});

	it('drops corners that sit next to land', () => {
		expect(normalizeShore(N | NE)).toBe(N);
		expect(normalizeShore(NW | S)).toBe(NW | S);
	});

	it('has no overlay for open water, and a 16 x 16 one otherwise', () => {
		expect(shoreTile(0)).toBeNull();
		expect(shoreTile(N | E)?.rows[0]).toBe('SSSSSSSSSSSSSSSS');
		expect(shoreTile(S)?.rows[15]).toBe('SSSSSSSSSSSSSSSS');
		expect(
			shoreTile(W)
				?.rows.map((r) => r[0])
				.join('')
		).toBe('SSSSSSSSSSSSSSSS');
	});

	it('finds the land neighbours of a lake tile', () => {
		const { layers, living } = fake();
		const mid = 2 * SIZE + 2;
		layers.water[mid] = Water.lake;
		const pick = newPick();
		pickTile(layers, living, 2, 2, pick);
		expect(pick.over).toBe(shoreTile(N | E | S | W | NE | SE | SW | NW));
		// open water in the middle of a lake has no shore
		for (let i = 0; i < layers.water.length; i++) layers.water[i] = Water.lake;
		pickTile(layers, living, 2, 2, pick);
		expect(pick.over).toBeNull();
	});
});

describe('rivers', () => {
	it('links each river tile to where it flows and to what flows into it', () => {
		const { layers } = fake();
		const at = (x: number, y: number) => y * SIZE + x;
		layers.water[at(2, 2)] = Water.river;
		layers.water[at(1, 2)] = Water.river;
		layers.water[at(3, 2)] = Water.sea;
		layers.biome[at(3, 2)] = Biome.ocean;
		layers.height[at(1, 2)] = 0.6;
		layers.height[at(2, 2)] = 0.5;
		layers.height[at(3, 2)] = 0.3;
		const code = riverCode(layers, 2, 2);
		expect(code & 255).toBe(E | W);
		// only the sea side opens out
		expect(code >> 8).toBe(E);
		expect(riverCode(layers, 1, 2) & 255).toBe(E);
		expect(riverCode(layers, 5, 5)).toBe(0);
	});

	it('draws water out to exactly the sides it connects to', () => {
		const wetEdge = (code: number, side: 'n' | 'e' | 's' | 'w') => {
			const rows = riverTile(code).rows;
			const line =
				side === 'n'
					? rows[0]
					: side === 's'
						? rows[15]
						: [...rows].map((r) => r[side === 'w' ? 0 : 15]).join('');
			return /[aef]/.test(line);
		};
		const straight = N | S;
		expect([wetEdge(straight, 'n'), wetEdge(straight, 's')]).toEqual([true, true]);
		expect([wetEdge(straight, 'e'), wetEdge(straight, 'w')]).toEqual([false, false]);
		const bend = E | S;
		expect([wetEdge(bend, 'n'), wetEdge(bend, 'w')]).toEqual([false, false]);
		expect([wetEdge(bend, 'e'), wetEdge(bend, 's')]).toEqual([true, true]);
		expect(riverTile(0).rows.join('')).toContain('a');
	});
});

describe('tile choice', () => {
	it('is the same every time for the same tile', () => {
		const { layers, living } = fake();
		living.wood.fill(0.8);
		layers.deposit[8] = Deposit.copper;
		living.built[9] = Built.hut;
		for (const [x, y] of [
			[1, 1],
			[2, 1],
			[3, 3]
		]) {
			const a = newPick();
			const b = newPick();
			pickTile(layers, living, x, y, a);
			pickTile(layers, living, x, y, b);
			expect(a).toEqual(b);
		}
	});

	it('shows icons for deposits and buildings on land', () => {
		const { layers, living } = fake();
		layers.deposit[8] = Deposit.flint;
		living.built[8] = Built.kiln;
		const pick = newPick();
		pickTile(layers, living, 2, 1, pick);
		expect(pick.deposit).toBe(DEPOSIT_ICON[Deposit.flint]);
		expect(pick.built).toBe(BUILT_ICON[Built.kiln]);
	});

	it('grows denser forest where there is more wood', () => {
		const { layers, living } = fake();
		layers.biome.fill(Biome.forest);
		const count = (wood: number) => {
			living.wood.fill(wood);
			const pick = newPick();
			pickTile(layers, living, 3, 3, pick);
			return pick.base.rows.join('').match(/[tuPpQ]/g)?.length ?? 0;
		};
		expect(count(0.8)).toBeGreaterThan(count(0.3));
		expect(count(0.3)).toBeGreaterThan(count(0.05));
	});
});

describe('generated rivers', () => {
	it('flow as one tree-shaped channel from the sources down to the water', () => {
		const map = generateWorld(42, 96);
		const size = map.size;
		const links = riverLinks(map);
		const isRiver = (i: number) => map.water[i] === Water.river || map.water[i] === Water.spring;
		const wet = (ch: string) => 'aef'.includes(ch);
		const DIRS: [number, number, number, number][] = [
			[0, -1, N, S],
			[1, 0, E, W],
			[0, 1, S, N],
			[-1, 0, W, E],
			[1, -1, NE, SW],
			[1, 1, SE, NW],
			[-1, 1, SW, NE],
			[-1, -1, NW, SE]
		];
		let rivers = 0;
		for (let i = 0; i < size * size; i++) {
			if (!isRiver(i)) continue;
			rivers++;
			const x = i % size;
			const y = (i - x) / size;
			const rows = riverTile(links[i]).rows;
			// what should be linked: where it flows, and every river flowing into it
			let expected = 0;
			const down = downstreamOf(map, i);
			for (const [dx, dy, bit, back] of DIRS) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
				const j = ny * size + nx;
				const flowsHere = isRiver(j) && downstreamOf(map, j) === i;
				if (j === down || flowsHere) {
					expected |= bit;
					// the other end draws an arm back
					if (isRiver(j)) expect(links[j] & back).toBe(back);
					// and the drawn channel reaches that side
					const px = dx === 0 ? 7 : dx > 0 ? 15 : 0;
					const py = dy === 0 ? 7 : dy > 0 ? 15 : 0;
					expect(wet(rows[py][px])).toBe(true);
				}
			}
			expect(links[i] & 255).toBe(expected);
		}
		expect(rivers).toBeGreaterThan(20);

		// following the flow never loops and ends in a lake, the sea, the map edge or
		// (rarely) a pit in the bed where the generator left no lower neighbour
		let pits = 0;
		for (let i = 0; i < size * size; i++) {
			if (!isRiver(i)) continue;
			let at = i;
			for (let step = 0; ; step++) {
				expect(step).toBeLessThan(size * size);
				const next = downstreamOf(map, at);
				if (next < 0) {
					const x = at % size;
					const y = (at - x) / size;
					if (x > 0 && y > 0 && x < size - 1 && y < size - 1) pits++;
					break;
				}
				if (!isRiver(next)) break;
				at = next;
			}
		}
		expect(pits).toBeLessThan(rivers * 0.25 * 6);
	});
});
