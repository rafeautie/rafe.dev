import {
	Blocking,
	CELL,
	WINDOW_BOARDS,
	buildMap,
	cellIndex,
	cellOf,
	type GameMap,
	type Window
} from './map';
import type {
	BoxSnap,
	DropSnap,
	GameStats,
	Loadout,
	HostMessage,
	LifeState,
	Phase,
	PlayerMessage,
	PlayerStats,
	Stance,
	PlayerSnap,
	PowerupKind,
	ZombieSnap
} from './protocol';
import {
	CROUCH,
	POSE_ADS,
	POSE_AIR,
	POSE_AWAY,
	POSE_PAUSED,
	POSE_RELOAD,
	POSE_SPRINT,
	POWERUP_KINDS,
	SLIDE,
	cleanLoadout,
	STAND,
	ZOMBIE_ATTACKING,
	ZOMBIE_CLIMBING,
	ZOMBIE_RISING,
	ZOMBIE_STAGGER,
	ZOMBIE_TEARING
} from './protocol';
import {
	BOX,
	BREAK,
	DOWNED_LOSS,
	JUGG_HEALTH,
	PERKS,
	PLAYER,
	POINTS,
	POWERUP,
	START_POINTS,
	WINDOW,
	ZOMBIE,
	spawnDelay,
	speedClass,
	zombieCount,
	zombieHealth
} from './rules';
import { MAX_PLAYERS } from './signal';
import { BOX_WEAPONS, WEAPONS, ammoCost, type WeaponId } from './weapons';

export const TICK = 1 / 30;
const SNAPSHOT_EVERY = 2; // ticks, so 15 a second
const FLOW_EVERY = 0.25; // seconds
const CHASE_SIGHT = 14; // zombies walk straight at a player they can see this close
// a player whose connection dropped is kept this long for them to come back
const AWAY_LIMIT = 60;
const STRAY_TIME = 15; // a zombie this long with no player near is sent back to spawn
const STRAY_RANGE = 32;
// within this, zombies spread round a player rather than all heading for
// the same spot
const SURROUND_RANGE = 5;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// a window zombie appears this far outside, and stands this far out to tear
// at the boards
const WINDOW_SPAWN = 2.6;
const WINDOW_STAND = 1.45;

type HostPlayer = {
	id: string;
	name: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	hp: number;
	state: LifeState;
	bleed: number;
	revive: number;
	reviving: string | null;
	points: number;
	kills: number;
	weapon: WeaponId;
	shots: number;
	knifes: number;
	lastHurt: number;
	soloRevives: number;
	paused: boolean;
	stance: Stance;
	flags: number;
	perks: number;
	// when this player last nailed a board back, and what boards have paid
	// this round
	repaired: number;
	repairPaid: number;
	stats: Tally;
	// their guns, as they last said, to give back after a dropped connection
	loadout: Loadout | null;
	// lost their connection, and how long ago: zombies leave them be, and
	// they're let go after a while if they don't come back
	away: boolean;
	awayFor: number;
};

// what the game over screen shows, kept as the game goes
type Tally = Omit<PlayerStats, 'id' | 'name'> & {
	// by round, from round 1 at index 0
	roundKills: number[];
	roundEarned: number[];
};

const newTally = (): Tally => ({
	kills: 0,
	headshots: 0,
	earned: 0,
	spent: 0,
	downs: 0,
	revives: 0,
	roundKills: [],
	roundEarned: []
});

type HostZombie = {
	id: number;
	x: number;
	z: number;
	yaw: number;
	hp: number;
	speed: 0 | 1 | 2;
	rise: number;
	windup: number; // counting down to a swing, or 0
	cooldown: number;
	stray: number;
	// knocked back by a hit, slowed until this runs out
	stagger: number;
	// coming in through a window: walking up to it, pulling boards off, then
	// climbing through; null once inside
	window: { index: number; phase: 'approach' | 'tear' | 'climb'; t: number } | null;
	y: number;
};

export type Send = (to: string, message: HostMessage) => void;

export type GameSave = {
	// who was running it
	host: string;
	time: number;
	phase: Phase;
	round: number;
	toSpawn: number;
	spawnTimer: number;
	breakTimer: number;
	nextZombie: number;
	nextDrop: number;
	dropsThisRound: number;
	roundTimes: number[];
	windows: number[];
	drops: DropSnap[];
	instakill: number;
	double: number;
	box: BoxSnap;
	doors: boolean[];
	// in the order they joined
	players: HostPlayer[];
	zombies: HostZombie[];
};

const isWeapon = (id: unknown): id is WeaponId =>
	typeof id === 'string' && Object.hasOwn(WEAPONS, id);

