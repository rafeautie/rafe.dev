import * as THREE from 'three';
import { Blocking, buildMap, type GameMap } from '../map';
import type { HostMessage, LifeState, Phase, PlayerSnap, Snapshot, ZombieSnap } from '../protocol';
import { ZOMBIE_ATTACKING, ZOMBIE_RISING } from '../protocol';
import { PLAYER, ZOMBIE } from '../rules';
import type { Session } from '../session';
import { settings } from '../settings';
import { KNIFE, WEAPONS, ammoCost, type WeaponId } from '../weapons';
import { Sound } from './audio';
import { Body, J, Ragdoll, playerPose, rayCapsule, zombiePose, type Joints } from './rig';
import { PALETTE, buildWorld, type World } from './scene';
import { VIEW_LAYER, ViewModel } from './viewmodel';

// One player's view of the game: the 3D scene, the controls, and their own
// player, which moves on this machine and tells the host where it is. Zombies
// and other players are drawn a little in the past, between the two latest
// snapshots from the host, so they move smoothly.

const INTERP_DELAY = 110; // ms
const SEND_EVERY = 1 / 30;
const HUD_EVERY = 0.05;
const MOUSE_SPEED = 0.0022;
// how much narrower the view gets when aiming down sights
const ADS_ZOOM = 20;
const RAGDOLL_LIFE = 12;
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
};

export type HudState = {
	phase: Phase;
	round: number;
	left: number;
	timer: number;
	hp: number;
	life: LifeState;
	bleed: number;
	beingRevived: number;
	reviving: number;
	weapon: string;
	mag: number;
	reserve: number;
	reloading: boolean;
	players: HudPlayer[];
	hint: { text: string; muted: boolean } | null;
	note: string | null;
	hits: number;
	kills: number;
	hurts: number;
	pops: { id: number; amount: number }[];
	locked: boolean;
	// whether the mouse has been captured yet this game, so the first
	// click-to-play prompt isn't mistaken for a pause
	played: boolean;
	// everyone is paused, so the game is too
	held: boolean;
	isHost: boolean;
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
};

type OtherView = {
	body: Body;
	label: THREE.Sprite;
	step: number;
	x: number;
	z: number;
	shots: number;
};

