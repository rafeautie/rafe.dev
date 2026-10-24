import * as THREE from 'three';
import { Blocking, CELL, WINDOW_BOARDS, buildMap, cellIndex, cellOf, type GameMap } from '../map';
import type {
	BoxSnap,
	GameStats,
	HostMessage,
	LifeState,
	Phase,
	PlayerSnap,
	Loadout,
	PlayerMessage,
	PowerupKind,
	Snapshot,
	ZombieSnap
} from '../protocol';
import {
	CROUCH,
	POSE_ADS,
	POSE_AIR,
	POSE_AWAY,
	POSE_PAUSED,
	POSE_RELOAD,
	POSE_SPRINT,
	SLIDE,
	STAND,
	ZOMBIE_ATTACKING,
	ZOMBIE_CLIMBING,
	ZOMBIE_RISING,
	ZOMBIE_STAGGER,
	ZOMBIE_TEARING
} from '../protocol';
import {
	BOX,
	DOUBLE_TAP_RATE,
	JUGG_HEALTH,
	PERKS,
	PERK_IDS,
	PLAYER,
	SPEED_COLA_RATE,
	WINDOW,
	ZOMBIE,
	type PerkId
} from '../rules';
import type { Session } from '../session';
import { settings } from '../settings';
import { KNIFE, WEAPONS, ammoCost, type ReloadStyle, type Weapon, type WeaponId } from '../weapons';
import { Sound, type ReloadPart } from './audio';
import { Effects } from './effects';
import { HeldGun } from './heldgun';
import {
	Body,
	J,
	Ragdoll,
	STANDING,
	playerPose,
	rayCapsule,
	zombiePose,
	type Joints,
	type Posture
} from './rig';
import { PALETTE, buildWorld, type World } from './scene';
import { VIEW_LAYER, ViewModel, type ViewState } from './viewmodel';

// One player's view of the game: the 3D scene, the controls, and their own
// player, which moves on this machine and tells the host where it is. Zombies
// and other players are drawn a little in the past, between the two latest
// snapshots from the host, so they move smoothly.

const INTERP_DELAY = 110; // ms
const SEND_EVERY = 1 / 30;
const HUD_EVERY = 0.05;
const MOUSE_SPEED = 0.0022;
// recoil: how fast each shot's climb comes on, how long it holds after the
// last shot, how fast it's brought back down, the most it can build to, and
// the spring for the jolt
const RECOIL = { climb: 30, hold: 0.09, recover: 7, most: 0.3, punchStiff: 260, punchDamp: 18 };
// a moment after a sprint before the gun is back up and can fire
const SPRINT_OUT = 0.18;
const RAGDOLL_LIFE = 12;
// how long the mark showing where a hit came from stays, ms
const DANGER_TIME = 1600;
// a gun loaded a shell at a time: a moment to start, one shell after another,
// and a moment to rack it at the end
const SHELL_START = 0.3;
const SHELL_END = 0.3;
const shellTime = (w: Weapon) => w.reload / w.mag;
// the sound of each step of a reload, at its share of the way through
const RELOAD_PARTS: Record<ReloadStyle, [number, ReloadPart][]> = {
	mag: [
		[0.25, 'out'],
		[0.65, 'in'],
		[0.85, 'slide']
	],
	pistol: [
		[0.2, 'out'],
		[0.6, 'in'],
		[0.85, 'slide']
	],
	cell: [
		[0.3, 'out'],
		[0.7, 'in']
	],
	break: [
		[0.15, 'open'],
		[0.5, 'shell'],
		[0.85, 'close']
	],
	belt: [
		[0.12, 'open'],
		[0.3, 'out'],
		[0.6, 'in'],
		[0.85, 'close']
	],
	shells: []
};
const MAX_RAGDOLLS = 20;

const ZOMBIE_COLORS = { skin: '#5d5d5d', shirt: '#3b3b3b', pants: '#2c2c2c' };
const PLAYER_COLORS = { skin: '#bdbdbd', shirt: '#8f8f8f', pants: '#6f6f6f' };

type Slot = { weapon: WeaponId; mag: number; reserve: number };

export type HudPlayer = {
	id: string;
	name: string;
	points: number;
	kills: number;
	state: LifeState;
	you: boolean;
	// on the pause screen
	paused: boolean;
	// their connection dropped, and they have a minute to come back
	away: boolean;
};

export type HudState = {
	phase: Phase;
	round: number;
	left: number;
	timer: number;
	hp: number;
	// the most health there is, more with Juggernog
	maxHp: number;
	life: LifeState;
	bleed: number;
	beingRevived: number;
	reviving: number;
	weapon: string;
	mag: number;
	reserve: number;
	reloading: boolean;
	players: HudPlayer[];
	hint: { text: string; muted: boolean; progress?: number } | null;
	note: { text: string; warning: boolean } | null;
	// perks held, and seconds left on power-ups running for everyone
	perks: PerkId[];
	instakill: number;
	double: number;
	hits: number;
	kills: number;
	hurts: number;
	// which way recent hits came from: degrees clockwise from straight ahead,
	// and how much is left of each, 1 to 0
	danger: { id: number; angle: number; left: number }[];
	pops: { id: number; amount: number }[];
	locked: boolean;
	// whether the mouse has been captured yet this game, so the first
	// click-to-play prompt isn't mistaken for a pause
	played: boolean;
	// everyone is paused, so the game is too
	held: boolean;
	// the game's numbers so far, while paused, and in full once it's over
	stats: GameStats | null;
	isHost: boolean;
	// the connection to the host dropped and is being found again
	reconnecting: boolean;
	area: string;
};

type ZombieView = {
	body: Body;
	step: number;
	swing: number;
	x: number;
	z: number;
	vx: number;
	vz: number;
	riseStart: number;
	seen: number;
	groan: number;
	speed: number;
	// a jolt away from the last hit, 0 to 1, and which way it pushed
	flinch: number;
	flinchX: number;
	flinchZ: number;
	flinchAt: number;
};

type OtherView = {
	body: Body;
	gun: HeldGun;
	label: THREE.Sprite;
	// shown over their head while they have the pause screen up
	badge: THREE.Sprite;
	// and this while their connection is down
	away: THREE.Sprite;
	step: number;
	x: number;
	z: number;
	shots: number;
	knifes: number;
	// eased toward what the host last said, so they move between poses
	pose: Posture;
};

export class GameClient {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera = new THREE.PerspectiveCamera(settings.get().fov, 1, 0.05, 200);
	private map: GameMap;
	private blocking: Blocking;
	private world: World;
	private view = new ViewModel();
	private sound = new Sound();
	private dynamic = new THREE.Group();

