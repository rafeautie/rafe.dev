import { Blocking, buildMap, cellIndex, cellOf, type GameMap } from './map';
import type {
	HostMessage,
	LifeState,
	Phase,
	PlayerMessage,
	PlayerSnap,
	ZombieSnap
} from './protocol';
import { ZOMBIE_ATTACKING, ZOMBIE_RISING } from './protocol';
import {
	BREAK,
	DOWNED_LOSS,
	PLAYER,
	POINTS,
	START_POINTS,
	ZOMBIE,
	spawnDelay,
	speedClass,
	zombieCount,
	zombieHealth
} from './rules';
import { MAX_PLAYERS } from './signal';
import { WEAPONS, ammoCost, type WeaponId } from './weapons';

export const TICK = 1 / 30;
const SNAPSHOT_EVERY = 2; // ticks, so 15 a second
const FLOW_EVERY = 0.25; // seconds
const CHASE_SIGHT = 14; // zombies walk straight at a player they can see this close
const STRAY_TIME = 15; // a zombie this long with no player near is sent back to spawn
const STRAY_RANGE = 32;

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
};

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
};

export type Send = (to: string, message: HostMessage) => void;

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

	constructor(
		private send: Send,
		private random: () => number = Math.random
	) {
		this.map = buildMap();
		this.blocking = new Blocking(this.map);
	}

	get playerCount() {
		return this.players.size;
	}

	// false if the game is full
	addPlayer(id: string, name: string): boolean {
		// a second hello changes nothing
		if (this.players.has(id)) return true;
		if (this.players.size >= MAX_PLAYERS) return false;
		const spot = this.map.playerSpawns[this.players.size % this.map.playerSpawns.length];
		this.players.set(id, {
			id,
			name: name.trim().slice(0, 16) || 'player',
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
			soloRevives: PLAYER.soloRevives
		});
		this.send(id, {
			t: 'welcome',
			you: id,
			phase: this.phase,
			round: this.round,
			doors: [...this.blocking.open],
			x: spot.x,
			z: spot.z
		});
		this.sendLobby();
		return true;
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
		this.toSpawn = 0;
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
				soloRevives: PLAYER.soloRevives
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
				if (p.points < cost) return this.send(p.id, { t: 'denied' });
				p.points -= cost;
				this.send(p.id, { t: 'points', amount: -cost });
				this.send(p.id, { t: 'grant', weapon: weapon.id, ammo: message.owned });
				break;
			}
			case 'buyDoor': {
				const door = this.map.doors[message.door];
				if (!door || this.blocking.open[door.index] || p.state !== 'alive') return;
				if (p.points < door.cost) return this.send(p.id, { t: 'denied' });
				p.points -= door.cost;
				this.send(p.id, { t: 'points', amount: -door.cost });
				this.blocking.open[door.index] = true;
				this.flow = null;
				this.broadcast({ t: 'door', door: door.index, by: p.id });
				break;
			}
			case 'start':
				// only the host's own player may start, which is the first in
				if (this.players.keys().next().value === from) this.start();
				break;
			case 'restart':
				if (this.players.keys().next().value === from && this.phase === 'over') this.restart();
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
		z.hp -= Math.min(m.damage, 20000);
		if (z.hp > 0) {
			this.award(p, POINTS.hit);
			return;
		}
		this.award(
			p,
			m.knife === true ? POINTS.knife : m.head === true ? POINTS.headshot : POINTS.kill
		);
		p.kills++;
		this.zombies.delete(z.id);
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
		p.points += amount;
		this.send(p.id, { t: 'points', amount });
	}

	tick(dt = TICK) {
		this.time += dt;
		if (this.phase === 'playing' || this.phase === 'break') {
			this.updatePlayers(dt);
			// either can end the game, and nothing more happens after that
			if (!this.ended()) this.updateZombies(dt);
			if (this.ended()) {
				// until a restart
			} else if (this.phase === 'break') {
				this.breakTimer -= dt;
				if (this.breakTimer <= 0) this.beginRound();
			} else {
				this.spawnTimer -= dt;
				if (this.toSpawn > 0 && this.spawnTimer <= 0 && this.zombies.size < ZOMBIE.maxAlive) {
					if (this.spawnZombie()) this.toSpawn--;
					this.spawnTimer = spawnDelay(this.round);
				}
			}
		}
		if (++this.ticks % SNAPSHOT_EVERY === 0) this.broadcast(this.snapshot());
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
		this.phase = 'playing';
		this.toSpawn = zombieCount(this.round, this.players.size);
		this.spawnTimer = 1;
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
		this.broadcast({ t: 'over', round: this.round });
	}

	private updatePlayers(dt: number) {
		const solo = this.players.size === 1;
		for (const p of this.players.values()) {
			if (p.state === 'alive') {
				if (p.hp < PLAYER.health && this.time - p.lastHurt > PLAYER.regenDelay) {
					p.hp = Math.min(PLAYER.health, p.hp + PLAYER.regenRate * dt);
				}
				continue;
			}
			if (p.state !== 'downed') continue;
			const reviver = [...this.players.values()].find(
				(q) =>
					q.state === 'alive' &&
					q.reviving === p.id &&
					Math.hypot(q.x - p.x, q.z - p.z) < PLAYER.reviveRange + 0.4
			);
			if (reviver) {
				p.revive += dt / PLAYER.reviveTime;
				if (p.revive >= 1) this.getUp(p);
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
		p.hp = PLAYER.health;
		p.revive = 0;
		p.bleed = 0;
		p.lastHurt = this.time;
	}

	private down(p: HostPlayer) {
		p.state = 'downed';
		p.hp = 0;
		const solo = this.players.size === 1;
		p.bleed = solo ? PLAYER.soloReviveTime : PLAYER.bleedOut;
		p.revive = 0;
		const loss = Math.floor((p.points * DOWNED_LOSS) / 10) * 10;
		p.points -= loss;
		if (loss) this.send(p.id, { t: 'points', amount: -loss });
		this.checkOver();
	}

	private targets(): HostPlayer[] {
		return [...this.players.values()].filter((p) => p.state === 'alive');
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
			z.cooldown = Math.max(0, z.cooldown - dt);
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

			// where to walk: straight at a player in sight, otherwise down the flow
			let tx = nearest.x;
			let tz = nearest.z;
			if (nearestD > CHASE_SIGHT || !this.blocking.canSee(z.x, z.z, nearest.x, nearest.z)) {
				const next = this.flow && this.blocking.downhill(this.flow, z.x, z.z);
				if (next) [tx, tz] = next;
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
				if (d > 0 && d < ZOMBIE.radius * 2.2) {
					dx += (ox / d) * 0.8;
					dz += (oz / d) * 0.8;
				}
			}
			const n = Math.hypot(dx, dz) || 1;
			// stop short of the player rather than walking into them
			const stopAt = Math.max(0, nearestD - ZOMBIE.reach * 0.7);
			const step = Math.min(ZOMBIE.speeds[z.speed] * dt, stopAt);
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
		const id = this.nextZombie++;
		this.zombies.set(id, {
			id,
			x: pick.x + (this.random() - 0.5) * 0.6,
			z: pick.z + (this.random() - 0.5) * 0.6,
			yaw: this.random() * Math.PI * 2,
			hp: zombieHealth(this.round),
			speed: speedClass(this.round, this.random()),
			rise: ZOMBIE.rise,
			windup: 0,
			cooldown: 0,
			stray: 0
		});
		return true;
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
			knifes: p.knifes
		}));
		const zombies: ZombieSnap[] = [...this.zombies.values()].map((z) => [
			z.id,
			r2(z.x),
			r2(z.z),
			r2(z.yaw),
			z.speed,
			(z.windup > 0 ? ZOMBIE_ATTACKING : 0) | (z.rise > 0 ? ZOMBIE_RISING : 0)
		]);
		return {
			t: 'snap',
			time: Math.round(this.time * 1000),
			phase: this.phase,
			round: this.round,
			left: this.toSpawn + this.zombies.size,
			timer: Math.ceil(Math.max(0, this.breakTimer)),
			players,
			zombies
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