type Particle = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number };

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
	private swapLeft = 0;
	private knifeWait = 0;
	private ads = 0;
	private triggerWasDown = false;
	private shots = 0;
	private knifes = 0;
	private reviving: string | null = null;
	private interactWait = 0;
	private speedNow = 0;
	private hint: HudState['hint'] = null;

	private snaps: { at: number; snap: Snapshot; zombies: Map<number, ZombieSnap> }[] = [];
	private zombies = new Map<number, ZombieView>();
	private gone = new Set<number>();
	private ragdolls: Ragdoll[] = [];
	private others = new Map<string, OtherView>();
	private particles: Particle[] = [];

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
				this.sound.deny();
				this.note('Not Enough Points');
				break;
			case 'hurt':
				this.sound.hurt();
				this.hud = { ...this.hud, hurts: this.hud.hurts + 1 };
				break;
			case 'points':
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
			case 'over':
				this.phase = 'over';
				if (document.pointerLockElement === this.canvas) document.exitPointerLock();
				break;
			case 'restart':
				this.blocking.open.fill(false);
				this.world.closeDoors();
				for (const z of this.zombies.values()) z.body.dispose();
				this.zombies.clear();
				for (const r of this.ragdolls) r.body.dispose();
				this.ragdolls = [];
				this.phase = 'break';
				this.life = 'alive';
				this.downedSlot = null;
				break;
		}
	}

	private onSnapshot(snap: Snapshot) {
		// snapshots can arrive out of order; a late one is already out of date
		const last = this.snaps.at(-1);
		if (last && snap.time <= last.snap.time) return;
		const zombies = new Map<number, ZombieSnap>();
		for (const z of snap.zombies) zombies.set(z[0], z);
		this.snaps.push({ at: performance.now(), snap, zombies });
		if (this.snaps.length > 30) this.snaps.shift();
		this.phase = snap.phase;
		const mine = snap.players.find((p) => p.id === this.session.state.you);
		if (!mine) return;
		this.hp = mine.hp;
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
				this.swapLeft = 0.45;
				this.me.vy = 0;
				this.me.y = 0;
			} else if (mine.state === 'alive' && was === 'downed') {
				this.downedSlot = null;
				this.swapLeft = 0.45;
			}
		}
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
		this.swapLeft = 0.45;
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

	private note(text: string) {
		this.noteUntil = performance.now() + 1500;
		this.hud = { ...this.hud, note: text };
	}

	// --- the frame

	private update(dt: number, now: number) {
		const active = document.pointerLockElement === this.canvas && this.phase !== 'over';
		if (active) {
			const { sensitivity, aimSensitivity, invertY } = settings.get();
			const speed = MOUSE_SPEED * sensitivity * (1 + (aimSensitivity - 1) * this.ads);
			this.me.yaw -= this.look.x * speed;
			this.me.pitch -= this.look.y * speed * (invertY ? -1 : 1);
			this.me.pitch = Math.max(-1.45, Math.min(1.45, this.me.pitch));
		}
		this.look.x = this.look.y = 0;

		if (this.life !== 'dead') this.move(dt, active);
		this.weapons(dt, active);
		this.interact(dt, active);

		this.sendWait -= dt;
		if (this.sendWait <= 0) {
			this.sendWait = SEND_EVERY;
			this.session.post({
				t: 'me',
				x: this.me.x,
				y: this.me.y,
				z: this.me.z,
				yaw: this.me.yaw,
				pitch: this.me.pitch,
				weapon: this.slot().weapon,
				shots: this.shots,
				knifes: this.knifes,
				reviving: this.reviving,
				paused: document.pointerLockElement !== this.canvas
			});
		}

		this.drawOthers(dt, now);
		this.updateParticles(dt);
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
		const sprinting = this.sprinting();
		const speed = downed
			? PLAYER.crawl
			: sprinting
				? PLAYER.sprint
				: PLAYER.walk * (1 - this.ads * 0.45);
		const sin = Math.sin(me.yaw);
		const cos = Math.cos(me.yaw);
		const tx = (-sin * fx + cos * sx) * speed;
		const tz = (-cos * fx - sin * sx) * speed;
		const blend = Math.min(1, dt * (me.ground ? 12 : 3));
		me.vx += (tx - me.vx) * blend;
		me.vz += (tz - me.vz) * blend;
		[me.x, me.z] = this.blocking.move(me.x, me.z, me.vx * dt, me.vz * dt, PLAYER.radius);
		// zombies are solid: they can box a player in
		for (const z of this.zombies.values()) {
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

		if (!downed && me.ground && this.pressed.has('Space')) {
			me.vy = PLAYER.jump;
			me.ground = false;
		}
		me.vy -= PLAYER.gravity * dt;
		me.y += me.vy * dt;
		if (me.y <= 0) {
			me.y = 0;
			me.vy = 0;
			me.ground = true;
		}
	}

	private sprinting() {
		return (
			this.life === 'alive' &&
			this.keys.has('ShiftLeft') &&
			this.keys.has('KeyW') &&
			!this.buttons.has(2) &&
			this.reloadLeft <= 0
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
		const aiming = active && !dead && this.buttons.has(2) && !sprinting && this.swapLeft <= 0;
		this.ads += ((aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 12);

		if (this.reloadLeft > 0) {
			this.reloadLeft -= dt;
			if (this.reloadLeft <= 0) {
				const take = Math.min(weapon.mag - slot.mag, slot.reserve);
				slot.mag += take;
				slot.reserve -= take;
			}
		}
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
			this.swapLeft = 0.45;
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
		if (
			wants &&
			!busy &&
			this.reloadLeft <= 0 &&
			this.fireWait <= 0 &&
			!(sprinting && this.speedNow > PLAYER.walk)
		) {
			if (slot.mag > 0) {
				slot.mag--;
				this.fireWait = 60 / weapon.rpm;
				this.fire(weapon);
			} else if (slot.reserve > 0) this.startReload(weapon);
			else if (!this.triggerWasDown) this.sound.empty();
		}
		this.triggerWasDown = trigger;
		if (slot.mag === 0 && slot.reserve > 0 && this.reloadLeft <= 0 && this.fireWait <= 0 && !busy)
			this.startReload(weapon);

		this.view.update(dt, this.viewState(weapon));
	}

	private viewState(weapon: (typeof WEAPONS)[WeaponId]) {
		return {
			ads: this.ads,
			reload: this.reloadLeft > 0 ? 1 - this.reloadLeft / weapon.reload : 0,
			swap: Math.sin((this.swapLeft / 0.45) * Math.PI) * 0.8,
			moving: this.speedNow,
			downed: this.life === 'downed'
		};
	}

	private startReload(weapon: (typeof WEAPONS)[WeaponId]) {
		this.reloadLeft = weapon.reload;
		this.sound.reload();
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
		const hits = new Map<number, { damage: number; head: boolean; point: THREE.Vector3 }>();
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
				if (hit.t < weapon.range)
					this.puff(origin.clone().addScaledVector(dir, hit.t), '#9a9a9a', 3);
				continue;
			}
			const prior = hits.get(hit.zombie) ?? { damage: 0, head: false, point: new THREE.Vector3() };
			prior.damage += weapon.damage * (hit.head ? weapon.headshot : 1);
			prior.head ||= hit.head;
			prior.point.copy(origin).addScaledVector(dir, hit.t);
			hits.set(hit.zombie, prior);
		}
		for (const [zombie, h] of hits) {
			this.puff(h.point, '#6e2a2a', h.head ? 7 : 4);
			this.session.post({
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
		// the view climbs a little with each shot
		this.me.pitch = Math.min(1.45, this.me.pitch + weapon.kick * (1 - this.ads * 0.4));
		this.me.yaw += (Math.random() - 0.5) * weapon.kick * 0.4;
	}

	// The nearest zombie a ray hits before a wall, if any.
	private trace(o: THREE.Vector3, d: THREE.Vector3, range: number) {
		const flat = Math.hypot(d.x, d.z);
		let wall = flat > 1e-6 ? this.blocking.ray(o.x, o.z, d.x, d.z, range * flat) / flat : range;
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
		this.puff(new THREE.Vector3(z.x, 1.3, z.z), '#6e2a2a', 5);
		this.sound.hit(false);
		this.hud = { ...this.hud, hits: this.hud.hits + 1 };
		this.session.post({
			t: 'hit',
			zombie: target,
			damage: KNIFE.damage,
			head: false,
			knife: true,
			dir: [fx, 0.2, fz],
			force: KNIFE.force
		});
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
			if (door) {
				hint = { text: `Press F to Open Door · ${door.cost}`, muted: points < door.cost };
				if (press) {
					this.interactWait = 0.4;
					if (points < door.cost) {
						this.sound.deny();
						this.note('Not Enough Points');
					} else this.session.post({ t: 'buyDoor', door: door.index });
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
						if (points < cost) {
							this.sound.deny();
							this.note('Not Enough Points');
						} else this.session.post({ t: 'buyWeapon', wall: wall.index, owned });
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
		for (const [id, zb] of b.zombies) {
			if (this.gone.has(id)) continue;
			const za = a.zombies.get(id) ?? zb;
			const x = za[1] + (zb[1] - za[1]) * alpha;
			const z = za[2] + (zb[2] - za[2]) * alpha;
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
					speed: zb[4]
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
			view.step += moved * 4.4;
			view.swing =
				zb[5] & ZOMBIE_ATTACKING
					? Math.min(1, view.swing + dt / ZOMBIE.windup)
					: Math.max(0, view.swing - dt * 3);
			const rising = Math.max(0, 1 - (now - view.riseStart) / (ZOMBIE.rise * 1000));
			const lean = [0, 0.1, 0.2][view.speed] ?? 0;
			zombiePose(view.body.joints, x, -1.9 * rising, z, yaw, view.step, view.swing, lean);
			view.body.place();
			view.groan -= dt;
			if (view.groan <= 0) {
				view.groan = 4 + Math.random() * 8;
				this.sound.groan(1 - Math.hypot(x - this.me.x, z - this.me.z) / 22);
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
					label: nameLabel(pb.name),
					step: 0,
					x: pb.x,
					z: pb.z,
					shots: pb.shots
				};
				this.dynamic.add(view.label);
				this.others.set(pb.id, view);
			}
			this.drawOther(view, pa, pb, alpha);
		}
		for (const [id, view] of this.others) {
			if (seen.has(id)) continue;
			view.body.dispose();
			view.label.removeFromParent();
			view.label.material.map?.dispose();
			view.label.material.dispose();
			this.others.delete(id);
		}
	}

	private drawOther(view: OtherView, pa: PlayerSnap, pb: PlayerSnap, alpha: number) {
		const x = pa.x + (pb.x - pa.x) * alpha;
		const y = pa.y + (pb.y - pa.y) * alpha;
		const z = pa.z + (pb.z - pa.z) * alpha;
		const yaw = lerpAngle(pa.yaw, pb.yaw, alpha);
		view.step += Math.hypot(x - view.x, z - view.z) * 3.6;
		view.x = x;
		view.z = z;
		const visible = pb.state !== 'dead';
		for (const mesh of view.body.meshes) mesh.visible = visible;
		view.label.visible = visible;
		playerPose(view.body.joints, x, y, z, yaw, view.step, pb.state === 'downed');
		view.body.place();
		view.label.position.set(x, y + (pb.state === 'downed' ? 1.2 : 2.25), z);
		if (pb.shots !== view.shots) {
			view.shots = pb.shots;
			const d = Math.hypot(x - this.me.x, z - this.me.z);
			this.sound.shot(pb.weapon, Math.max(0.08, 1 - d / 40) * 0.6);
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

	private puff(at: THREE.Vector3, color: string, count: number) {
		for (let i = 0; i < count; i++) {
			const mesh =
				this.particles.length > 80
					? this.particles.shift()!.mesh
					: new THREE.Mesh(PARTICLE, new THREE.MeshBasicMaterial({ color, transparent: true }));
			(mesh.material as THREE.MeshBasicMaterial).color.set(color);
			mesh.position.copy(at);
			mesh.scale.setScalar(0.5 + Math.random());
			this.dynamic.add(mesh);
			this.particles.push({
				mesh,
				vx: (Math.random() - 0.5) * 2.5,
				vy: Math.random() * 2.5,
				vz: (Math.random() - 0.5) * 2.5,
				life: 0.35 + Math.random() * 0.3
			});
		}
	}

	private updateParticles(dt: number) {
		this.particles = this.particles.filter((p) => {
			p.life -= dt;
			if (p.life <= 0) {
				p.mesh.removeFromParent();
				(p.mesh.material as THREE.Material).dispose();
				return false;
			}
			p.vy -= 9 * dt;
			p.mesh.position.x += p.vx * dt;
			p.mesh.position.y = Math.max(0.02, p.mesh.position.y + p.vy * dt);
			p.mesh.position.z += p.vz * dt;
			(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 3);
			return true;
		});
	}

	private placeCamera(dt: number, now: number) {
		const me = this.me;
		if (this.life === 'dead') {
			// floats up over where they fell, turning slowly
			this.camera.position.set(me.x, 7, me.z);
			this.camera.rotation.set(-1.1, now / 6000, 0);
		} else {
			const eye = this.life === 'downed' ? PLAYER.downedEye : PLAYER.eye;
			const bob = me.ground ? Math.sin(now / 95) * Math.min(1, this.speedNow / 6) * 0.035 : 0;
			this.camera.position.set(me.x, me.y + eye + bob, me.z);
			this.camera.rotation.set(me.pitch, me.yaw, this.life === 'downed' ? 0.12 : 0);
		}
		const fov = settings.get().fov - ADS_ZOOM * this.ads + (this.sprinting() ? 4 : 0);
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
			hits: 0,
			kills: 0,
			hurts: 0,
			pops: [],
			locked: false,
			played: false,
			held: false,
			isHost: this.session.state.isHost,
			area: ''
		};
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
				you: p.id === you
			})),
			hint: this.hint,
			note: performance.now() < this.noteUntil ? this.hud.note : null,
			locked: document.pointerLockElement === this.canvas,
			played: this.played,
			held: latest?.held ?? false,
			area: this.map.roomName(this.me.x, this.me.z)
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

const PARTICLE = new THREE.BoxGeometry(0.05, 0.05, 0.05);

function lerpAngle(a: number, b: number, t: number) {
	let d = b - a;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
}

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
