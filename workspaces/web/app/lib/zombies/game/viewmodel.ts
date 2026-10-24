import * as THREE from 'three';
import { WEAPONS, type ReloadStyle, type WeaponId } from '../weapons';

// The gun in the player's hands, and the knife. Plain dark boxes, drawn over
// the world, that kick, sway behind the mouse, bob with each step, drop for
// a sprint, a reload or a landing, and come up to the eye when aiming.

const HIP = new THREE.Vector3(0.2, -0.2, -0.42);
const ADS = new THREE.Vector3(0, -0.115, -0.32);
export const VIEW_LAYER = 1;
const KICK_STIFF = 320;
const KICK_DAMP = 22;

// ads, reload, swap, sprint, crouch and slide run 0 to 1; moving is the
// player's speed in m/s; stride is the step cycle; dip is how far a landing
// has pushed the view down; turnX and turnY are how fast the mouse is turning
export type ViewState = {
	ads: number;
	reload: number;
	reloadStyle: ReloadStyle;
	// the magazine pulled out, 0 to 1
	magOut: number;
	// a jolt as a shell goes in or a slide is let go, 0 to 1
	pulse: number;
	swap: number;
	moving: number;
	downed: boolean;
	sprint: number;
	crouch: number;
	slide: number;
	stride: number;
	dip: number;
	turnX: number;
	turnY: number;
};

function clamp(v: number, most: number) {
	return Math.max(-most, Math.min(most, v));
}

export class ViewModel {
	readonly root = new THREE.Group();
	private gun = new THREE.Group();
	private body: THREE.Mesh;
	private barrel: THREE.Mesh;
	private grip: THREE.Mesh;
	private sight: THREE.Mesh;
	private mag: THREE.Mesh;
	private flash: THREE.Mesh;
	private light: THREE.PointLight;
	private knife: THREE.Mesh;
	private kick = 0;
	private kickV = 0;
	private sway = { x: 0, y: 0 };
	private flashTime = 0;
	private knifeTime = -1;
	private bobTime = 0;
	private weapon: WeaponId | null = null;
	private magHome = new THREE.Vector3();