// The game itself, run by the host's browser. Players report where they are
// and what they hit; the host moves the zombies, keeps score, opens doors,
// decides who is downed, and sends everyone what it sees.
export class HostGame {
	readonly map: GameMap;
	readonly blocking: Blocking;
	private players = new Map<string, HostPlayer>();
	private zombies = new Map<number, HostZombie>();
	private phase: Phase = 'lobby';
	private round = 0;
	private toSpawn = 0;
	private spawnTimer = 0;
	private breakTimer = 0;
	private flow: Float64Array | null = null;
	private flowTimer = 0;
	private nextZombie = 1;
	private time = 0;
	private ticks = 0;
	// how long each round took, from round 1 at index 0
	private roundTimes: number[] = [];
	private windows: number[];
	private drops: DropSnap[] = [];
	private nextDrop = 1;
	private dropsThisRound = 0;
	private instakill = 0;
	private double = 0;
	private box: BoxSnap = { state: 'idle', weapon: null, by: null, left: 0 };

	constructor(
		private send: Send,
		private random: () => number = Math.random
	) {
		this.map = buildMap();
		this.blocking = new Blocking(this.map);
		this.windows = this.map.windows.map(() => WINDOW_BOARDS);
	}

	get playerCount() {
		return this.players.size;
	}

	// false if the game is full
	addPlayer(id: string, name: string): boolean {
		const back = this.players.get(id);
		if (back) {
			// the same player again, perhaps after a dropped connection: pick
			// up where they were
			back.away = false;
			back.awayFor = 0;
			this.send(id, {
				t: 'welcome',
				you: id,
				phase: this.phase,
				round: this.round,
				doors: [...this.blocking.open],
				x: back.x,
				z: back.z,
				loadout: back.loadout
			});
			this.sendLobby();
			return true;
		}
		if (this.players.size >= MAX_PLAYERS) return false;
		const spot = this.map.playerSpawns[this.players.size % this.map.playerSpawns.length];
		this.players.set(id, {
			id,
			name: name.trim().slice(0, 16) || 'Player',
			x: spot.x,
			y: 0,
			z: spot.z,
			yaw: 0,
			pitch: 0,
			hp: PLAYER.health,
			state: 'alive',
			bleed: 0,
			revive: 0,
			reviving: null,
			points: START_POINTS,
			kills: 0,
			weapon: 'm1911',
			shots: 0,
			knifes: 0,
			lastHurt: -Infinity,
			soloRevives: PLAYER.soloRevives,
			paused: false,
			stance: STAND,
			flags: 0,
			perks: 0,
			repaired: -Infinity,
			repairPaid: 0,
			stats: newTally(),
			loadout: null,
			away: false,
			awayFor: 0
		});
		this.send(id, {
			t: 'welcome',
			you: id,
			phase: this.phase,
			round: this.round,
			doors: [...this.blocking.open],
			x: spot.x,
			z: spot.z,
			loadout: null
		});
		this.sendLobby();
		return true;
	}

	// A player's connection dropped. In the lobby they're gone; in a game
	// they're kept a while, in case they come back.
	leave(id: string) {
		const p = this.players.get(id);
		if (!p) return;
		if (this.phase === 'lobby' || this.phase === 'over') return this.removePlayer(id);
		p.away = true;
		p.awayFor = 0;
		p.reviving = null;
	}

	removePlayer(id: string) {
		this.players.delete(id);
		this.sendLobby();
		if (this.phase === 'playing' || this.phase === 'break') this.checkOver();
	}

	start() {
		if (this.phase !== 'lobby') return;
		this.broadcast({ t: 'start' });
		this.beginBreak(BREAK.first);
	}

	restart() {
		this.zombies.clear();
		this.blocking.open.fill(false);
		this.flow = null;
		this.round = 0;
		this.roundTimes = [];
		this.toSpawn = 0;
		this.windows = this.map.windows.map(() => WINDOW_BOARDS);
		this.drops = [];
		this.instakill = this.double = 0;
		this.box = { state: 'idle', weapon: null, by: null, left: 0 };
		let i = 0;
		for (const p of this.players.values()) {
			const spot = this.map.playerSpawns[i++ % this.map.playerSpawns.length];
			Object.assign(p, {
				x: spot.x,
				y: 0,
				z: spot.z,
				hp: PLAYER.health,
				state: 'alive',
				bleed: 0,
				revive: 0,
				points: START_POINTS,
				kills: 0,
				weapon: 'm1911',
				soloRevives: PLAYER.soloRevives,
				perks: 0,
				stats: newTally()
			});
		}
		this.broadcast({ t: 'restart' });
		i = 0;
		for (const p of this.players.values()) {
			const spot = this.map.playerSpawns[i++ % this.map.playerSpawns.length];
			this.send(p.id, { t: 'respawn', x: spot.x, z: spot.z });
		}
		this.beginBreak(BREAK.first);
	}