	private me = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: Math.PI, pitch: 0, ground: true };
	private life: LifeState = 'alive';
	private hp: number = PLAYER.health;
	private phase: Phase = 'playing';
	private slots: Slot[] = [];
	private current = 0;
	private downedSlot: Slot | null = null;
	private fireWait = 0;
	private reloadLeft = 0;
	// how long this reload takes in all, and how many shells are in so far
	// for a gun loaded a shell at a time
	private reloadTotal = 1;
	private shellsIn = 0;
	// a jolt as a shell goes in or the pump is racked, 0 to 1
	private pulse = 0;
	private swapLeft = 0;
	private swapTotal = 0.45;
	// perks, as PERKS bits, from the host
	private perks = 0;
	private knifeWait = 0;
	private ads = 0;
	private triggerWasDown = false;
	private shots = 0;
	private knifes = 0;
	private reviving: string | null = null;
	private interactWait = 0;
	private speedNow = 0;
	// movement feel: crouching, sliding, the step cycle, a dip on landing
	private crouched = false;
	private slideLeft = 0;
	private crouchNow = 0;
	private slideNow = 0;
	private sprintNow = 0;
	private stride = 0;
	private strafe = 0;
	private dip = 0;
	private roll = 0;
	// the mouse's movement this frame, for the gun to lag behind
	private turn = { x: 0, y: 0 };
	// can't fire for a moment after a sprint, while the gun comes back up
	private sprintOut = 0;
	// how far shooting has thrown the aim up and sideways, on top of where
	// the player is pointing; the target is where it's heading
	private recoil = { pitch: 0, yaw: 0, target: 0, side: 0, since: 0, punch: 0, punchV: 0 };
	private hint: HudState['hint'] = null;
	// where recent hits came from, for the marks round the crosshair
	private danger: { id: number; x: number; z: number; at: number }[] = [];
	private drops = new Map<number, THREE.Mesh>();
	// for showing kills before the host confirms them: damage sent to each
	// zombie lately, kills shown early and when, when recent hits were sent,
	// and the time to the host and back, ms
	private pending = new Map<number, { damage: number; at: number }[]>();
	private predicted = new Map<number, number>();
	private hitTimes: number[] = [];
	private rtt = 0;
	private box: BoxSnap = { state: 'idle', weapon: null, by: null, left: 0 };
	// how long F has been held at a window, toward the next board
	private repairHeld = 0;
	private dangerId = 0;

	private snaps: { at: number; snap: Snapshot; zombies: Map<number, ZombieSnap> }[] = [];
	private zombies = new Map<number, ZombieView>();
	private gone = new Set<number>();
	private ragdolls: Ragdoll[] = [];
	private others = new Map<string, OtherView>();
	private effects = new Effects(this.dynamic);

	private keys = new Set<string>();
	private pressed = new Set<string>();
	private buttons = new Set<number>();
	private look = { x: 0, y: 0 };
	private wheel = 0;

	private hud: HudState;
	private hudListeners = new Set<() => void>();
	private hudWait = 0;
	private sendWait = 0;
	private noteUntil = 0;
	private popId = 0;
	private frame = 0;
	private last = 0;
	private disposers: (() => void)[] = [];
	private played = false;
	private stats: GameStats | null = null;
	private statsWait = 0;

	constructor(
		private canvas: HTMLCanvasElement,
		private session: Session
	) {
		this.map = buildMap();
		this.blocking = new Blocking(this.map);
		session.doors.forEach((open, i) => (this.blocking.open[i] = open));

		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		// cleared by hand, so the gun's pass can draw over the world's
		this.renderer.autoClear = false;
		this.scene.background = new THREE.Color(PALETTE.sky);
		this.scene.fog = new THREE.Fog(PALETTE.sky, 10, 62);
		this.world = buildWorld(this.map);
		this.blocking.open.forEach((open, i) => open && this.world.openDoor(i));
		this.world.update(10);
		this.camera.rotation.order = 'YXZ';
		this.camera.add(this.view.root);
		this.scene.add(this.world.root, this.dynamic, this.camera);

		const spawn = session.spawn ?? this.map.playerSpawns[0];
		this.me.x = spawn.x;
		this.me.z = spawn.z;
		this.resetLoadout();
		// back in a game after reloading the page, with the guns they had
		if (session.loadout?.length)
			this.slots = session.loadout.map(([weapon, mag, reserve]) => ({ weapon, mag, reserve }));

		this.hud = this.makeHud();
		session.listen((m) => this.receive(m));
		this.bindInput();
		this.sound.setVolume(settings.get().volume / 100);
		this.disposers.push(
			settings.subscribe(() => this.sound.setVolume(settings.get().volume / 100))
		);
		this.resize();
	}

	start() {
		this.last = performance.now();
		const loop = (now: number) => {
			this.frame = requestAnimationFrame(loop);
			const dt = Math.min(0.05, (now - this.last) / 1000);
			this.last = now;
			this.update(dt, now);
		};
		this.frame = requestAnimationFrame(loop);
	}

	dispose() {
		cancelAnimationFrame(this.frame);
		this.session.listen(null);
		for (const d of this.disposers) d();
		if (document.pointerLockElement === this.canvas) document.exitPointerLock();
		this.sound.close();
		this.scene.traverse((o) => {
			if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite)) return;
			o.geometry.dispose();
			for (const m of [o.material].flat()) {
				(m as THREE.MeshBasicMaterial).map?.dispose();
				m.dispose();
			}
		});
		this.renderer.dispose();
		// browsers allow only a few WebGL contexts at once, so give this one back now
		this.renderer.forceContextLoss();
	}

	subscribe = (listener: () => void) => {
		this.hudListeners.add(listener);
		return () => this.hudListeners.delete(listener);
	};

	getHud = () => this.hud;

	lock() {
		this.sound.unlock();
		if (this.phase === 'over') return;
		// refused without a recent click, which leaves the click-to-play prompt up
		this.canvas.requestPointerLock()?.catch(() => {});
	}

	restart() {
		this.session.post({ t: 'restart' });
	}

	// --- input

	private bindInput() {
		const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void) => {
			target.addEventListener(type, fn as EventListener);
			this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
		};
		const locked = () => document.pointerLockElement === this.canvas;
		on<KeyboardEvent>(window, 'keydown', (e) => {
			if (!locked()) return;
			if (!e.repeat) this.pressed.add(e.code);
			this.keys.add(e.code);
			if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
		});
		on<KeyboardEvent>(window, 'keyup', (e) => this.keys.delete(e.code));
		on(window, 'blur', () => {
			this.keys.clear();
			this.buttons.clear();
		});
		on<MouseEvent>(this.canvas, 'mousedown', (e) => {
			if (!locked()) return;
			this.buttons.add(e.button);
		});
		on<MouseEvent>(window, 'mouseup', (e) => this.buttons.delete(e.button));
		on<MouseEvent>(window, 'mousemove', (e) => {
			if (!locked()) return;
			this.look.x += e.movementX;
			this.look.y += e.movementY;
		});
		on<WheelEvent>(window, 'wheel', (e) => {
			if (locked()) this.wheel += Math.sign(e.deltaY);
		});
		on(this.canvas, 'contextmenu', (e) => e.preventDefault());
		on(document, 'pointerlockchange', () => {
			if (!locked()) {
				this.keys.clear();
				this.buttons.clear();
				// fresh numbers for the pause screen straight away
				this.statsWait = 0;
			} else this.played = true;
			this.publishHud();
		});
		on(window, 'resize', () => this.resize());
	}

	private resize() {
		const w = this.canvas.clientWidth || window.innerWidth;
		const h = this.canvas.clientHeight || window.innerHeight;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	// --- messages from the host

	private receive(m: HostMessage) {
		switch (m.t) {
			case 'snap':
				this.onSnapshot(m);
				break;
			case 'welcome':
				// back after a dropped connection, perhaps to a new host whose
				// clock is behind the last: start the timeline afresh. Where this
				// player is and what they hold is already right here.
				this.snaps = [];
				break;
			case 'died':
				this.kill(m.id, m.dir, m.force, m.head);
				break;
			case 'gone': {
				this.gone.add(m.id);
				this.zombies.get(m.id)?.body.dispose();
				this.zombies.delete(m.id);
				break;
			}
			case 'door':
				this.blocking.open[m.door] = true;
				this.world.openDoor(m.door);
				this.sound.door();
				break;
			case 'grant':
				this.grant(m.weapon, m.ammo);
				break;
			case 'denied':
				this.deny();
				break;
			case 'hurt':
				this.sound.hurt();
				this.hud = { ...this.hud, hurts: this.hud.hurts + 1 };
				if (Array.isArray(m.from))
					this.danger.push({
						id: ++this.dangerId,
						x: m.from[0],
						z: m.from[1],
						at: performance.now()
					});
				break;
			case 'points':
				// each hit is paid for, so the time to the pay says how far away
				// the host is
				if (m.amount > 0 && this.hitTimes.length) {
					const sample = performance.now() - this.hitTimes.shift()!;
					this.rtt += (Math.min(1000, sample) - this.rtt) * 0.2;
				}
				this.hud = {
					...this.hud,
					pops: [...this.hud.pops.slice(-5), { id: ++this.popId, amount: m.amount }]
				};
				break;
			case 'respawn':
				this.me.x = m.x;
				this.me.z = m.z;
				this.me.y = 0;
				this.me.vy = 0;
				this.resetLoadout();
				break;
			case 'round':
				this.sound.round();
				break;
			case 'stats':
				if (this.phase !== 'over') this.stats = m.stats;
				break;
			case 'powerup':
				this.sound.powerupPickup(m.kind);
				this.note(POWERUP_NAMES[m.kind], false);
				if (m.kind === 'ammo') {
					for (const slot of this.slots) {
						const w = WEAPONS[slot.weapon];
						slot.mag = w.mag;
						slot.reserve = w.reserve;
					}
				}
				break;
			case 'perk':
				this.sound.perkJingle(m.perk);
				this.sound.drink();
				this.note(PERKS[m.perk].name, false);
				// the gun goes down while drinking
				this.reloadLeft = 0;
				this.raise(WEAPONS[this.slot().weapon]);
				this.swapLeft = this.swapTotal = 1.2;
				break;
			case 'over':
				this.phase = 'over';
				this.stats = m.stats;
				if (document.pointerLockElement === this.canvas) document.exitPointerLock();
				break;
			case 'restart':
				this.blocking.open.fill(false);
				this.world.closeDoors();
				for (const z of this.zombies.values()) z.body.dispose();
				this.zombies.clear();
				this.effects.clear();
				for (const r of this.ragdolls) r.body.dispose();
				this.ragdolls = [];
				this.phase = 'break';
				this.life = 'alive';
				this.downedSlot = null;
				this.stats = null;
				break;
		}
	}

	private onSnapshot(snap: Snapshot) {
		// snapshots can arrive out of order; a late one is already out of date
		const last = this.snaps.at(-1);
		if (last && snap.time <= last.snap.time) return;
		const zombies = new Map<number, ZombieSnap>();
		for (const z of snap.zombies) zombies.set(z[0], z);
		// a kill shown early that the host still hasn't made: bring it back
		const now = performance.now();
		for (const [id, at] of this.predicted) {
			if (now - at < this.rtt + 300) continue;
			this.predicted.delete(id);
			if (zombies.has(id)) this.gone.delete(id);
		}
		this.snaps.push({ at: performance.now(), snap, zombies });
		if (this.snaps.length > 30) this.snaps.shift();
		this.phase = snap.phase;
		this.syncWorld(snap, last?.snap);
		const mine = snap.players.find((p) => p.id === this.session.state.you);
		if (!mine) return;
		this.hp = mine.hp;
		this.perks = mine.perks;
		if (mine.state !== this.life) {
			const was = this.life;
			this.life = mine.state;
			if (mine.state === 'downed') {
				// down to the pistol, whatever was in hand
				this.downedSlot = {
					weapon: 'm1911',
					mag: WEAPONS.m1911.mag,
					reserve: WEAPONS.m1911.mag * 3
				};
				this.reloadLeft = 0;
				this.raise(WEAPONS.m1911);
				this.me.vy = 0;
				this.me.y = 0;
			} else if (mine.state === 'alive' && was === 'downed') {
				this.downedSlot = null;
				this.raise(WEAPONS[this.slot().weapon]);
			}
		}
	}

	// Windows, the box and power-ups on the floor, brought up to date with a
	// snapshot, with a sound for each change.
	private syncWorld(snap: Snapshot, before: Snapshot | undefined) {
		snap.windows.forEach((boards, i) => {
			const was = before?.windows[i] ?? boards;
			if (boards === was) return;
			const w = this.map.windows[i];
			this.world.setBoards(i, boards);
			if (boards < was) this.sound.boardBreak({ x: w.x, y: 1.4, z: w.z });
		});
		const box = this.map.machines.find((m) => m.kind === 'box');
		const at = box && { x: box.x, y: 1, z: box.z };
		const was = before?.box.state ?? 'idle';
		if (at && snap.box.state !== was) {
			if (snap.box.state === 'rolling') {
				this.sound.boxOpen(at);
				this.sound.boxJingle(at);
			} else if (snap.box.state === 'idle') this.sound.boxClose(at);
		}
		this.world.setBox(snap.box);
		this.box = snap.box;

		const seen = new Set<number>();
		for (const d of snap.drops) {
			seen.add(d.id);
			let mesh = this.drops.get(d.id);
			if (!mesh) {
				mesh = dropMesh(d.kind);
				mesh.position.set(d.x, 0.55, d.z);
				this.dynamic.add(mesh);
				this.effects.glow(mesh);
				this.drops.set(d.id, mesh);
				this.sound.powerupSpawn({ x: d.x, y: 0.6, z: d.z });
			}
			// blinks as it runs out
			mesh.visible = d.left > 5 || Math.floor(performance.now() / 180) % 2 === 0;
		}
		for (const [id, mesh] of this.drops) {
			if (seen.has(id)) continue;
			this.effects.unglow(mesh);
			mesh.removeFromParent();
			for (const m of [mesh.material].flat()) {
				(m as THREE.MeshLambertMaterial).map?.dispose();
				m.dispose();
			}
			this.drops.delete(id);
		}
		if (before && before.instakill > 0 && snap.instakill === 0) this.sound.powerupEnd();
		if (before && before.double > 0 && snap.double === 0) this.sound.powerupEnd();
	}

	private grant(weapon: WeaponId, ammo: boolean) {
		this.sound.buy();
		const w = WEAPONS[weapon];
		const owned = this.slots.find((s) => s.weapon === weapon);
		if (ammo && owned) {
			owned.mag = w.mag;
			owned.reserve = w.reserve;
			return;
		}
		const slot = { weapon, mag: w.mag, reserve: w.reserve };
		if (this.slots.length < 2) {
			this.slots.push(slot);
			this.current = this.slots.length - 1;
		} else this.slots[this.current] = slot;
		this.reloadLeft = 0;
		this.raise(w);
	}

	private resetLoadout() {
		this.slots = [{ weapon: 'm1911', mag: WEAPONS.m1911.mag, reserve: WEAPONS.m1911.reserve }];
		this.current = 0;
		this.downedSlot = null;
		this.reloadLeft = 0;
		this.life = 'alive';
	}

	private slot(): Slot {
		return this.downedSlot ?? this.slots[this.current];
	}

	// a line under the crosshair for a moment: a warning, or good news
	private note(text: string, warning = true) {
		this.noteUntil = performance.now() + 1800;
		this.hud = { ...this.hud, note: { text, warning } };
	}

	// --- the frame

	private update(dt: number, now: number) {
		const active = document.pointerLockElement === this.canvas && this.phase !== 'over';
		if (active) {
			const { sensitivity, aimSensitivity, invertY } = settings.get();
			const speed = MOUSE_SPEED * sensitivity * (1 + (aimSensitivity - 1) * this.ads);
			const dx = this.look.x * speed;
			let dy = this.look.y * speed * (invertY ? -1 : 1);
			// pulling down against recoil takes it off first, the way a player
			// fights the climb, so the recovery doesn't drag the aim on past
			const r = this.recoil;
			if (dy > 0 && r.target > 0) {
				const take = Math.min(dy, r.target);
				r.target -= take;
				r.pitch = Math.max(0, r.pitch - take);
				dy -= take;
			}
			this.me.yaw -= dx;
			this.me.pitch -= dy;
			this.me.pitch = Math.max(-1.45, Math.min(1.45, this.me.pitch));
			this.turn.x += (dx / Math.max(dt, 0.001) - this.turn.x) * Math.min(1, dt * 20);
			this.turn.y += (dy / Math.max(dt, 0.001) - this.turn.y) * Math.min(1, dt * 20);
		} else this.turn.x = this.turn.y = 0;
		this.look.x = this.look.y = 0;
		this.settleRecoil(dt);

		if (this.life !== 'dead') this.move(dt, active);
		this.weapons(dt, active);
		this.interact(dt, active);

		// while the pause screen is up, keep its numbers current
		this.statsWait -= dt;
		if (!active && this.played && this.phase !== 'over' && this.statsWait <= 0) {
			this.statsWait = 2;
			this.session.post({ t: 'stats' });
		}

		this.sendWait -= dt;
		if (this.sendWait <= 0) {
			this.sendWait = SEND_EVERY;
			this.session.post({
				t: 'me',
				x: this.me.x,
				y: this.me.y,
				z: this.me.z,
				yaw: this.me.yaw + this.recoil.yaw,
				pitch: this.me.pitch + this.recoil.pitch,
				weapon: this.slot().weapon,
				shots: this.shots,
				knifes: this.knifes,
				reviving: this.reviving,
				paused: document.pointerLockElement !== this.canvas,
				stance: this.slideLeft > 0 ? SLIDE : this.crouched ? CROUCH : STAND,
				flags:
					(this.sprintNow > 0.5 ? POSE_SPRINT : 0) |
					(this.ads > 0.5 ? POSE_ADS : 0) |
					(this.reloadLeft > 0 ? POSE_RELOAD : 0) |
					(this.me.ground ? 0 : POSE_AIR),
				// the gun in hand first
				loadout: [
					this.slots[this.current],
					...this.slots.filter((x) => x !== this.slots[this.current])
				].map((x) => [x.weapon, x.mag, x.reserve] as Loadout[number])
			});
		}

		this.drawOthers(dt, now);
		this.effects.update(dt);
		this.world.update(dt);
		this.placeCamera(dt, now);
		this.render();

		this.pressed.clear();
		this.wheel = 0;
		this.hudWait -= dt;
		if (this.hudWait <= 0) {
			this.hudWait = HUD_EVERY;
			this.publishHud();
		}
	}

	// The world first, then the gun on a cleared depth buffer, so nothing in
	// the world (zombies included, which are transparent and drawn late) can
	// cover it. The shadows from the first pass are reused for the second.
	private render() {
		const { renderer, scene, camera } = this;
		renderer.clear();
		camera.layers.set(0);
		renderer.render(scene, camera);
		renderer.clearDepth();
		camera.layers.set(VIEW_LAYER);
		const background = scene.background;
		scene.background = null;
		renderer.shadowMap.autoUpdate = false;
		renderer.render(scene, camera);
		renderer.shadowMap.autoUpdate = true;
		scene.background = background;
	}

	// Movement in the style of modern shooters: speed comes and goes quickly
	// on the ground, so the player stops and turns where they mean to, while a
	// jump keeps its momentum. Sprinting builds up over a moment; crouching
	// from a sprint turns into a slide.
	private move(dt: number, active: boolean) {
		const me = this.me;
		const downed = this.life === 'downed';
		const k = (code: string) => active && this.keys.has(code);
		let fx = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
		let sx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
		const len = Math.hypot(fx, sx);
		if (len > 0) {
			fx /= len;
			sx /= len;
		}
		const sin = Math.sin(me.yaw);
		const cos = Math.cos(me.yaw);
		// the way the keys point, in the world
		const wx = -sin * fx + cos * sx;
		const wz = -cos * fx - sin * sx;
		const speed = Math.hypot(me.vx, me.vz);

		// stance: C crouches, or slides out of a sprint; jumping or sprinting
		// stands back up
		if (downed) {
			this.crouched = false;
			this.slideLeft = 0;
		} else if (active && this.pressed.has('KeyC')) {
			if (this.sprinting() && me.ground && speed > PLAYER.walk) {
				this.slideLeft = PLAYER.slideTime;
				const boost = Math.max(PLAYER.slideSpeed, speed) / Math.max(speed, 0.001);
				me.vx *= boost;
				me.vz *= boost;
				this.crouched = true;
				this.sound.slide();
			} else this.crouched = !this.crouched;
		}
		if (this.crouched && this.slideLeft <= 0 && k('ShiftLeft') && fx > 0) this.crouched = false;

		if (this.slideLeft > 0) {
			// a slide carries on the way it started, losing speed, steered a little
			this.slideLeft -= dt;
			const going = Math.hypot(me.vx, me.vz);
			const left = Math.max(0, going - PLAYER.slideFriction * dt);
			let dx = me.vx / (going || 1);
			let dz = me.vz / (going || 1);
			dx += wx * dt * 1.5;
			dz += wz * dt * 1.5;
			const d = Math.hypot(dx, dz) || 1;
			me.vx = (dx / d) * left;
			me.vz = (dz / d) * left;
			if (left < PLAYER.crouch) this.slideLeft = 0;
		} else {
			const target = downed
				? PLAYER.crawl
				: this.sprinting()
					? PLAYER.sprint
					: this.crouched
						? PLAYER.crouch
						: PLAYER.walk * (1 - this.ads * (1 - PLAYER.adsWalk));
			const tx = wx * target;
			const tz = wz * target;
			let rate: number;
			if (!me.ground) rate = PLAYER.airAccel;
			else if (len === 0) rate = PLAYER.friction;
			// building up to a sprint takes a moment; everything else is quick
			else rate = speed > PLAYER.walk && target > PLAYER.walk ? PLAYER.sprintAccel : PLAYER.accel;
			const ex = tx - me.vx;
			const ez = tz - me.vz;
			const e = Math.hypot(ex, ez);
			const step = Math.min(e, rate * dt);
			if (e > 1e-6) {
				me.vx += (ex / e) * step;
				me.vz += (ez / e) * step;
			}
		}

		[me.x, me.z] = this.blocking.move(me.x, me.z, me.vx * dt, me.vz * dt, PLAYER.radius);
		// zombies are solid: they can box a player in. A downed player crawls
		// under them instead, or they would shove the player around.
		for (const z of downed ? [] : this.zombies.values()) {
			const dx = me.x - z.x;
			const dz = me.z - z.z;
			const d = Math.hypot(dx, dz);
			const min = PLAYER.radius + ZOMBIE.radius;
			if (d > 0.001 && d < min) {
				me.x += (dx / d) * (min - d);
				me.z += (dz / d) * (min - d);
			}
		}
		[me.x, me.z] = this.blocking.pushOut(me.x, me.z, PLAYER.radius);
		this.speedNow = Math.hypot(me.vx, me.vz);
		// sideways speed, for leaning the view into a strafe
		this.strafe = me.vx * cos - me.vz * sin;

		if (!downed && me.ground && this.pressed.has('Space')) {
			if (this.crouched && this.slideLeft <= 0) this.crouched = false;
			else {
				me.vy = PLAYER.jump;
				me.ground = false;
				this.slideLeft = 0;
				this.crouched = false;
			}
		}
		me.vy -= PLAYER.gravity * dt;
		me.y += me.vy * dt;
		if (me.y <= 0) {
			if (!me.ground) {
				// the view dips on landing, more for a longer fall
				this.dip = Math.min(0.14, this.dip + -me.vy * 0.012);
				this.sound.land(Math.min(1, -me.vy / 9));
			}
			me.y = 0;
			me.vy = 0;
			me.ground = true;
		}

		// smoothed, for the view and for others to see
		const ease = 1 - Math.exp(-dt * 14);
		this.crouchNow += ((this.crouched ? 1 : 0) - this.crouchNow) * ease;
		this.slideNow += ((this.slideLeft > 0 ? 1 : 0) - this.slideNow) * ease;
		this.sprintNow += ((this.sprinting() && speed > PLAYER.walk ? 1 : 0) - this.sprintNow) * ease;
		if (me.ground && this.slideLeft <= 0) {
			const before = this.stride;
			this.stride += this.speedNow * dt * 1.75;
			if (Math.floor(this.stride / Math.PI) !== Math.floor(before / Math.PI) && !downed)
				this.sound.footstep(
					'tile',
					Math.min(1, this.speedNow / PLAYER.sprint) * (this.crouched ? 0.45 : 1)
				);
		}
		this.dip *= Math.exp(-dt * 9);
	}

	private sprinting() {
		return (
			this.life === 'alive' &&
			this.keys.has('ShiftLeft') &&
			this.keys.has('KeyW') &&
			!this.keys.has('KeyS') &&
			!this.buttons.has(0) &&
			!this.buttons.has(2) &&
			this.reloadLeft <= 0 &&
			!(this.crouched && this.slideLeft <= 0) &&
			this.me.ground
		);
	}

	private weapons(dt: number, active: boolean) {
		this.fireWait -= dt;
		this.knifeWait -= dt;
		this.swapLeft = Math.max(0, this.swapLeft - dt);
		const slot = this.slot();
		const weapon = WEAPONS[slot.weapon];
		this.view.setWeapon(slot.weapon);
		const dead = this.life === 'dead';
		const sprinting = this.sprinting();
		// the gun has to come back up from a sprint before it can fire
		if (this.sprintNow > 0.5) this.sprintOut = SPRINT_OUT;
		else this.sprintOut = Math.max(0, this.sprintOut - dt);
		const aiming = active && !dead && this.buttons.has(2) && !sprinting && this.swapLeft <= 0;
		this.ads += ((aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 12);

		this.pulse = Math.max(0, this.pulse - dt * 6);
		if (this.reloadLeft > 0) this.reloading(dt, weapon, slot);
		if (dead || !active) {
			this.triggerWasDown = false;
			this.view.update(dt, this.viewState(weapon));
			return;
		}

		// swap
		const swap = this.pressed.has('Digit1')
			? 0
			: this.pressed.has('Digit2')
				? 1
				: this.wheel || this.pressed.has('KeyQ')
					? 1 - this.current
					: -1;
		if (swap >= 0 && swap !== this.current && this.slots[swap] && !this.downedSlot) {
			this.current = swap;
			this.reloadLeft = 0;
			this.raise(WEAPONS[this.slots[swap].weapon]);
		}

		// reload
		const busy = this.swapLeft > 0 || this.knifeWait > KNIFE.cooldown - 0.3;
		if (
			this.pressed.has('KeyR') &&
			this.reloadLeft <= 0 &&
			slot.mag < weapon.mag &&
			slot.reserve > 0 &&
			!busy
		) {
			this.startReload(weapon);
		}

		// knife
		if (
			(this.pressed.has('KeyV') || this.pressed.has('KeyE')) &&
			this.knifeWait <= 0 &&
			this.life === 'alive'
		) {
			this.knifeWait = KNIFE.cooldown;
			this.reloadLeft = 0;
			this.stab();
		}

		// fire
		const trigger = this.buttons.has(0);
		const wants = trigger && (weapon.auto || !this.triggerWasDown);
		// a gun loaded a shell at a time can stop loading to shoot
		if (
			wants &&
			weapon.reloadStyle === 'shells' &&
			this.reloadLeft > 0 &&
			slot.mag > 0 &&
			!this.triggerWasDown
		) {
			this.reloadLeft = 0;
			this.fireWait = Math.max(this.fireWait, 0.12);
		}
		if (wants && !busy && this.reloadLeft <= 0 && this.fireWait <= 0 && this.sprintOut <= 0) {
			if (slot.mag > 0) {
				slot.mag--;
				const rate = this.perks & PERKS.tap.bit ? DOUBLE_TAP_RATE : 1;
				this.fireWait = 60 / (weapon.rpm * rate);
				this.fire(weapon);
			} else if (slot.reserve > 0) this.startReload(weapon);
			else if (!this.triggerWasDown) this.sound.empty();
		}
		this.triggerWasDown = trigger;
		if (slot.mag === 0 && slot.reserve > 0 && this.reloadLeft <= 0 && this.fireWait <= 0 && !busy)
			this.startReload(weapon);

		this.view.update(dt, this.viewState(weapon));
	}

	private viewState(weapon: (typeof WEAPONS)[WeaponId]): ViewState {
		return {
			ads: this.ads,
			reload: this.reloadLeft > 0 ? 1 - this.reloadLeft / this.reloadTotal : 0,
			reloadStyle: weapon.reloadStyle,
			magOut: this.magOut(weapon),
			pulse: this.pulse,
			swap: Math.sin((this.swapLeft / this.swapTotal) * Math.PI) * 0.8,
			moving: this.me.ground ? this.speedNow : 0,
			downed: this.life === 'downed',
			sprint: this.sprintNow,
			crouch: this.crouchNow,
			slide: this.slideNow,
			stride: this.stride,
			dip: this.dip,
			turnX: this.turn.x,
			turnY: this.turn.y
		};
	}

	private startReload(weapon: Weapon) {
		const slot = this.slot();
		const speed = this.perks & PERKS.speed.bit ? SPEED_COLA_RATE : 1;
		if (weapon.reloadStyle === 'shells') {
			const shells = Math.min(weapon.mag - slot.mag, slot.reserve);
			this.reloadTotal = (SHELL_START + shells * shellTime(weapon) + SHELL_END) / speed;
		} else this.reloadTotal = weapon.reload / speed;
		this.reloadLeft = this.reloadTotal;
		this.shellsIn = 0;
	}

	// A reload under way: the sounds of each step as it reaches them, shells
	// going in one by one, and the gun filled at the end.
	private reloading(dt: number, weapon: Weapon, slot: Slot) {
		const before = 1 - this.reloadLeft / this.reloadTotal;
		this.reloadLeft -= dt;
		const after = Math.min(1, 1 - this.reloadLeft / this.reloadTotal);
		if (weapon.reloadStyle === 'shells') {
			const speed = this.perks & PERKS.speed.bit ? SPEED_COLA_RATE : 1;
			const elapsed = after * this.reloadTotal * speed;
			const due = Math.floor((elapsed - SHELL_START) / shellTime(weapon)) + 1;
			while (this.shellsIn < due && slot.mag < weapon.mag && slot.reserve > 0) {
				this.shellsIn++;
				slot.mag++;
				slot.reserve--;
				this.pulse = 1;
				this.sound.reloadPart('shell');
			}
			if (this.reloadLeft <= 0) {
				this.pulse = 1;
				this.sound.reloadPart('pump');
			}
			return;
		}
		for (const [at, part] of RELOAD_PARTS[weapon.reloadStyle]) {
			if (before < at && after >= at) {
				this.sound.reloadPart(part);
				if (part === 'slide' || part === 'close') this.pulse = 1;
			}
		}
		if (this.reloadLeft <= 0) {
			const take = Math.min(weapon.mag - slot.mag, slot.reserve);
			slot.mag += take;
			slot.reserve -= take;
		}
	}

	// how far the magazine is out of the gun, 0 to 1, for the hands to show
	private magOut(weapon: Weapon) {
		if (this.reloadLeft <= 0) return 0;
		const parts = RELOAD_PARTS[weapon.reloadStyle];
		const out = parts.find(([, p]) => p === 'out')?.[0];
		const back = parts.find(([, p]) => p === 'in')?.[0];
		if (out === undefined || back === undefined) return 0;
		const t = 1 - this.reloadLeft / this.reloadTotal;
		if (t < out - 0.08 || t > back) return 0;
		return Math.min(1, (t - (out - 0.08)) / 0.08) * Math.min(1, (back - t) / 0.06);
	}

	// a gun brought up, after a swap or a buy
	private raise(weapon: Weapon) {
		this.swapTotal = weapon.swap;
		this.swapLeft = weapon.swap;
		this.sound.raise();
	}

	private forward(out: THREE.Vector3) {
		return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
	}

	private fire(weapon: (typeof WEAPONS)[WeaponId]) {
		this.shots++;
		this.view.fire(weapon.kick);
		this.sound.shot(weapon.id);
		const origin = this.camera.getWorldPosition(new THREE.Vector3());
		const fwd = this.forward(new THREE.Vector3());
		const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
		const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
		const spread =
			weapon.spread *
			(1 - this.ads * 0.8) *
			(this.speedNow > 1 ? 1.4 : 1) *
			(this.me.ground ? 1 : 2);
		const hits = new Map<
			number,
			{ damage: number; head: boolean; point: THREE.Vector3; dir: THREE.Vector3 }
		>();
		const dir = new THREE.Vector3();
		for (let i = 0; i < weapon.pellets; i++) {
			const angle = Math.random() * Math.PI * 2;
			const radius = Math.sqrt(Math.random()) * spread;
			dir
				.copy(fwd)
				.addScaledVector(right, Math.cos(angle) * radius)
				.addScaledVector(up, Math.sin(angle) * radius)
				.normalize();
			const hit = this.trace(origin, dir, weapon.range);
			if (hit.zombie === null) {
				// a hole and a puff of dust where it met a wall or the floor
				if (hit.t < weapon.range) {
					const at = origin.clone().addScaledVector(dir, hit.t);
					const normal = this.normalAt(at, dir);
					this.effects.dust(at, normal);
					if (!this.onDoor(at, dir)) this.effects.decal(at, normal, 'hole');
				}
				continue;
			}
			const prior = hits.get(hit.zombie) ?? {
				damage: 0,
				head: false,
				point: new THREE.Vector3(),
				dir: new THREE.Vector3()
			};
			prior.damage += weapon.damage * (hit.head ? weapon.headshot : 1);
			prior.head ||= hit.head;
			prior.point.copy(origin).addScaledVector(dir, hit.t);
			prior.dir.copy(dir);
			hits.set(hit.zombie, prior);
		}
		for (const [zombie, h] of hits) {
			this.bleed(zombie, h.point, h.dir, h.head ? 1.6 : 1, weapon.force);
			this.sendHit({
				t: 'hit',
				zombie,
				damage: Math.round(h.damage),
				head: h.head,
				knife: false,
				dir: [fwd.x, fwd.y, fwd.z],
				force: weapon.force
			});
		}
		if (hits.size) {
			this.sound.hit(false);
			this.hud = { ...this.hud, hits: this.hud.hits + 1 };
		}
		// the gun climbs with each shot, mostly up and drifting a little to
		// one side; held steadier when aiming or crouched
		const r = this.recoil;
		const steady = (1 - this.ads * 0.35) * (this.crouched ? 0.8 : 1);
		r.target = Math.min(RECOIL.most, r.target + weapon.kick * steady);
		r.side += (Math.random() - 0.35) * weapon.kick * 0.45 * steady;
		r.since = 0;
		// and the view jolts, a quick roll that springs back
		r.punchV += (Math.random() < 0.5 ? -1 : 1) * weapon.kick * 3;
	}

	// The climb comes on fast, holds while the trigger is held, then once the
	// shooting stops is eased back down towards where the player was aiming,
	// slowing as it gets there, like hands bringing the gun back on target.
	private settleRecoil(dt: number) {
		const r = this.recoil;
		r.since += dt;
		if (r.since > RECOIL.hold) {
			const back = Math.exp(-dt * RECOIL.recover);
			r.target *= back;
			r.side *= back;
		}
		const climb = 1 - Math.exp(-dt * RECOIL.climb);
		r.pitch += (r.target - r.pitch) * climb;
		r.yaw += (r.side - r.yaw) * climb;
		// a stiff spring that overshoots a little before it settles
		r.punchV += (-RECOIL.punchStiff * r.punch - RECOIL.punchDamp * r.punchV) * dt;
		r.punch += r.punchV * dt;
	}

	// The nearest zombie a ray hits before a wall, if any.
	private trace(o: THREE.Vector3, d: THREE.Vector3, range: number) {
		const flat = Math.hypot(d.x, d.z);
		let wall =
			flat > 1e-6 ? this.blocking.ray(o.x, o.z, d.x, d.z, range * flat, true) / flat : range;
		if (d.y < 0) wall = Math.min(wall, -o.y / d.y);
		let best: { zombie: number | null; head: boolean; t: number } = {
			zombie: null,
			head: false,
			t: wall
		};
		for (const [id, z] of this.zombies) {
			const j = z.body.joints;
			const head = rayCapsule(o, d, j, J.neck, J.headTop, 0.16);
			if (head >= 0 && head < best.t) best = { zombie: id, head: true, t: head };
			for (const [p, q, r] of BODY_CAPSULES) {
				const t = rayCapsule(o, d, j, p, q, r);
				if (t >= 0 && t < best.t) best = { zombie: id, head: false, t };
			}
		}
		return best;
	}

	// Tells the host about a hit, and if it's surely a kill, drops the zombie
	// here and now rather than a round trip later. The host still decides;
	// a kill it doesn't agree with puts the zombie back.
	private sendHit(m: Extract<PlayerMessage, { t: 'hit' }>) {
		this.session.post(m);
		const now = performance.now();
		this.hitTimes.push(now);
		if (this.hitTimes.length > 30) this.hitTimes.shift();
		const latest = this.snaps.at(-1);
		const z = latest?.zombies.get(m.zombie);
		if (!latest || !z) return;
		// hits the latest snapshot can't know about yet
		const since = latest.at - this.rtt;
		const pending = (this.pending.get(m.zombie) ?? []).filter((p) => p.at > since);
		pending.push({ damage: m.damage, at: now });
		this.pending.set(m.zombie, pending);
		const dealt = pending.reduce((sum, p) => sum + p.damage, 0);
		if (latest.snap.instakill > 0 || dealt >= z[6]) {
			this.predicted.set(m.zombie, now);
			this.pending.delete(m.zombie);
			this.kill(m.zombie, m.dir, m.force, m.head);
		}
	}

	private stab() {
		this.knifes++;
		this.view.stab();
		this.sound.knife();
		const fx = -Math.sin(this.me.yaw);
		const fz = -Math.cos(this.me.yaw);
		let target: number | null = null;
		let best = KNIFE.range + ZOMBIE.radius;
		for (const [id, z] of this.zombies) {
			const dx = z.x - this.me.x;
			const dz = z.z - this.me.z;
			const d = Math.hypot(dx, dz);
			if (d > best || d < 0.01) continue;
			if ((dx * fx + dz * fz) / d < Math.cos(0.8)) continue;
			best = d;
			target = id;
		}
		if (target === null) return;
		const z = this.zombies.get(target)!;
		// a short lunge onto the target
		if (best > 1.1) {
			this.me.vx += fx * 6;
			this.me.vz += fz * 6;
		}
		this.bleed(target, new THREE.Vector3(z.x, 1.3, z.z), new THREE.Vector3(fx, 0.1, fz), 1.2, 9);
		this.sound.hit(false);
		this.hud = { ...this.hud, hits: this.hud.hits + 1 };
		this.sendHit({
			t: 'hit',
			zombie: target,
			damage: KNIFE.damage,
			head: false,
			knife: true,
			dir: [fx, 0.2, fz],
			force: KNIFE.force
		});
	}

	private deny() {
		this.sound.deny();
		this.note('Not Enough Points');
	}

	private interact(dt: number, active: boolean) {
		this.interactWait -= dt;
		this.reviving = null;
		let hint: HudState['hint'] = null;
		const latest = this.snaps.at(-1)?.snap;
		const meSnap = latest?.players.find((p) => p.id === this.session.state.you);
		const points = meSnap?.points ?? 0;
		const press = active && this.pressed.has('KeyF') && this.interactWait <= 0;
		if (this.life !== 'alive' || !latest) {
			this.hint = null;
			return;
		}
		// a teammate to pick up comes first
		const downed = latest.players.find(
			(p) =>
				p.id !== this.session.state.you &&
				p.state === 'downed' &&
				Math.hypot(p.x - this.me.x, p.z - this.me.z) < PLAYER.reviveRange
		);
		if (downed) {
			hint = { text: `Hold F to Revive ${downed.name}`, muted: false };
			if (active && this.keys.has('KeyF')) this.reviving = downed.id;
		} else {
			const door = this.map.doors.find(
				(d) => !this.blocking.open[d.index] && Math.hypot(d.x - this.me.x, d.z - this.me.z) < 2.3
			);
			const boards = latest.windows;
			const window = this.map.windows.find(
				(w) =>
					boards[w.index] < WINDOW_BOARDS &&
					Math.hypot(w.x + w.nx * 1.3 - this.me.x, w.z + w.nz * 1.3 - this.me.z) < 1.7
			);
			const machine = this.map.machines.find(
				(m) =>
					Math.hypot(m.x + m.nx * 1.2 - this.me.x, m.z + m.nz * 1.2 - this.me.z) < 1.6 &&
					(m.kind === 'box' || !(this.perks & PERKS[m.kind].bit))
			);
			if (window) {
				// holding F nails a board back on every so often
				hint = { text: 'Hold F to Rebuild', muted: false };
				if (active && this.keys.has('KeyF')) {
					this.repairHeld += dt;
					hint.progress = Math.min(1, this.repairHeld / WINDOW.repairTime);
					if (this.repairHeld >= WINDOW.repairTime) {
						this.repairHeld = 0;
						this.sound.boardRepair();
						this.session.post({ t: 'repair', window: window.index });
					}
				} else this.repairHeld = 0;
			} else if (machine?.kind === 'box') {
				const box = this.box;
				const mine = box.by === this.session.state.you;
				if (box.state === 'idle') {
					hint = { text: `Press F for the Mystery Box · ${BOX.cost}`, muted: points < BOX.cost };
					if (press) {
						this.interactWait = 0.4;
						if (points < BOX.cost) this.deny();
						else
							this.session.post({
								t: 'buyBox',
								have: [...new Set(this.slots.map((s) => s.weapon))]
							});
					}
				} else if (box.state === 'offering' && mine && box.weapon) {
					hint = { text: `Press F to Take ${WEAPONS[box.weapon].name}`, muted: false };
					if (press) {
						this.interactWait = 0.4;
						this.session.post({ t: 'takeBox' });
					}
				} else hint = { text: 'Mystery Box', muted: true };
			} else if (machine) {
				const perk = PERKS[machine.kind];
				hint = { text: `Press F to Buy ${perk.name} · ${perk.cost}`, muted: points < perk.cost };
				if (press) {
					this.interactWait = 0.4;
					if (points < perk.cost) this.deny();
					else this.session.post({ t: 'buyPerk', perk: machine.kind });
				}
			} else if (door) {
				hint = { text: `Press F to Open Door · ${door.cost}`, muted: points < door.cost };
				if (press) {
					this.interactWait = 0.4;
					if (points < door.cost) this.deny();
					else this.session.post({ t: 'buyDoor', door: door.index });
				}
			} else {
				const fx = -Math.sin(this.me.yaw);
				const fz = -Math.cos(this.me.yaw);
				const wall = this.map.wallBuys.find(
					(w) =>
						Math.hypot(w.x + w.nx * 0.7 - this.me.x, w.z + w.nz * 0.7 - this.me.z) < 1.4 &&
						-(fx * w.nx + fz * w.nz) > 0.2
				);
				if (wall) {
					const weapon = WEAPONS[wall.weapon];
					const owned = this.slots.some((s) => s.weapon === weapon.id);
					const cost = owned ? ammoCost(weapon) : weapon.cost;
					hint = {
						text: owned
							? `Press F for ${weapon.name} Ammo · ${cost}`
							: `Press F to Buy ${weapon.name} · ${cost}`,
						muted: points < cost
					};
					if (press) {
						this.interactWait = 0.4;
						if (points < cost) this.deny();
						else this.session.post({ t: 'buyWeapon', wall: wall.index, owned });
					}
				}
			}
		}
		this.hint = hint;
	}

	// --- drawing everything else

	private interpolated(now: number) {
		const rt = now - INTERP_DELAY;
		const snaps = this.snaps;
		if (!snaps.length) return null;
		let i = snaps.length - 1;
		while (i > 0 && snaps[i - 1].at > rt) i--;
		const b = snaps[i];
		const a = i > 0 ? snaps[i - 1] : b;
		const span = b.at - a.at;
		const alpha = span > 0 ? Math.max(0, Math.min(1, (rt - a.at) / span)) : 1;
		return { a, b, alpha };
	}

	private drawOthers(dt: number, now: number) {
		const frame = this.interpolated(now);
		if (!frame) return;
		const { a, b, alpha } = frame;

		// zombies
		let steps = 0;
		for (const [id, zb] of b.zombies) {
			if (this.gone.has(id)) continue;
			const za = a.zombies.get(id) ?? zb;
			const x = za[1] + (zb[1] - za[1]) * alpha;
			const z = za[2] + (zb[2] - za[2]) * alpha;
			const y = za[7] + (zb[7] - za[7]) * alpha;
			const yaw = lerpAngle(za[3], zb[3], alpha);
			let view = this.zombies.get(id);
			if (!view) {
				view = {
					body: new Body(this.dynamic, ZOMBIE_COLORS),
					step: Math.random() * 6,
					swing: 0,
					x,
					z,
					vx: 0,
					vz: 0,
					riseStart: zb[5] & ZOMBIE_RISING ? now : -Infinity,
					seen: now,
					groan: 2 + Math.random() * 6,
					speed: zb[4],
					flinch: 0,
					flinchX: 0,
					flinchZ: 0,
					flinchAt: 0
				};
				this.zombies.set(id, view);
			}
			const moved = Math.hypot(x - view.x, z - view.z);
			if (dt > 0) {
				view.vx = (x - view.x) / dt;
				view.vz = (z - view.z) / dt;
			}
			view.x = x;
			view.z = z;
			view.seen = now;
			const stepBefore = view.step;
			view.step += moved * 4.4;
			// tearing at boards is a swing over and over
			view.swing =
				zb[5] & ZOMBIE_ATTACKING
					? Math.min(1, view.swing + dt / ZOMBIE.windup)
					: zb[5] & ZOMBIE_TEARING
						? (view.swing + dt * 1.6) % 1
						: Math.max(0, view.swing - dt * 3);
			const rising = Math.max(0, 1 - (now - view.riseStart) / (ZOMBIE.rise * 1000));
			// bent over to climb through a window
			const lean = zb[5] & ZOMBIE_CLIMBING ? 0.45 : ([0, 0.1, 0.2][view.speed] ?? 0);
			// someone else's hit, seen from the host: a jolt straight back
			if (zb[5] & ZOMBIE_STAGGER && view.flinch < 0.2 && now - view.flinchAt > 400) {
				view.flinch = 0.6;
				view.flinchX = Math.sin(yaw);
				view.flinchZ = Math.cos(yaw);
				view.flinchAt = now;
			}
			view.flinch = Math.max(0, view.flinch - dt * 4);
			// the push, turned into the zombie's own frame
			const c = Math.cos(yaw);
			const s = Math.sin(yaw);
			const push = view.flinch * view.flinch * (3 - 2 * view.flinch);
			zombiePose(view.body.joints, x, y - 1.9 * rising, z, yaw, view.step, view.swing, lean, {
				x: (view.flinchX * c - view.flinchZ * s) * push,
				z: (view.flinchX * s + view.flinchZ * c) * push
			});
			view.body.place();
			const far = Math.hypot(x - this.me.x, z - this.me.z);
			view.groan -= dt;
			if (view.groan <= 0) {
				view.groan = 4 + Math.random() * 8;
				if (far < 30) this.sound.groan({ x, y: 1.6, z });
			}
			// footfalls, from the nearer ones
			if (
				Math.floor(view.step / Math.PI) !== Math.floor(stepBefore / Math.PI) &&
				far < 14 &&
				steps < 3
			) {
				steps++;
				this.sound.zombieStep({ x, y: 0.1, z }, [0.35, 0.6, 0.85][view.speed] ?? 0.5);
			}
		}
		// zombies the host no longer sends, and that did not die on screen
		for (const [id, view] of this.zombies) {
			if (now - view.seen > 1000) {
				view.body.dispose();
				this.zombies.delete(id);
			}
		}

		// ragdolls
		for (const r of this.ragdolls) {
			r.update(dt, this.blocking);
			if (r.age > RAGDOLL_LIFE - 1) r.body.setOpacity(Math.max(0, RAGDOLL_LIFE - r.age));
		}
		const keep = this.ragdolls.filter(
			(r, i) => r.age < RAGDOLL_LIFE && this.ragdolls.length - i <= MAX_RAGDOLLS
		);
		for (const r of this.ragdolls) if (!keep.includes(r)) r.body.dispose();
		this.ragdolls = keep;

		// other players
		const you = this.session.state.you;
		const seen = new Set<string>();
		const before = new Map(a.snap.players.map((p) => [p.id, p]));
		for (const pb of b.snap.players) {
			if (pb.id === you) continue;
			seen.add(pb.id);
			const pa = before.get(pb.id) ?? pb;
			let view = this.others.get(pb.id);
			if (!view) {
				view = {
					body: new Body(this.dynamic, PLAYER_COLORS),
					gun: new HeldGun(this.dynamic),
					label: nameLabel(pb.name),
					badge: badge('PAUSED'),
					away: badge('AWAY'),
					step: 0,
					x: pb.x,
					z: pb.z,
					shots: pb.shots,
					knifes: pb.knifes,
					pose: { ...STANDING, knife: 1 }
				};
				this.dynamic.add(view.label, view.badge, view.away);
				this.others.set(pb.id, view);
			}
			this.drawOther(view, pa, pb, alpha, dt);
		}
		for (const [id, view] of this.others) {
			if (seen.has(id)) continue;
			view.body.dispose();
			view.gun.dispose();
			for (const sprite of [view.label, view.badge, view.away]) {
				sprite.removeFromParent();
				sprite.material.map?.dispose();
				sprite.material.dispose();
			}
			this.others.delete(id);
		}
	}

	private drawOther(view: OtherView, pa: PlayerSnap, pb: PlayerSnap, alpha: number, dt: number) {
		const x = pa.x + (pb.x - pa.x) * alpha;
		const y = pa.y + (pb.y - pa.y) * alpha;
		const z = pa.z + (pb.z - pa.z) * alpha;
		const yaw = lerpAngle(pa.yaw, pb.yaw, alpha);
		const pitch = pa.pitch + (pb.pitch - pa.pitch) * alpha;
		const pose = view.pose;
		const ease = 1 - Math.exp(-dt * 12);
		const to = (now: number, want: number) => now + (want - now) * ease;
		const downed = pb.state === 'downed';
		pose.pitch = pitch;
		pose.crouch = to(pose.crouch, pb.stance === CROUCH || pb.stance === SLIDE ? 1 : 0);
		pose.slide = to(pose.slide, pb.stance === SLIDE ? 1 : 0);
		pose.sprint = to(pose.sprint, pb.flags & POSE_SPRINT ? 1 : 0);
		pose.ads = to(pose.ads, pb.flags & POSE_ADS ? 1 : 0);
		// the reload motion loops while it lasts and finishes its swing after
		if (pb.flags & POSE_RELOAD || (pose.reload > 0 && pose.reload % 1 > 0.05))
			pose.reload += dt * 1.2;
		else pose.reload = 0;
		if (pb.knifes !== view.knifes) {
			view.knifes = pb.knifes;
			pose.knife = 0;
		}
		pose.knife = Math.min(1, pose.knife + dt / 0.28);
		// steps keep time with how fast they're really going, and stop in a slide
		const moved = Math.hypot(x - view.x, z - view.z);
		if (pose.slide < 0.5 && !(pb.flags & POSE_AIR) && !downed) {
			const before = view.step;
			view.step += moved * 3;
			if (Math.floor(view.step / Math.PI) !== Math.floor(before / Math.PI))
				this.sound.footstep('tile', 0.4 + pose.sprint * 0.4 - pose.crouch * 0.25, { x, y, z });
		}
		view.x = x;
		view.z = z;
		const visible = pb.state !== 'dead';
		for (const mesh of view.body.meshes) mesh.visible = visible;
		view.label.visible = visible;
		playerPose(view.body.joints, x, y, z, yaw, view.step, downed, pose);
		view.body.place();
		const top = downed ? 1.2 : 2.25 - pose.crouch * 0.15 - pose.slide * 0.45;
		view.label.position.set(x, y + top, z);
		view.badge.visible = visible && (pb.flags & POSE_PAUSED) !== 0;
		view.badge.position.set(x, y + top + 0.32, z);
		view.away.visible = visible && (pb.flags & POSE_AWAY) !== 0;
		view.away.position.copy(view.badge.position);
		view.gun.setWeapon(pb.weapon);
		// pointed down and across the body at a sprint, tipped up for a reload
		const tipping = pose.reload > 0 ? Math.sin(Math.min(1, pose.reload * 4) * Math.PI * 0.5) : 0;
		view.gun.place(
			hand.fromArray(view.body.joints, J.rHand * 3),
			yaw + pose.sprint * 0.8,
			downed ? pitch : pitch * (1 - pose.sprint) - pose.sprint * 0.7 + tipping * 0.35,
			visible,
			pose.sprint * 0.4 + tipping * 0.6
		);
		view.gun.update(dt);
		if (pb.shots !== view.shots) {
			view.shots = pb.shots;
			this.sound.shot(pb.weapon, { x, y: y + 1.4, z });
			const range = WEAPONS[pb.weapon].range;
			view.gun.fire(this.trace(view.gun.muzzlePoint, view.gun.aim, range).t);
		}
	}

	private kill(id: number, dir: [number, number, number], force: number, head: boolean) {
		this.gone.add(id);
		const view = this.zombies.get(id);
		if (!view) return;
		this.zombies.delete(id);
		this.sound.hit(true);
		this.hud = { ...this.hud, kills: this.hud.kills + 1 };
		const j: Joints = view.body.joints;
		const along = new THREE.Vector3(...dir).normalize();
		if (head) {
			// the head goes, in a burst
			view.body.meshes[HEAD].visible = false;
			this.effects.headPop(new THREE.Vector3().fromArray(j, J.headTop * 3), along);
			this.sound.headPop();
		}
		// and a pool where they drop
		this.effects.decal(
			new THREE.Vector3(view.x + along.x * 0.6, 0, view.z + along.z * 0.6),
			UP,
			'blood',
			1.6
		);
		const v = new Float32Array(j.length);
		for (let i = 0; i < 11; i++) {
			const struck =
				head && (i === J.headTop || i === J.neck)
					? 1.6
					: !head && (i === J.neck || i === J.lShoulder || i === J.rShoulder || i === J.pelvis)
						? 1
						: 0.35;
			v[i * 3] = view.vx * 0.8 + dir[0] * force * struck;
			v[i * 3 + 1] = 0.6 + Math.max(0, dir[1]) * force * struck;
			v[i * 3 + 2] = view.vz * 0.8 + dir[2] * force * struck;
		}
		this.ragdolls.push(new Ragdoll(view.body, v));
	}

	// Blood where a zombie was hit, a mark on whatever is behind it, and the
	// zombie flinching away from the shot, all straight away rather than once
	// the host hears of it.
	private bleed(id: number, at: THREE.Vector3, dir: THREE.Vector3, amount: number, force: number) {
		this.effects.blood(at, dir, amount);
		const behind = this.surface(at, dir, 3);
		if (behind.t < 3 && !behind.door) {
			const spot = at.clone().addScaledVector(dir, behind.t);
			this.effects.decal(spot, behind.normal, 'blood', 0.6 + amount * 0.25);
		}
		const z = this.zombies.get(id);
		if (z) {
			z.flinch = Math.min(1, z.flinch + 0.45 + force * 0.05);
			z.flinchX = dir.x;
			z.flinchZ = dir.z;
			z.flinchAt = performance.now();
		}
	}

	// The first wall or floor along a ray, ignoring zombies.
	private surface(o: THREE.Vector3, d: THREE.Vector3, range: number) {
		const flat = Math.hypot(d.x, d.z);
		let t = flat > 1e-6 ? this.blocking.ray(o.x, o.z, d.x, d.z, range * flat, true) / flat : range;
		if (d.y < 0) t = Math.min(t, -o.y / d.y);
		const at = o.clone().addScaledVector(d, t);
		return { t, normal: this.normalAt(at, d), door: this.onDoor(at, d) };
	}

	// whether a point a ray struck is on a door, which marks shouldn't stick
	// to since it opens
	private onDoor(at: THREE.Vector3, d: THREE.Vector3) {
		const cx = cellOf(at.x + d.x * 0.05);
		const cz = cellOf(at.z + d.z * 0.05);
		return at.y > 0.03 && (this.map.doorAt[cellIndex(cx, cz)] ?? -1) >= 0;
	}

	// Which way the surface faces where a ray struck it: up for the floor,
	// otherwise out of whichever face of the wall cell it crossed.
	private normalAt(at: THREE.Vector3, d: THREE.Vector3) {
		if (at.y < 0.03) return new THREE.Vector3(0, 1, 0);
		const fx = at.x / CELL - Math.floor(at.x / CELL);
		const fz = at.z / CELL - Math.floor(at.z / CELL);
		const toX = Math.min(fx, 1 - fx);
		const toZ = Math.min(fz, 1 - fz);
		return toX < toZ
			? new THREE.Vector3(-Math.sign(d.x) || 1, 0, 0)
			: new THREE.Vector3(0, 0, -Math.sign(d.z) || 1);
	}

	private placeCamera(dt: number, now: number) {
		const me = this.me;
		if (this.life === 'dead') {
			// floats up over where they fell, turning slowly
			this.camera.position.set(me.x, 7, me.z);
			this.camera.rotation.set(-1.1, now / 6000, 0);
		} else {
			const downed = this.life === 'downed';
			let eye = PLAYER.eye + (PLAYER.crouchEye - PLAYER.eye) * this.crouchNow;
			eye += (PLAYER.slideEye - eye) * this.slideNow;
			if (downed) eye = PLAYER.downedEye;
			// the head rises and falls with each step and sways side to side
			// once a stride, less when aiming and not at all in a slide
			const pace = me.ground
				? Math.min(1, this.speedNow / PLAYER.sprint) * (1 - this.ads * 0.8) * (1 - this.slideNow)
				: 0;
			const bobY = (Math.abs(Math.cos(this.stride)) - 0.5) * 0.06 * pace;
			const bobX = Math.sin(this.stride) * 0.03 * pace;
			const cos = Math.cos(me.yaw);
			const sin = Math.sin(me.yaw);
			this.camera.position.set(me.x + cos * bobX, me.y + eye + bobY - this.dip, me.z - sin * bobX);
			// a lean into a strafe and a slide
			const roll = downed
				? 0.12
				: (-this.strafe / PLAYER.sprint) * 0.02 * (1 - this.ads) + this.slideNow * 0.05;
			this.roll += (roll - this.roll) * Math.min(1, dt * 10);
			const r = this.recoil;
			this.camera.rotation.set(
				Math.max(-1.5, Math.min(1.5, me.pitch + r.pitch)),
				me.yaw + r.yaw,
				this.roll + r.punch
			);
		}
		const ears = this.camera.position;
		this.sound.listen(ears.x, ears.y, ears.z, me.yaw);
		const zoom = WEAPONS[this.slot().weapon].adsZoom;
		const fov = settings.get().fov - zoom * this.ads + this.sprintNow * 5 + this.slideNow * 4;
		if (Math.abs(this.camera.fov - fov) > 0.01) {
			this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14);
			this.camera.updateProjectionMatrix();
		}
	}

	// --- the HUD

	private makeHud(): HudState {
		return {
			phase: this.phase,
			round: 0,
			left: 0,
			timer: 0,
			hp: PLAYER.health,
			life: 'alive',
			bleed: 0,
			beingRevived: 0,
			reviving: 0,
			weapon: '',
			mag: 0,
			reserve: 0,
			reloading: false,
			players: [],
			hint: null,
			note: null,
			perks: [],
			instakill: 0,
			double: 0,
			maxHp: PLAYER.health,
			hits: 0,
			kills: 0,
			hurts: 0,
			danger: [],
			pops: [],
			locked: false,
			played: false,
			held: false,
			stats: null,
			isHost: this.session.state.isHost,
			reconnecting: false,
			area: ''
		};
	}

	private dangerMarks(): HudState['danger'] {
		const now = performance.now();
		this.danger = this.danger.filter((d) => now - d.at < DANGER_TIME);
		const fx = -Math.sin(this.me.yaw);
		const fz = -Math.cos(this.me.yaw);
		return this.danger.map((d) => {
			const dx = d.x - this.me.x;
			const dz = d.z - this.me.z;
			const ahead = dx * fx + dz * fz;
			// right is forward turned a quarter clockwise
			const side = dx * -fz + dz * fx;
			return {
				id: d.id,
				angle: (Math.atan2(side, ahead) * 180) / Math.PI,
				left: 1 - (now - d.at) / DANGER_TIME
			};
		});
	}

	private publishHud() {
		const latest = this.snaps.at(-1)?.snap;
		const you = this.session.state.you;
		const mine = latest?.players.find((p) => p.id === you);
		const slot = this.slot();
		const revivingTarget = this.reviving
			? latest?.players.find((p) => p.id === this.reviving)
			: null;
		this.hud = {
			...this.hud,
			phase: this.phase,
			round: latest?.round ?? 0,
			left: latest?.left ?? 0,
			timer: latest?.timer ?? 0,
			hp: this.hp,
			life: this.life,
			bleed: mine?.bleed ?? 0,
			beingRevived: mine?.revive ?? 0,
			reviving: revivingTarget?.revive ?? 0,
			weapon: WEAPONS[slot.weapon].name,
			mag: slot.mag,
			reserve: slot.reserve,
			reloading: this.reloadLeft > 0,
			players: (latest?.players ?? []).map((p) => ({
				id: p.id,
				name: p.name,
				points: p.points,
				kills: p.kills,
				state: p.state,
				you: p.id === you,
				// your own straight away, rather than once the host hears of it
				paused:
					p.id === you
						? this.played && document.pointerLockElement !== this.canvas
						: (p.flags & POSE_PAUSED) !== 0,
				away: (p.flags & POSE_AWAY) !== 0
			})),
			hint: this.hint,
			note: performance.now() < this.noteUntil ? this.hud.note : null,
			perks: PERK_IDS.filter((id) => this.perks & PERKS[id].bit),
			instakill: latest?.instakill ?? 0,
			double: latest?.double ?? 0,
			maxHp: this.perks & PERKS.jugg.bit ? JUGG_HEALTH : PLAYER.health,
			locked: document.pointerLockElement === this.canvas,
			played: this.played,
			held: latest?.held ?? false,
			stats: this.stats,
			// both change when a player takes over from a host that left
			isHost: this.session.state.isHost,
			reconnecting: this.session.state.reconnecting,
			area: this.map.roomName(this.me.x, this.me.z),
			danger: this.dangerMarks()
		};
		for (const l of this.hudListeners) l();
	}
}

