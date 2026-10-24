import { describe, expect, it } from 'vitest';
import { HostGame, TICK } from './host';
import { Blocking, WINDOW_BOARDS, buildMap, cellIndex, cellOf } from './map';
import type { HostMessage, PlayerMessage, Snapshot } from './protocol';
import { CROUCH, POSE_ADS, POSE_AWAY, POSE_PAUSED, POSE_SPRINT, STAND } from './protocol';
import {
	BOX,
	BREAK,
	JUGG_HEALTH,
	PERKS,
	POINTS,
	POWERUP,
	START_POINTS,
	WINDOW,
	ZOMBIE,
	zombieCount
} from './rules';
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

	it('pays for every hit, kills included, and ends the round when all are dead', () => {
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
				reviving: null,
				paused: false,
				stance: 0,
				flags: 0,
				loadout: [['m1911', 8, 32]]
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
		expect(snap().players[0].points).toBe(START_POINTS + kills * (POINTS.hit + POINTS.headshot));
		expect(sent.filter((s) => s.m.t === 'died')).toHaveLength(kills);
		// and keeps count for the stats screens
		const stats = game.stats();
		expect(stats.players[0]).toMatchObject({
			kills,
			headshots: kills,
			earned: kills * (POINTS.hit + POINTS.headshot),
			spent: 0,
			downs: 0
		});
		expect(stats.rounds).toHaveLength(1);
		expect(stats.rounds[0]).toMatchObject({
			kills: [kills],
			earned: [kills * (POINTS.hit + POINTS.headshot)]
		});
		expect(stats.rounds[0].time).toBeGreaterThan(0);
		game.handle('p0', { t: 'stats' });
		expect(sent.at(-1)?.m).toMatchObject({ t: 'stats', stats });
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
		const { game, run, snap, sent } = setup(2);
		game.start();
		for (let i = 0; i < 400 && snap().phase !== 'over'; i++) run(0.5);
		expect(snap().phase).toBe('over');
		// with the whole game's numbers for the game over screen
		const over = sent.find((s) => s.m.t === 'over')?.m;
		if (over?.t !== 'over') throw new Error('no game over message');
		expect(over.stats.players).toHaveLength(2);
		for (const p of over.stats.players) expect(p.downs).toBeGreaterThan(0);
		expect(over.stats.rounds.length).toBeGreaterThan(0);
	});

	it('stands still while every player is paused, and carries on when one comes back', () => {
		const { game, run, snap } = setup(2);
		const me = (id: string, paused: boolean) =>
			game.handle(id, {
				t: 'me',
				x: 37,
				y: 0,
				z: 37,
				yaw: 0,
				pitch: 0,
				weapon: 'm1911',
				shots: 0,
				knifes: 0,
				reviving: null,
				paused,
				stance: 0,
				flags: 0,
				loadout: [['m1911', 8, 32]]
			});
		game.start();
		const timer = snap().timer;
		me('p0', true);
		run(3);
		// one player still in, so the break counts down
		expect(snap()).toMatchObject({ held: false });
		expect(snap().timer).toBeLessThan(timer);
		me('p1', true);
		const before = snap();
		run(30);
		expect(snap()).toMatchObject({ held: true, phase: 'break', timer: before.timer });
		me('p1', false);
		run(BREAK.first);
		expect(snap()).toMatchObject({ held: false, phase: 'playing', round: 1 });
	});

	it('passes on how each player is standing and moving, so others can draw it', () => {
		const { game, run, snap } = setup(2);
		const me = (id: string, paused: boolean, stance: number, flags: number) =>
			game.handle(id, {
				t: 'me',
				x: 37,
				y: 0,
				z: 37,
				yaw: 0,
				pitch: 0,
				weapon: 'm1911',
				shots: 0,
				knifes: 0,
				reviving: null,
				paused,
				stance,
				flags,
				loadout: [['m1911', 8, 32]]
			} as PlayerMessage);
		game.start();
		me('p0', true, CROUCH, POSE_ADS | POSE_SPRINT | 64);
		// nonsense from a player is cleaned up rather than passed on
		me('p1', false, 7, POSE_PAUSED);
		run(0.1);
		expect(snap().players[0]).toMatchObject({
			stance: CROUCH,
			flags: POSE_ADS | POSE_SPRINT | POSE_PAUSED
		});
		expect(snap().players[1]).toMatchObject({ stance: STAND, flags: 0 });
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
			reviving: 'p1',
			paused: false,
			stance: 0,
			flags: 0,
			loadout: [['m1911', 8, 32]]
		});
		run(1);
		expect(snap().players[1].revive).toBeGreaterThan(0);
		run(2.2);
		expect(snap().players[1].state).toBe('alive');
	});

	it('ignores a malformed hit rather than half killing a zombie', () => {
		const { game, run, snap } = setup();
		game.start();
		run(BREAK.first + 3);
		const [id] = snap().zombies[0];
		const bad = { t: 'hit', zombie: id, damage: 1e9, head: false, knife: false, force: 3 };
		game.handle('p0', bad as unknown as PlayerMessage);
		expect(snap().zombies.some(([z]) => z === id)).toBe(true);
		expect(snap().players[0].points).toBe(START_POINTS);
	});

	it('does not reset a player who says hello twice', () => {
		const { game, snap } = setup();
		game.start();
		const p = game as unknown as { players: Map<string, { points: number }> };
		p.players.get('p0')!.points = 42;
		expect(game.addPlayer('p0', 'again')).toBe(true);
		expect(snap().players).toHaveLength(1);
		expect(snap().players[0].points).toBe(42);
	});

	// what a test reaches into the host for
	type Inside = {
		players: Map<
			string,
			{ x: number; z: number; points: number; perks: number; hp: number; state: string }
		>;
		zombies: Map<number, { x: number; z: number; window: unknown; hp: number }>;
		windows: number[];
		drops: { id: number; kind: string; x: number; z: number; left: number }[];
		addZombie(x: number, z: number, window: unknown): void;
		down(p: unknown): void;
	};

	it('sends zombies in through a window, a board at a time', () => {
		const { game, run } = setup();
		const g = game as unknown as Inside;
		game.start();
		run(BREAK.first + 0.1);
		g.zombies.clear();
		const w = game.map.windows[0];
		g.addZombie(w.x - w.nx * 2.6, w.z - w.nz * 2.6, w);
		run(ZOMBIE.rise + 1.2 / ZOMBIE.speeds[0] + WINDOW.tearTime + 0.3);
		expect(g.windows[0]).toBeLessThan(WINDOW_BOARDS);
		run(WINDOW.tearTime * WINDOW_BOARDS + WINDOW.climbTime + 0.5);
		expect(g.windows[0]).toBe(0);
		const z = [...g.zombies.values()][0];
		expect(z.window).toBeNull();
		// it ends up on the inside of the wall
		const into = (z.x - w.x) * w.nx + (z.z - w.z) * w.nz;
		expect(into).toBeGreaterThan(1);
	});

	it('pays for nailing boards back, one at a time', () => {
		const { game, run } = setup();
		const g = game as unknown as Inside;
		game.start();
		run(BREAK.first + 0.1);
		const w = game.map.windows[0];
		g.windows[0] = 2;
		Object.assign(g.players.get('p0')!, { x: w.x + w.nx * 1.3, z: w.z + w.nz * 1.3 });
		const before = g.players.get('p0')!.points;
		game.handle('p0', { t: 'repair', window: 0 });
		game.handle('p0', { t: 'repair', window: 0 });
		expect(g.windows[0]).toBe(3);
		run(WINDOW.repairTime);
		game.handle('p0', { t: 'repair', window: 0 });
		expect(g.windows[0]).toBe(4);
		expect(g.players.get('p0')!.points).toBe(before + WINDOW.repairPoints * 2);
	});

	it('picks up power-ups: Double Points pays double and a Nuke clears the room', () => {
		const { game, run, sent } = setup();
		const g = game as unknown as Inside;
		game.start();
		run(BREAK.first + 3);
		const p = g.players.get('p0')!;
		g.drops.push({ id: 1, kind: 'double', x: p.x, z: p.z, left: 20 });
		run(0.1);
		expect(sent.some((m) => m.m.t === 'powerup' && m.m.kind === 'double')).toBe(true);
		const [id] = [...g.zombies.keys()];
		const points = p.points;
		game.handle('p0', {
			t: 'hit',
			zombie: id,
			damage: 1,
			head: false,
			knife: false,
			dir: [0, 0, 1],
			force: 1
		});
		expect(p.points).toBe(points + POINTS.hit * 2);

		expect(g.zombies.size).toBeGreaterThan(0);
		g.drops.push({ id: 2, kind: 'nuke', x: p.x, z: p.z, left: 20 });
		const before = p.points;
		run(0.1);
		expect(g.zombies.size).toBe(0);
		expect(p.points).toBe(before + POWERUP.nukePoints * 2);
	});

	it('spins the Mystery Box for a gun the player does not have, for them alone', () => {
		const { game, run, sent } = setup(2);
		const g = game as unknown as Inside;
		game.start();
		const box = game.map.machines.find((m) => m.kind === 'box')!;
		const p = g.players.get('p0')!;
		Object.assign(p, { x: box.x + box.nx * 1.2, z: box.z + box.nz * 1.2, points: 2000 });
		game.handle('p0', { t: 'buyBox', have: ['m1911', 'mp5'] });
		expect(p.points).toBe(2000 - BOX.cost);
		expect((game.snapshot() as Snapshot).box).toMatchObject({ state: 'rolling', weapon: null });
		run(BOX.roll + 0.1);
		const offer = (game.snapshot() as Snapshot).box;
		expect(offer.state).toBe('offering');
		expect(['m1911', 'mp5']).not.toContain(offer.weapon);
		game.handle('p1', { t: 'takeBox' });
		expect(sent.some((m) => m.to === 'p1' && m.m.t === 'grant')).toBe(false);
		game.handle('p0', { t: 'takeBox' });
		expect(
			sent.some((m) => m.to === 'p0' && m.m.t === 'grant' && m.m.weapon === offer.weapon)
		).toBe(true);
	});

	it('sells perks at their machines, and takes them away on going down', () => {
		const { game } = setup();
		const g = game as unknown as Inside;
		game.start();
		const jugg = game.map.machines.find((m) => m.kind === 'jugg')!;
		const p = g.players.get('p0')!;
		Object.assign(p, { x: jugg.x + jugg.nx * 1.2, z: jugg.z + jugg.nz * 1.2, points: 5000 });
		game.handle('p0', { t: 'buyPerk', perk: 'jugg' });
		expect(p.perks & PERKS.jugg.bit).toBeTruthy();
		expect(p.hp).toBe(JUGG_HEALTH);
		expect(p.points).toBe(5000 - PERKS.jugg.cost);
		// too far from the Speed Cola machine
		game.handle('p0', { t: 'buyPerk', perk: 'speed' });
		expect(p.perks & PERKS.speed.bit).toBeFalsy();
		g.down(p);
		expect(p.perks).toBe(0);
	});
	it('keeps a dropped player for a while, with their points and guns', () => {
		const { game, run, sent } = setup(2);
		const g = game as unknown as Inside;
		game.start();
		run(BREAK.first + 0.1);
		g.players.get('p1')!.points = 1234;
		game.handle('p1', {
			t: 'me',
			x: g.players.get('p1')!.x,
			y: 0,
			z: g.players.get('p1')!.z,
			yaw: 0,
			pitch: 0,
			weapon: 'mp5',
			shots: 0,
			knifes: 0,
			reviving: null,
			paused: false,
			stance: 0,
			flags: 0,
			loadout: [
				['mp5', 20, 90],
				['m1911', 8, 32]
			]
		});
		game.leave('p1');
		run(5);
		// still in the game, shown as away, and not what zombies chase
		const away = (game.snapshot() as Snapshot).players.find((p) => p.id === 'p1')!;
		expect(away.flags & POSE_AWAY).toBeTruthy();
		expect(away.flags & POSE_PAUSED).toBeFalsy();
		sent.length = 0;
		expect(game.addPlayer('p1', 'back')).toBe(true);
		const welcome = sent.find((m) => m.to === 'p1' && m.m.t === 'welcome')?.m;
		expect(welcome).toMatchObject({
			loadout: [
				['mp5', 20, 90],
				['m1911', 8, 32]
			]
		});
		expect(g.players.get('p1')!.points).toBe(1234);

		// gone for good after long enough away
		game.leave('p1');
		run(61);
		expect((game.snapshot() as Snapshot).players.map((p) => p.id)).toEqual(['p0']);
	});

	it('carries a game on from a save, with the new host in charge', () => {
		const { game, run } = setup(2);
		const g = game as unknown as Inside;
		game.start();
		run(BREAK.first + 3);
		g.players.get('p0')!.points = 777;
		g.players.get('p1')!.points = 888;
		const save = JSON.parse(JSON.stringify(game.save('p0')));
		const sent: { to: string; m: HostMessage }[] = [];
		const next = HostGame.restore((to, m) => sent.push({ to, m }), save, 'p1');
		const before = game.snapshot() as Snapshot;
		const after = next.snapshot() as Snapshot;
		expect(after).toMatchObject({ round: before.round, left: before.left, phase: before.phase });
		expect(after.zombies.map((z) => z[0])).toEqual(before.zombies.map((z) => z[0]));
		// the new host first, the old one away until they come back
		expect(after.players.map((p) => [p.id, p.points])).toEqual([
			['p1', 888],
			['p0', 777]
		]);
		expect(after.players[1].flags & POSE_AWAY).toBeTruthy();
		// and it keeps running
		for (let t = 0; t < 2; t += TICK) next.tick();
		expect((next.snapshot() as Snapshot).phase).toBe('playing');
	});
});