	handle(from: string, message: PlayerMessage) {
		const p = this.players.get(from);
		if (!p) return;
		switch (message.t) {
			case 'me': {
				if (![message.x, message.y, message.z, message.yaw, message.pitch].every(Number.isFinite))
					return;
				// a downed player crawls, and the dead stay put
				if (p.state !== 'dead') {
					p.x = message.x;
					p.y = message.y;
					p.z = message.z;
				}
				p.yaw = message.yaw;
				p.pitch = message.pitch;
				if (Object.hasOwn(WEAPONS, message.weapon)) p.weapon = message.weapon;
				if (Number.isFinite(message.shots)) p.shots = message.shots;
				if (Number.isFinite(message.knifes)) p.knifes = message.knifes;
				p.reviving = typeof message.reviving === 'string' ? message.reviving : null;
				p.paused = message.paused === true;
				p.stance = message.stance === CROUCH || message.stance === SLIDE ? message.stance : STAND;
				p.flags = Number.isInteger(message.flags)
					? message.flags & (POSE_SPRINT | POSE_ADS | POSE_RELOAD | POSE_AIR)
					: 0;
				p.loadout = cleanLoadout(message.loadout, isWeapon) ?? p.loadout;
				break;
			}
			case 'hit':
				this.hit(p, message);
				break;
			case 'buyWeapon': {
				const wall = this.map.wallBuys[message.wall];
				if (!wall || p.state !== 'alive') return;
				const weapon = WEAPONS[wall.weapon];
				const cost = message.owned ? ammoCost(weapon) : weapon.cost;
				if (!this.spend(p, cost)) return;
				this.send(p.id, { t: 'grant', weapon: weapon.id, ammo: message.owned });
				break;
			}
			case 'buyDoor': {
				const door = this.map.doors[message.door];
				if (!door || this.blocking.open[door.index] || p.state !== 'alive') return;
				if (!this.spend(p, door.cost)) return;
				this.blocking.open[door.index] = true;
				this.flow = null;
				this.broadcast({ t: 'door', door: door.index, by: p.id });
				break;
			}
			case 'repair':
				this.repair(p, message.window);
				break;
			case 'buyBox':
				this.buyBox(p, Array.isArray(message.have) ? message.have : []);
				break;
			case 'takeBox':
				if (this.box.state === 'offering' && this.box.by === p.id && this.box.weapon) {
					this.send(p.id, { t: 'grant', weapon: this.box.weapon, ammo: false });
					this.box = { state: 'idle', weapon: null, by: null, left: 0 };
				}
				break;
			case 'buyPerk': {
				const perk = PERKS[message.perk];
				const machine = this.map.machines.find((m) => m.kind === message.perk);
				if (!perk || !machine || p.state !== 'alive' || p.perks & perk.bit) return;
				if (
					Math.hypot(machine.x + machine.nx * 1.2 - p.x, machine.z + machine.nz * 1.2 - p.z) > 2.2
				)
					return;
				if (!this.spend(p, perk.cost)) return;
				p.perks |= perk.bit;
				if (message.perk === 'jugg') p.hp = this.maxHp(p);
				this.send(p.id, { t: 'perk', perk: message.perk });
				break;
			}
			case 'start':
				// only the host's own player may start, which is the first in
				if (this.players.keys().next().value === from) this.start();
				break;
			case 'restart':
				if (this.players.keys().next().value === from && this.phase === 'over') this.restart();
				break;
			case 'stats':
				this.send(p.id, { t: 'stats', stats: this.stats() });
				break;
		}
	}

	private hit(p: HostPlayer, m: Extract<PlayerMessage, { t: 'hit' }>) {
		const z = this.zombies.get(m.zombie);
		// checked in full before anything changes, so a bad message cannot
		// leave a kill half done
		const valid =
			Number.isFinite(m.damage) &&
			m.damage > 0 &&
			Number.isFinite(m.force) &&
			Array.isArray(m.dir) &&
			m.dir.length === 3;
		if (!z || !valid) return;
		// a downed player can still shoot; the dead cannot
		if (p.state === 'dead') return;
		z.hp -= this.instakill > 0 ? z.hp : Math.min(m.damage, 20000);
		// a knife or a heavy gun holds them up longer
		const heavy = m.knife === true || (Number.isFinite(m.force) && m.force >= 9);
		z.stagger = Math.max(z.stagger, heavy ? ZOMBIE.staggerHeavy : ZOMBIE.stagger);
		this.award(p, m.knife === true ? POINTS.knife : m.head === true ? POINTS.headshot : POINTS.hit);
		if (z.hp > 0) return;
		p.kills++;
		p.stats.kills++;
		if (m.head === true) p.stats.headshots++;
		if (this.round > 0) add(p.stats.roundKills, this.round - 1, 1);
		this.zombies.delete(z.id);
		this.maybeDrop(z);
		const dir = m.dir.map((v) => (Number.isFinite(v) ? v : 0)) as [number, number, number];
		this.broadcast({
			t: 'died',
			id: z.id,
			dir,
			force: Math.min(Math.max(m.force, 0), 15),
			head: m.head === true
		});
		this.checkRoundDone();
	}

