import { describe, expect, it } from 'vitest';
import { HostGame, TICK } from './host';
import { Blocking, buildMap, cellIndex, cellOf } from './map';
import type { HostMessage, Snapshot } from './protocol';
import { BREAK, START_POINTS, zombieCount } from './rules';
import { WEAPONS } from './weapons';

function setup(players = 1) {
	const sent: { to: string; m: HostMessage }[] = [];
	let seed = 1;
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const game = new HostGame((to, m) => sent.push({ to, m }), random);
	for (let i = 0; i < players; i++) game.addPlayer(`p${i}`, `player ${i}`);
	const run = (seconds: number) => {
		for (let t = 0; t < seconds; t += TICK) game.tick();
	};
	const snap = () => game.snapshot() as Snapshot;
	return { game, sent, run, snap };
}

describe('map', () => {
	const map = buildMap();

	it('starts players in area 0 and splits the rest by doors', () => {
		for (const s of map.playerSpawns) expect(map.area[cellIndex(cellOf(s.x), cellOf(s.z))]).toBe(0);
		for (const d of map.doors) expect(d.areas[0]).not.toBe(d.areas[1]);
	});

	it('only reaches the rest of the map through doors', () => {
		const blocking = new Blocking(map);
		const start = map.playerSpawns[0];
		const field = blocking.flowField([cellIndex(cellOf(start.x), cellOf(start.z))]);
		const reachable = (x: number, z: number) =>
			Number.isFinite(field[cellIndex(cellOf(x), cellOf(z))]);
		const far = map.spawns.filter((s) => s.area !== 0);
		expect(far.length).toBeGreaterThan(0);
		for (const s of far) expect(reachable(s.x, s.z)).toBe(false);

		blocking.open.fill(true);
		const open = blocking.flowField([cellIndex(cellOf(start.x), cellOf(start.z))]);
		for (const s of map.spawns)
			expect(Number.isFinite(open[cellIndex(cellOf(s.x), cellOf(s.z))])).toBe(true);
	});

	it('keeps a moving circle out of walls', () => {
		const blocking = new Blocking(map);
		const s = map.playerSpawns[0];
		const [x] = blocking.move(s.x, s.z, -40, 0, 0.35);
		// stopped by the spawn room's west wall, not through it
		expect(x).toBeGreaterThan(26);
	});
});

describe('host game', () => {
	it('runs a round of zombies after the first break', () => {
		const { game, run, snap } = setup();
		game.start();
		expect(snap().phase).toBe('break');
		run(BREAK.first + 0.1);
		expect(snap()).toMatchObject({ phase: 'playing', round: 1, left: zombieCount(1, 1) });
		run(4);
		expect(snap().zombies.length).toBeGreaterThan(0);
	});

	it('pays for hits and kills, and ends the round when all are dead', () => {
		const { game, run, snap, sent } = setup();
		game.start();
		run(BREAK.first + 0.1);
		let kills = 0;
		for (let i = 0; i < 400 && snap().phase === 'playing'; i++) {
			// keep the player out of reach
			game.handle('p0', {
				t: 'me',
				x: 37,
				y: 0,
				z: 37,
				yaw: 0,
				pitch: 0,
				weapon: 'm1911',
				shots: 0,
				knifes: 0,
				reviving: null
			});
			for (const [id] of snap().zombies) {
				game.handle('p0', {
					t: 'hit',
					zombie: id,
					damage: 50,
					head: false,
					knife: false,
					dir: [0, 0, 1],
					force: 3
				});
				game.handle('p0', {
					t: 'hit',
					zombie: id,
					damage: 500,
					head: true,
					knife: false,
					dir: [0, 0, 1],
					force: 3
				});
				kills++;
			}
			run(0.5);
		}
		expect(kills).toBe(zombieCount(1, 1));
		expect(snap().phase).toBe('break');
		expect(snap().players[0].points).toBe(START_POINTS + kills * (10 + 100));
		expect(sent.filter((s) => s.m.t === 'died')).toHaveLength(kills);
	});

	it('sells doors and guns only to players who can pay', () => {
		const { game, sent } = setup();
		game.start();
		game.handle('p0', { t: 'buyDoor', door: 0 }); // 750
		expect(sent.at(-1)?.m.t).toBe('denied');
		expect(game.blocking.open[0]).toBe(false);
		const wall = game.map.wallBuys.findIndex((w) => WEAPONS[w.weapon].cost === 500);
		game.handle('p0', { t: 'buyWeapon', wall, owned: false });
		expect(sent.at(-1)?.m).toMatchObject({ t: 'grant', ammo: false });
		game.handle('p0', { t: 'buyWeapon', wall, owned: false });
		expect(sent.at(-1)?.m.t).toBe('denied');
		const p = game as unknown as { players: Map<string, { points: number }> };
		p.players.get('p0')!.points = 750;
		game.handle('p0', { t: 'buyDoor', door: 0 });
		expect(game.blocking.open[0]).toBe(true);
	});

	it('downs a player who is caught, and gets a solo player back up', () => {
		const { game, run, snap } = setup();
		game.start();
		// stand still until something gets there
		for (let i = 0; i < 120 && snap().players[0].state === 'alive'; i++) run(0.5);
		const downed = snap().players[0];
		expect(downed.state).toBe('downed');
		expect(downed.points).toBe(START_POINTS - 50);
		run(11);
		expect(snap().players[0].state).not.toBe('dead');
	});

	it('ends the game when every player is down', () => {
		const { game, run, snap } = setup(2);
		game.start();
		for (let i = 0; i < 400 && snap().phase !== 'over'; i++) run(0.5);
		expect(snap().phase).toBe('over');
	});

	it('revives a downed teammate who is held long enough', () => {
		const { game, run, snap } = setup(2);
		game.start();
		const p = game as unknown as {
			players: Map<string, { state: string; bleed: number; hp: number }>;
		};
		Object.assign(p.players.get('p1')!, { state: 'downed', bleed: 30, hp: 0 });
		game.handle('p0', {
			t: 'me',
			x: 35.5,
			y: 0,
			z: 37,
			yaw: 0,
			pitch: 0,
			weapon: 'm1911',
			shots: 0,
			knifes: 0,
			reviving: 'p1'
		});
		run(1);
		expect(snap().players[1].revive).toBeGreaterThan(0);
		run(2.2);
		expect(snap().players[1].state).toBe('alive');
	});
});