	constructor() {
		const dark = new THREE.MeshLambertMaterial({ color: '#2f2f2f' });
		const darker = new THREE.MeshLambertMaterial({ color: '#232323' });
		this.body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
		this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), darker);
		this.barrel.rotation.x = Math.PI / 2;
		this.grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), darker);
		this.grip.rotation.x = 0.25;
		this.sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.02), darker);
		this.mag = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), darker);
		this.flash = new THREE.Mesh(
			new THREE.PlaneGeometry(0.16, 0.16),
			new THREE.MeshBasicMaterial({
				color: '#fff3d6',
				transparent: true,
				opacity: 0.9,
				depthWrite: false,
				blending: THREE.AdditiveBlending
			})
		);
		this.flash.visible = false;
		this.light = new THREE.PointLight('#fff1d0', 0, 8, 2);
		this.gun.add(this.body, this.barrel, this.grip, this.sight, this.mag, this.flash, this.light);
		this.knife = new THREE.Mesh(
			new THREE.BoxGeometry(0.025, 0.035, 0.3),
			new THREE.MeshLambertMaterial({ color: '#8c8c8c' })
		);
		this.knife.visible = false;
		this.root.add(this.gun, this.knife);
		// drawn in a pass of its own after the world, over walls and zombies it
		// would otherwise poke into; the muzzle light still lights the world
		this.root.traverse((o) => o.layers.set(VIEW_LAYER));
		this.light.layers.enable(0);
	}

	setWeapon(id: WeaponId) {
		if (this.weapon === id) return;
		this.weapon = id;
		const len = WEAPONS[id].length;
		this.body.scale.set(0.055, 0.075, len);
		this.body.position.set(0, 0, -len / 2 + 0.05);
		this.barrel.scale.set(1, len * 0.4 + 0.05, 1);
		this.barrel.position.set(0, 0.012, -len - (len * 0.4 + 0.05) / 2 + 0.05);
		this.grip.position.set(0, -0.08, -0.02);
		this.sight.position.set(0, 0.048, -len * 0.4);
		// a pistol's magazine is in the grip; a long gun's in front of it
		const w = WEAPONS[id];
		const style = w.reloadStyle;
		this.mag.visible =
			style === 'mag' || style === 'pistol' || style === 'cell' || style === 'belt';
		if (style === 'pistol') this.mag.scale.set(0.035, 0.1, 0.045);
		else if (style === 'belt') this.mag.scale.set(0.09, 0.08, 0.1);
		else if (style === 'cell') this.mag.scale.set(0.05, 0.05, 0.08);
		else this.mag.scale.set(0.035, 0.11, 0.05);
		this.magHome.set(
			style === 'belt' ? 0.06 : 0,
			style === 'pistol' ? -0.1 : -0.09,
			style === 'pistol' ? -0.02 : -len * 0.35
		);
		this.mag.position.copy(this.magHome);
		(this.flash.material as THREE.MeshBasicMaterial).color.set(w.tracer ?? '#fff3d6');
		this.light.color.set(w.tracer ?? '#fff1d0');
		const muzzle = -len - len * 0.4 - 0.02;
		this.flash.position.set(0, 0.012, muzzle);
		this.light.position.set(0, 0.05, muzzle);
	}

	fire(kick: number) {
		// a shove back and up that a stiff spring brings back, overshooting a
		// touch, rather than a jump and a slide
		this.kickV += (0.35 + kick * 6) * 34;
		this.flashTime = 0.05;
		this.flash.rotation.z = Math.random() * Math.PI;
		this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
	}

	stab() {
		this.knifeTime = 0;
	}

	update(dt: number, s: ViewState) {
		this.bobTime += dt;
		this.kickV += (-KICK_STIFF * this.kick - KICK_DAMP * this.kickV) * dt;
		this.kick = Math.min(1.2, this.kick + this.kickV * dt);
		const ease = 1 - Math.exp(-dt * 10);
		const steady = 1 - s.ads * 0.85;
		// the gun trails a quick turn of the mouse and catches up
		this.sway.x += (clamp(-s.turnX * 0.012, 0.05) - this.sway.x) * ease;
		this.sway.y += (clamp(s.turnY * 0.012, 0.05) - this.sway.y) * ease;
		const kick = Math.max(0, this.kick);
		const bob = Math.min(1, s.moving / 5) * steady * (1 - s.slide);
		const pos = HIP.clone().lerp(ADS, s.ads);
		// a figure of eight with each pair of steps, bigger at a sprint
		const big = 1 + s.sprint * 1.2;
		pos.x += Math.sin(s.stride) * 0.011 * bob * big + this.sway.x * steady;
		pos.y +=
			-Math.abs(Math.cos(s.stride)) * 0.01 * bob * big +
			this.sway.y * steady +
			Math.sin(this.bobTime * 1.6) * 0.0025 * steady -
			this.kick * 0.012;
		pos.z += this.kick * (0.05 - s.ads * 0.02);
		// each kind of gun is reloaded its own way; a is how far into the
		// motion it is, easing in and out
		const a = s.reload > 0 ? Math.sin(Math.min(1, s.reload) * Math.PI) : 0;
		const r = reloadMotion(s.reloadStyle, a, s.pulse);
		pos.x += r.x;
		pos.y += r.y;
		pos.z += r.z;
		this.mag.position.copy(this.magHome);
		this.mag.position.y -= s.magOut * 0.3;
		this.mag.position.x -= s.magOut * 0.05;
		// lowered for a swap, and for a landing
		const dip = s.swap;
		pos.y -= dip * 0.18 + s.dip * 0.35;
		// held low and across the body at a sprint
		pos.x -= s.sprint * 0.07;
		pos.y -= s.sprint * 0.05;
		pos.z += s.sprint * 0.04;
		pos.x -= s.slide * 0.03;
		if (s.downed) pos.x += 0.04;
		this.gun.position.copy(pos);
		this.gun.rotation.set(
			kick * 0.12 - dip * 0.5 - s.dip * 0.8 - s.sprint * 0.4 + this.sway.y * 2 * steady + r.rx,
			s.sprint * 0.75 + this.sway.x * 2 * steady + r.ry,
			(s.downed ? 0.25 : 0) + s.sprint * 0.35 + s.slide * 0.3 + s.crouch * 0.04 + r.rz
		);

		this.flashTime -= dt;
		this.flash.visible = this.flashTime > 0;
		this.light.intensity = this.flashTime > 0 ? 3 : 0;

		if (this.knifeTime >= 0) {
			this.knifeTime += dt;
			const t = this.knifeTime / 0.28;
			this.knife.visible = t < 1;
			// a short slash, right to left
			this.knife.position.set(
				0.25 - t * 0.4,
				-0.16 + Math.sin(t * Math.PI) * 0.06,
				-0.38 - Math.sin(t * Math.PI) * 0.12
			);
			this.knife.rotation.set(-0.2, 0.9 - t * 1.4, 0.5);
			this.gun.position.y -= Math.sin(Math.min(1, t) * Math.PI) * 0.15;
			if (t >= 1) this.knifeTime = -1;
		}
	}
}

// How the gun moves through a reload, by kind: a magazine gun rolled over to
// swap it, a shotgun tipped up to feed shells, a break-action opened nose
// down, a machine gun lifted to lay in a belt. a runs 0 to 1 and back over
// the reload; pulse is a shell or a slide's jolt.
function reloadMotion(style: ReloadStyle, a: number, pulse: number) {
	const m = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
	switch (style) {
		case 'mag':
		case 'cell':
			m.y = -a * 0.06;
			m.rx = a * 0.15;
			m.rz = a * 0.45;
			break;
		case 'pistol':
			m.y = -a * 0.05;
			m.rx = a * 0.25;
			m.rz = a * 0.2;
			break;
		case 'shells':
			m.x = -a * 0.04;
			m.y = -a * 0.05;
			m.rx = a * 0.25;
			m.rz = a * 0.7;
			break;
		case 'break':
			m.y = -a * 0.04;
			m.rx = -a * 0.7;
			break;
		case 'belt':
			m.y = a * 0.03;
			m.rx = a * 0.3;
			m.rz = a * 0.3;
			break;
	}
	// a shell or slide: knocked back a touch, nose kicking up
	m.z += pulse * 0.025;
	m.rx += pulse * 0.08;
	return m;
}