	private award(p: HostPlayer, amount: number) {
		if (this.double > 0) amount *= 2;
		p.points += amount;
		p.stats.earned += amount;
		if (this.round > 0) add(p.stats.roundEarned, this.round - 1, amount);
		this.send(p.id, { t: 'points', amount });
	}

	tick(dt = TICK) {
		this.time += dt;
		if ((this.phase === 'playing' || this.phase === 'break') && !this.held()) {
			this.updatePlayers(dt);
			this.updateExtras(dt);
			// either can end the game, and nothing more happens after that
			if (!this.ended()) this.updateZombies(dt);
			if (this.ended()) {
				// until a restart
			} else if (this.phase === 'break') {
				this.breakTimer -= dt;
				if (this.breakTimer <= 0) this.beginRound();
			} else {
				this.roundTimes[this.round - 1] += dt;
				this.spawnTimer -= dt;
				if (this.toSpawn > 0 && this.spawnTimer <= 0 && this.zombies.size < ZOMBIE.maxAlive) {
					if (this.spawnZombie()) this.toSpawn--;
					this.spawnTimer = spawnDelay(this.round);
				}
			}
		}
		if (++this.ticks % SNAPSHOT_EVERY === 0) this.broadcast(this.snapshot());
	}

	// With everyone in the pause menu nobody is playing, so nothing moves and
	// no timer runs until someone comes back.
	private held() {
		return this.players.size > 0 && [...this.players.values()].every((p) => p.paused || p.away);
	}

	// a method rather than a comparison inline, since the phase can change
	// partway through a tick
	private ended() {
		return this.phase === 'over';
	}

	private beginBreak(seconds: number) {
		this.phase = 'break';
		this.breakTimer = seconds;
	}

	private beginRound() {
		this.round++;
		this.roundTimes[this.round - 1] = 0;
		this.phase = 'playing';
		this.toSpawn = zombieCount(this.round, this.players.size);
		this.spawnTimer = 1;
		this.dropsThisRound = 0;
		for (const p of this.players.values()) p.repairPaid = 0;
		// the dead come back for the new round
		for (const p of this.players.values()) {
			if (p.state !== 'dead') continue;
			const spot = this.map.playerSpawns[0];
			Object.assign(p, { state: 'alive', hp: PLAYER.health, x: spot.x, z: spot.z, y: 0 });
			this.send(p.id, { t: 'respawn', x: spot.x, z: spot.z });
		}
		this.broadcast({ t: 'round', round: this.round });
	}

	private checkRoundDone() {
		if (this.phase === 'playing' && this.toSpawn === 0 && this.zombies.size === 0) {
			this.beginBreak(BREAK.between);
		}
	}

	private checkOver() {
		if (this.phase === 'over' || this.players.size === 0) return;
		const solo = this.players.size === 1;
		const anyUp = [...this.players.values()].some(
			(p) => p.state === 'alive' || (solo && p.state === 'downed' && p.soloRevives > 0)
		);
		if (anyUp) return;
		this.phase = 'over';
		this.zombies.clear();
		this.broadcast({ t: 'over', round: this.round, stats: this.stats() });
	}

	private updatePlayers(dt: number) {
		for (const p of [...this.players.values()]) {
			if (!p.away) continue;
			p.awayFor += dt;
			if (p.awayFor > AWAY_LIMIT) this.removePlayer(p.id);
		}
		if (this.ended()) return;
		const solo = this.players.size === 1;
		for (const p of this.players.values()) {
			if (p.state === 'alive') {
				const most = this.maxHp(p);
				if (p.hp < most && this.time - p.lastHurt > PLAYER.regenDelay) {
					p.hp = Math.min(most, p.hp + PLAYER.regenRate * dt);
				}
				continue;
			}
			if (p.state !== 'downed') continue;
			const reviver = [...this.players.values()].find(
				(q) =>
					q.state === 'alive' &&
					!q.away &&
					q.reviving === p.id &&
					Math.hypot(q.x - p.x, q.z - p.z) < PLAYER.reviveRange + 0.4
			);
			if (reviver) {
				const quick = reviver.perks & PERKS.revive.bit ? 2 : 1;
				p.revive += (dt * quick) / PLAYER.reviveTime;
				if (p.revive >= 1) {
					this.getUp(p);
					reviver.stats.revives++;
				}
				continue;
			}
			p.revive = 0;
			p.bleed -= dt;
			if (p.bleed > 0) continue;
			if (solo && p.soloRevives > 0) {
				p.soloRevives--;
				this.getUp(p);
			} else {
				p.state = 'dead';
				p.bleed = 0;
				this.checkOver();
			}
		}
	}

	private getUp(p: HostPlayer) {
		p.state = 'alive';
		p.hp = this.maxHp(p);
		p.revive = 0;
		p.bleed = 0;
		p.lastHurt = this.time;
	}