const BODY_CAPSULES: [number, number, number][] = [
	[J.pelvis, J.neck, 0.25],
	[J.lHip, J.lFoot, 0.1],
	[J.rHip, J.rFoot, 0.1],
	[J.lShoulder, J.lHand, 0.08],
	[J.rShoulder, J.rHand, 0.08]
];

// scratch, for where another player's right hand is
const hand = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// the head's box, among a body's meshes
const HEAD = 1;

function lerpAngle(a: number, b: number, t: number) {
	let d = b - a;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
}

// a dark pill reading PAUSED, or AWAY
function badge(text: string) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 80;
	const g = canvas.getContext('2d')!;
	g.fillStyle = 'rgba(15, 15, 15, 0.85)';
	g.beginPath();
	g.roundRect(28, 10, 200, 60, 30);
	g.fill();
	g.font = '600 30px "Geist Variable", system-ui, sans-serif';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillStyle = '#fafafa';
	g.letterSpacing = '4px';
	g.fillText(text, 130, 41);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(
		new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
	);
	sprite.scale.set(0.8, 0.25, 1);
	sprite.renderOrder = 6;
	sprite.visible = false;
	return sprite;
}

const POWERUP_NAMES: Record<PowerupKind, string> = {
	ammo: 'Max Ammo',
	instakill: 'Insta-Kill',
	double: 'Double Points',
	nuke: 'Nuke',
	carpenter: 'Carpenter'
};