	private down(p: HostPlayer) {
		p.state = 'downed';
		p.stats.downs++;
		p.hp = 0;
		// perks are lost on going down
		p.perks = 0;
		const solo = this.players.size === 1;
		p.bleed = solo ? PLAYER.soloReviveTime : PLAYER.bleedOut;
		p.revive = 0;
		const loss = Math.floor((p.points * DOWNED_LOSS) / 10) * 10;
		p.points -= loss;
		if (loss) this.send(p.id, { t: 'points', amount: -loss });
		this.checkOver();
	}

	private targets(): HostPlayer[] {
		return [...this.players.values()].filter((p) => p.state === 'alive' && !p.away);
	}

	private updateZombies(dt: number) {
		const targets = this.targets();
		this.flowTimer -= dt;
		if (!this.flow || this.flowTimer <= 0) {
			this.flowTimer = FLOW_EVERY;
			const sources = targets.map((p) => cellIndex(cellOf(p.x), cellOf(p.z)));
			this.flow = sources.length ? this.blocking.flowField(sources) : null;
		}
		const zombies = [...this.zombies.values()];
		for (const z of zombies) {
			if (this.ended()) break;
			if (z.rise > 0) {
				z.rise -= dt;
				continue;
			}
			if (z.window) {
				this.comeThrough(z, z.window, dt);
				continue;
			}
			z.cooldown = Math.max(0, z.cooldown - dt);
			z.stagger = Math.max(0, z.stagger - dt);
			let nearest: HostPlayer | null = null;
			let nearestD = Infinity;
			for (const p of targets) {
				const d = Math.hypot(p.x - z.x, p.z - z.z);
				if (d < nearestD) {
					nearestD = d;
					nearest = p;
				}
			}
			z.stray = nearestD > STRAY_RANGE ? z.stray + dt : 0;
			if (z.stray > STRAY_TIME) {
				// lost: take it back and spawn it again somewhere closer
				this.zombies.delete(z.id);
				this.toSpawn++;
				this.broadcast({ t: 'gone', id: z.id });
				continue;
			}
			if (!nearest) continue;

			if (z.windup > 0) {
				z.windup -= dt;
				z.yaw = Math.atan2(-(nearest.x - z.x), -(nearest.z - z.z));
				if (z.windup <= 0) {
					z.cooldown = ZOMBIE.cooldown;
					if (nearestD < ZOMBIE.hitRange) this.hurt(nearest, z);
				}
				continue;
			}
			if (nearestD < ZOMBIE.reach && z.cooldown <= 0) {
				z.windup = ZOMBIE.windup;
				continue;
			}

			// where to walk: straight at a player in sight, otherwise down the
			// flow; close in, each to its own side of the player, so a crowd
			// surrounds them rather than queueing up behind one another
			let tx = nearest.x;
			let tz = nearest.z;
			const inSight =
				nearestD <= CHASE_SIGHT && this.blocking.canSee(z.x, z.z, nearest.x, nearest.z);
			if (!inSight) {
				const next = this.flow && this.blocking.downhill(this.flow, z.x, z.z);
				if (next) [tx, tz] = next;
			} else if (nearestD < SURROUND_RANGE) {
				const angle = z.id * GOLDEN_ANGLE;
				const ox = nearest.x + Math.cos(angle) * ZOMBIE.reach * 0.75;
				const oz = nearest.z + Math.sin(angle) * ZOMBIE.reach * 0.75;
				if (!this.blocking.isSolid(cellOf(ox), cellOf(oz))) {
					// the nearer it gets, the more it goes for its own side
					const pull = 1 - nearestD / SURROUND_RANGE;
					tx = nearest.x + (ox - nearest.x) * pull;
					tz = nearest.z + (oz - nearest.z) * pull;
				}
			}
			let dx = tx - z.x;
			let dz = tz - z.z;
			const len = Math.hypot(dx, dz) || 1;
			dx /= len;
			dz /= len;
			// keep out of each other's way
			for (const o of zombies) {
				if (o === z || o.rise > 0) continue;
				const ox = z.x - o.x;
				const oz = z.z - o.z;
				const d = Math.hypot(ox, oz);
				if (d > 0 && d < ZOMBIE.radius * 2.6) {
					const push = 1.2 * (1 - d / (ZOMBIE.radius * 2.6)) + 0.3;
					dx += (ox / d) * push;
					dz += (oz / d) * push;
				}
			}
			const n = Math.hypot(dx, dz) || 1;
			// stop short of the player rather than walking into them
			const stopAt = Math.max(0, nearestD - ZOMBIE.reach * 0.7);
			const slowed = z.stagger > 0 ? ZOMBIE.staggerSlow : 1;
			const step = Math.min(ZOMBIE.speeds[z.speed] * slowed * dt, stopAt);
			[z.x, z.z] = this.blocking.move(z.x, z.z, (dx / n) * step, (dz / n) * step, ZOMBIE.radius);
			z.yaw = turnToward(z.yaw, Math.atan2(-dx, -dz), dt * 8);
		}
	}

	private hurt(p: HostPlayer, z: HostZombie) {
		// two swings can land on the same tick
		if (p.state !== 'alive') return;
		p.hp -= ZOMBIE.damage;
		p.lastHurt = this.time;
		this.send(p.id, { t: 'hurt', from: [z.x, z.z] });
		if (p.hp <= 0) this.down(p);
	}

	private spawnZombie(): boolean {
		const open = new Set<number>([0]);
		this.map.doors.forEach((d, i) => {
			if (this.blocking.open[i]) d.areas.forEach((a) => open.add(a));
		});
		// most come in through a window, if one into an open room is free
		const busy = new Set<number>();
		for (const z of this.zombies.values()) if (z.window) busy.add(z.window.index);
		const windows = this.map.windows.filter((w) => open.has(w.area) && !busy.has(w.index));
		if (windows.length && this.random() < WINDOW.share) {
			const near = windows
				.map((w) => ({ w, walk: this.walkFrom(w.x + w.nx * CELL, w.z + w.nz * CELL) }))
				.sort((a, b) => a.walk - b.walk);
			const pick = near[Math.floor(this.random() * Math.min(3, near.length))].w;
			this.addZombie(pick.x - pick.nx * WINDOW_SPAWN, pick.z - pick.nz * WINDOW_SPAWN, pick);
			return true;
		}
		const candidates = this.map.spawns.filter((s) => open.has(s.area));
		if (!candidates.length) return false;
		// prefer spawns a short walk from a player, and never on top of one
		const scored = candidates
			.map((s) => {
				const walk = this.flow ? this.flow[cellIndex(cellOf(s.x), cellOf(s.z))] : 0;
				const close = this.targets().some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 4);
				return { s, walk: close ? Infinity : walk };
			})
			.filter((c) => Number.isFinite(c.walk))
			.sort((a, b) => a.walk - b.walk);
		if (!scored.length) return false;
		const pick = scored[Math.floor(this.random() * Math.min(4, scored.length))].s;
		this.addZombie(
			pick.x + (this.random() - 0.5) * 0.6,
			pick.z + (this.random() - 0.5) * 0.6,
			null
		);
		return true;
	}

	private walkFrom(x: number, z: number) {
		return this.flow ? this.flow[cellIndex(cellOf(x), cellOf(z))] : 0;
	}

	private addZombie(x: number, z: number, window: Window | null) {
		const id = this.nextZombie++;
		this.zombies.set(id, {
			id,
			x,
			z,
			// one at a window faces it
			yaw: window ? Math.atan2(-window.nx, -window.nz) : this.random() * Math.PI * 2,
			hp: zombieHealth(this.round),
			speed: speedClass(this.round, this.random()),
			rise: ZOMBIE.rise,
			windup: 0,
			cooldown: 0,
			stray: 0,
			stagger: 0,
			window: window ? { index: window.index, phase: 'approach', t: 0 } : null,
			y: 0
		});
	}

	// A zombie at a window: up to it, a board off at a time, then over the sill.
	private comeThrough(z: HostZombie, at: NonNullable<HostZombie['window']>, dt: number) {
		const w = this.map.windows[at.index];
		const outX = w.x - w.nx * WINDOW_STAND;
		const outZ = w.z - w.nz * WINDOW_STAND;
		z.yaw = Math.atan2(-w.nx, -w.nz);
		if (at.phase === 'approach') {
			const d = Math.hypot(outX - z.x, outZ - z.z);
			const step = Math.min(d, ZOMBIE.speeds[z.speed] * dt);
			if (d > 1e-6) {
				z.x += ((outX - z.x) / d) * step;
				z.z += ((outZ - z.z) / d) * step;
			}
			if (d - step < 0.02) at.phase = 'tear';
		} else if (at.phase === 'tear') {
			if (this.windows[at.index] <= 0) {
				at.phase = 'climb';
				at.t = 0;
				return;
			}
			at.t += dt;
			if (at.t >= WINDOW.tearTime) {
				at.t = 0;
				this.windows[at.index]--;
			}
		} else {
			at.t += dt;
			const t = Math.min(1, at.t / WINDOW.climbTime);
			z.x = outX + w.nx * WINDOW_STAND * 2 * t;
			z.z = outZ + w.nz * WINDOW_STAND * 2 * t;
			z.y = Math.sin(t * Math.PI) * 0.95;
			if (t >= 1) {
				z.window = null;
				z.y = 0;
			}
		}
	}

	private repair(p: HostPlayer, index: number) {
		const w = this.map.windows[index];
		if (!w || p.state !== 'alive' || this.windows[index] >= WINDOW_BOARDS) return;
		if (Math.hypot(w.x + w.nx * 1.3 - p.x, w.z + w.nz * 1.3 - p.z) > 2) return;
		if (this.time - p.repaired < WINDOW.repairTime * 0.85) return;
		// not while one is climbing through it
		for (const z of this.zombies.values())
			if (z.window?.index === index && z.window.phase === 'climb') return;
		this.windows[index]++;
		p.repaired = this.time;
		if (p.repairPaid < WINDOW.repairCap) {
			p.repairPaid += WINDOW.repairPoints;
			this.award(p, WINDOW.repairPoints);
		}
	}

	private buyBox(p: HostPlayer, have: unknown[]) {
		const box = this.map.machines.find((m) => m.kind === 'box');
		if (!box || this.box.state !== 'idle' || p.state !== 'alive') return;
		if (Math.hypot(box.x + box.nx * 1.2 - p.x, box.z + box.nz * 1.2 - p.z) > 2.2) return;
		if (!this.spend(p, BOX.cost)) return;
		const fresh = BOX_WEAPONS.filter((id) => !have.includes(id));
		const pool = fresh.length ? fresh : BOX_WEAPONS;
		this.box = {
			state: 'rolling',
			weapon: pool[Math.floor(this.random() * pool.length)],
			by: p.id,
			left: BOX.roll
		};
	}

	// takes the points if the player has them, or tells them they don't
	private spend(p: HostPlayer, cost: number) {
		if (p.points < cost) {
			this.send(p.id, { t: 'denied' });
			return false;
		}
		p.points -= cost;
		p.stats.spent += cost;
		this.send(p.id, { t: 'points', amount: -cost });
		return true;
	}

	private maxHp(p: HostPlayer) {
		return p.perks & PERKS.jugg.bit ? JUGG_HEALTH : PLAYER.health;
	}

	private maybeDrop(z: HostZombie) {
		if (this.phase !== 'playing' || this.dropsThisRound >= POWERUP.perRound) return;
		if (this.random() >= POWERUP.chance) return;
		const full = this.windows.every((b) => b >= WINDOW_BOARDS);
		const kinds = POWERUP_KINDS.filter((k) => !(k === 'carpenter' && full));
		const kind = kinds[Math.floor(this.random() * kinds.length)];
		this.dropsThisRound++;
		this.drops.push({ id: this.nextDrop++, kind, x: z.x, z: z.z, left: POWERUP.life });
	}

	// Power-ups waiting and running, and the box's spin.
	private updateExtras(dt: number) {
		this.instakill = Math.max(0, this.instakill - dt);
		this.double = Math.max(0, this.double - dt);
		const alive = this.targets();
		this.drops = this.drops.filter((d) => {
			d.left -= dt;
			if (d.left <= 0) return false;
			const by = alive.find((p) => Math.hypot(p.x - d.x, p.z - d.z) < POWERUP.reach);
			if (!by) return true;
			this.pickUp(d.kind, by);
			return false;
		});
		if (this.box.state !== 'idle') {
			this.box.left -= dt;
			if (this.box.left <= 0) {
				this.box =
					this.box.state === 'rolling'
						? { ...this.box, state: 'offering', left: BOX.offer }
						: { state: 'idle', weapon: null, by: null, left: 0 };
			}
		}
	}

	private pickUp(kind: PowerupKind, by: HostPlayer) {
		this.broadcast({ t: 'powerup', kind, by: by.id });
		if (kind === 'instakill') this.instakill = POWERUP.time;
		else if (kind === 'double') this.double = POWERUP.time;
		else if (kind === 'carpenter') {
			this.windows.fill(WINDOW_BOARDS);
			for (const p of this.players.values()) this.award(p, POWERUP.carpenterPoints);
		} else if (kind === 'nuke') {
			for (const z of this.zombies.values())
				this.broadcast({ t: 'died', id: z.id, dir: [0, 1, 0], force: 2, head: false });
			this.zombies.clear();
			for (const p of this.players.values()) this.award(p, POWERUP.nukePoints);
			this.checkRoundDone();
		}
	}

	stats(): GameStats {
		const players = [...this.players.values()];
		return {
			players: players.map((p) => ({
				id: p.id,
				name: p.name,
				kills: p.stats.kills,
				headshots: p.stats.headshots,
				earned: p.stats.earned,
				spent: p.stats.spent,
				downs: p.stats.downs,
				revives: p.stats.revives
			})),
			rounds: this.roundTimes.map((time, i) => ({
				time: Math.round(time),
				kills: players.map((p) => p.stats.roundKills[i] ?? 0),
				earned: players.map((p) => p.stats.roundEarned[i] ?? 0)
			}))
		};
	}

	// Everything needed to carry the game on somewhere else.
	save(host: string): GameSave {
		return {
			host,
			time: this.time,
			phase: this.phase,
			round: this.round,
			toSpawn: this.toSpawn,
			spawnTimer: this.spawnTimer,
			breakTimer: this.breakTimer,
			nextZombie: this.nextZombie,
			nextDrop: this.nextDrop,
			dropsThisRound: this.dropsThisRound,
			roundTimes: [...this.roundTimes],
			windows: [...this.windows],
			drops: this.drops.map((d) => ({ ...d })),
			instakill: this.instakill,
			double: this.double,
			box: { ...this.box },
			doors: [...this.blocking.open],
			// times kept relative to now, and finite, so they survive JSON
			players: [...this.players.values()].map((p) => ({
				...p,
				lastHurt: Math.max(-1000, p.lastHurt - this.time),
				repaired: Math.max(-1000, p.repaired - this.time)
			})),
			zombies: [...this.zombies.values()].map((z) => ({ ...z }))
		};
	}

	// A game carried on from a save, by the player `me`, who leads; everyone
	// else is away until they reconnect.
	static restore(send: Send, save: GameSave, me: string, random?: () => number): HostGame {
		const game = new HostGame(send, random);
		game.time = save.time;
		game.phase = save.phase;
		game.round = save.round;
		game.toSpawn = save.toSpawn;
		game.spawnTimer = save.spawnTimer;
		game.breakTimer = save.breakTimer;
		game.nextZombie = save.nextZombie;
		game.nextDrop = save.nextDrop;
		game.dropsThisRound = save.dropsThisRound;
		game.roundTimes = [...save.roundTimes];
		game.windows = [...save.windows];
		game.drops = save.drops.map((d) => ({ ...d }));
		game.instakill = save.instakill;
		game.double = save.double;
		game.box = { ...save.box };
		save.doors.forEach((open, i) => (game.blocking.open[i] = open));
		const players = [...save.players].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
		for (const p of players) {
			game.players.set(p.id, {
				...p,
				lastHurt: p.lastHurt + save.time,
				repaired: p.repaired + save.time,
				away: p.id !== me,
				awayFor: 0,
				paused: p.id === me ? p.paused : false,
				reviving: null
			});
		}
		for (const z of save.zombies) game.zombies.set(z.id, { ...z });
		return game;
	}

	snapshot(): HostMessage {
		const r2 = (v: number) => Math.round(v * 100) / 100;
		const players: PlayerSnap[] = [...this.players.values()].map((p) => ({
			id: p.id,
			name: p.name,
			x: r2(p.x),
			y: r2(p.y),
			z: r2(p.z),
			yaw: r2(p.yaw),
			pitch: r2(p.pitch),
			hp: Math.round(p.hp),
			state: p.state,
			bleed: Math.ceil(p.bleed),
			revive: r2(p.revive),
			points: p.points,
			kills: p.kills,
			weapon: p.weapon,
			shots: p.shots,
			knifes: p.knifes,
			stance: p.stance,
			flags: p.flags | (p.away ? POSE_AWAY : p.paused ? POSE_PAUSED : 0),
			perks: p.perks
		}));
		const zombies: ZombieSnap[] = [...this.zombies.values()].map((z) => [
			z.id,
			r2(z.x),
			r2(z.z),
			r2(z.yaw),
			z.speed,
			(z.windup > 0 ? ZOMBIE_ATTACKING : 0) |
				(z.rise > 0 ? ZOMBIE_RISING : 0) |
				(z.stagger > 0 ? ZOMBIE_STAGGER : 0) |
				(z.window?.phase === 'tear' ? ZOMBIE_TEARING : 0) |
				(z.window?.phase === 'climb' ? ZOMBIE_CLIMBING : 0),
			Math.max(0, Math.ceil(z.hp)),
			r2(z.y)
		]);
		return {
			t: 'snap',
			time: Math.round(this.time * 1000),
			phase: this.phase,
			round: this.round,
			left: this.toSpawn + this.zombies.size,
			timer: Math.ceil(Math.max(0, this.breakTimer)),
			held: this.held(),
			players,
			zombies,
			windows: [...this.windows],
			drops: this.drops.map((d) => ({ ...d, left: Math.ceil(d.left) })),
			instakill: Math.ceil(this.instakill),
			double: Math.ceil(this.double),
			// what the box will give stays a surprise until it stops
			box: {
				...this.box,
				weapon: this.box.state === 'offering' ? this.box.weapon : null,
				left: r2(this.box.left)
			}
		};
	}

	private sendLobby() {
		this.broadcast({
			t: 'lobby',
			players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name }))
		});
	}

	private broadcast(message: HostMessage) {
		for (const id of this.players.keys()) this.send(id, message);
	}
}

function turnToward(from: number, to: number, max: number): number {
	let d = to - from;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return from + Math.max(-max, Math.min(max, d));
}

function add(list: number[], index: number, amount: number) {
	list[index] = (list[index] ?? 0) + amount;
}