const DROP_LOOK: Record<PowerupKind, { color: string; text: string }> = {
	ammo: { color: '#3f8f4f', text: 'AMMO' },
	instakill: { color: '#e8e8e8', text: 'KILL' },
	double: { color: '#d4a62a', text: '×2' },
	nuke: { color: '#b53a2e', text: 'NUKE' },
	carpenter: { color: '#8a6a4a', text: 'FIX' }
};

// a power-up on the floor: a glowing block with what it is on every side
function dropMesh(kind: PowerupKind) {
	const look = DROP_LOOK[kind];
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	const g = canvas.getContext('2d')!;
	g.fillStyle = look.color;
	g.fillRect(0, 0, 128, 128);
	g.fillStyle = kind === 'instakill' ? '#1a1a1a' : '#ffffff';
	g.font = `700 ${look.text.length > 2 ? 34 : 60}px "Geist Variable", system-ui, sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(look.text, 64, 68);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const mesh = new THREE.Mesh(
		DROP_BOX,
		new THREE.MeshLambertMaterial({ map: texture, emissive: look.color, emissiveIntensity: 0.6 })
	);
	mesh.castShadow = true;
	return mesh;
}
const DROP_BOX = new THREE.BoxGeometry(0.42, 0.42, 0.42);

function nameLabel(name: string) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 64;
	const g = canvas.getContext('2d')!;
	g.font = '500 30px "Geist Variable", system-ui, sans-serif';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillStyle = PALETTE.ink;
	g.fillText(name, 128, 32);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite(
		new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
	);
	sprite.scale.set(1.2, 0.3, 1);
	sprite.renderOrder = 5;
	return sprite;
}
