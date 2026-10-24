import * as THREE from 'three';
import { WEAPONS, type ReloadStyle, type WeaponId } from '../weapons';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GunModel, Kit } from './guns';

// The gun in the player's hands, and the knife, drawn over the world: they
// kick, sway behind the mouse, bob with each step, drop for a sprint, a
// reload or a landing, and come up to the eye when aiming. With the gun
// models loaded they're real guns held in two gloved hands; without, plain
// dark boxes.

const HIP = new THREE.Vector3(0.2, -0.2, -0.42);
const ADS = new THREE.Vector3(0, -0.115, -0.32);
// where the right hand holds a real gun, from the hip and aimed
const MODEL_HIP = new THREE.Vector3(0.16, -0.17, -0.34);
// where each elbow sits, out of sight below the view
const ELBOW_R = new THREE.Vector3(0.2, -0.42, 0.05);
const ELBOW_L = new THREE.Vector3(-0.16, -0.42, -0.08);
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

const AIMED = new THREE.Vector3();
const HAND_R = new THREE.Vector3();
const HAND_L = new THREE.Vector3();
const REACH = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BASIS = new THREE.Matrix4();
const TO_WRIST = new THREE.Vector3();
const ALONG_R = new THREE.Vector3();
const ALONG_L = new THREE.Vector3();

// A forearm in a sleeve and a gloved fist, reaching from an elbow below the
// view to close round whatever the hand holds.
class Arm {
	readonly root = new THREE.Group();
	private forearm: THREE.Mesh;
	private hand = new THREE.Group();
	private dir = new THREE.Vector3();
	private across = new THREE.Vector3();
	private wrist = new THREE.Vector3();

	constructor(kit: Kit, side: 1 | -1) {
		// tapering from the elbow to the wrist, with a cuff at the end
		const sleeve = new THREE.CylinderGeometry(0.033, 0.048, 1, 12, 1, true);
		sleeve.translate(0, -0.5, 0);
		this.forearm = new THREE.Mesh(sleeve, kit.sleeve);
		const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.035, 12), kit.sleeve);
		cuff.rotation.x = Math.PI / 2;
		cuff.position.z = 0.055;
		// the fist: its length runs along what it holds, x across the back
		// of the hand, z back toward the wrist
		const fist = new THREE.Mesh(new RoundedBoxGeometry(0.048, 0.088, 0.078, 2, 0.016), kit.glove);
		const knuckles = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.084, 0.03, 2, 0.012), kit.glove);
		knuckles.position.set(0.012, 0, -0.038);
		const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 4, 8), kit.glove);
		thumb.rotation.x = Math.PI / 2;
		thumb.position.set(-0.024, 0.045 * side, -0.01);
		this.hand.add(cuff, fist, knuckles, thumb);
		this.root.add(this.forearm, this.hand);
		this.root.traverse((o) => o.layers.set(VIEW_LAYER));
	}

	// hold is where the fist closes, along is the line of what it holds
	place(hold: THREE.Vector3, along: THREE.Vector3, elbow: THREE.Vector3) {
		// the forearm's line, square to what's held
		this.dir.subVectors(elbow, hold);
		this.dir.addScaledVector(along, -this.dir.dot(along)).normalize();
		this.across.crossVectors(along, this.dir);
		BASIS.makeBasis(this.across, along, this.dir);
		this.hand.position.copy(hold);
		this.hand.quaternion.setFromRotationMatrix(BASIS);
		this.wrist.copy(hold).addScaledVector(this.dir, 0.06);
		const reach = TO_WRIST.subVectors(this.wrist, elbow);
		const length = reach.length();
		this.forearm.position.copy(this.wrist);
		this.forearm.quaternion.setFromUnitVectors(UP, reach.divideScalar(length));
		this.forearm.scale.set(1, length, 1);
	}
}

// A combat knife: a steel blade, a guard and a dark handle, held at the
// handle's end.
function combatKnife(kit: Kit) {
	const knife = new THREE.Group();
	const steel = new THREE.MeshStandardMaterial({
		color: '#c9c9c4',
		metalness: 0.6,
		roughness: 0.4
	});
	const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.18), steel);
	blade.position.z = -0.11;
	const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.04, 4), steel);
	tip.rotation.x = -Math.PI / 2;
	tip.scale.x = 0.2;
	tip.position.z = -0.22;
	const guard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), steel);
	guard.position.z = -0.015;
	const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8), kit.glove);
	handle.rotation.x = Math.PI / 2;
	handle.position.z = 0.04;
	knife.add(blade, tip, guard, handle);
	knife.traverse((o) => o.layers.set(VIEW_LAYER));
	return knife;
}

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
	// the real gun and its parts, when the models are loaded
	private model: GunModel | null = null;
	private shown: THREE.Object3D | null = null;
	private modelMag: THREE.Object3D | null = null;
	private modelMagHome = new THREE.Vector3();
	// the middle of the magazine at rest, from the grip
	private magCentre = new THREE.Vector3();
	private right: Arm | null = null;
	private left: Arm | null = null;
	private blade: THREE.Object3D | null = null;

	constructor(private kit: Kit | null = null) {
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
		if (kit) {
			this.right = new Arm(kit, 1);
			this.left = new Arm(kit, -1);
			this.root.add(this.right.root, this.left.root);
			this.knife.visible = false;
			this.blade = combatKnife(kit);
			this.blade.visible = false;
			this.root.add(this.blade);
		}
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
		if (this.kit) this.showModel(this.kit.guns[id], style);
	}

	// Swaps the boxes for the real gun. A gun whose magazine doesn't come
	// apart (a pistol's sits in the grip) keeps the box one, seen only once
	// it's pulled.
	private showModel(model: GunModel, style: ReloadStyle) {
		this.shown?.removeFromParent();
		this.model = model;
		const shown = model.gun.clone();
		shown.traverse((o) => o.layers.set(VIEW_LAYER));
		this.shown = shown;
		this.gun.add(shown);
		for (const box of [this.body, this.barrel, this.grip, this.sight]) box.visible = false;
		this.modelMag = shown.getObjectByName('mag') ?? null;
		if (this.modelMag) {
			this.mag.visible = false;
			this.modelMagHome.copy(this.modelMag.position);
			shown.updateMatrixWorld(true);
			new THREE.Box3().setFromObject(this.modelMag).getCenter(this.magCentre);
			shown.worldToLocal(this.magCentre);
		} else {
			this.magHome.set(0, -0.05, 0.01);
			this.mag.position.copy(this.magHome);
			this.magCentre.set(0, -0.08, 0);
		}
		this.mag.visible = this.mag.visible && !this.modelMag && style === 'pistol';
		this.flash.position.copy(model.muzzle);
		this.light.position.copy(model.muzzle);
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
		const model = this.model;
		const pos = model
			? MODEL_HIP.clone().lerp(
					AIMED.set(0, -model.sight - 0.004, -Math.max(0.3, model.back + 0.1)),
					s.ads
				)
			: HIP.clone().lerp(ADS, s.ads);
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
		if (model && !this.modelMag) this.mag.visible = s.magOut > 0.02 && s.reloadStyle === 'pistol';
		if (this.modelMag) {
			this.modelMag.position.copy(this.modelMagHome);
			this.modelMag.position.y -= s.magOut * 0.3;
			this.modelMag.position.x -= s.magOut * 0.05;
		}
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
		if (model) this.hands(s, a);
	}

	// Puts the gloved hands on the gun: the right on the grip, the left on
	// the fore end, reaching for the magazine through a reload and taking
	// the knife for a slash.
	private hands(s: ViewState, a: number) {
		const model = this.model!;
		const right = this.right!;
		const left = this.left!;
		const blade = this.blade!;
		this.knife.visible = false;
		this.gun.updateMatrix();
		const at = (p: THREE.Vector3) => p.applyMatrix4(this.gun.matrix);
		const grip = at(HAND_R.set(0, 0, 0));
		const hold = HAND_L.copy(model.fore);
		const reach = s.reloadStyle === 'break' ? 0 : a;
		if (reach > 0) {
			// down to the magazine, following it out and back in
			const mag = REACH.copy(this.magCentre);
			mag.y -= s.magOut * 0.3;
			mag.x -= s.magOut * 0.05;
			if (s.reloadStyle === 'shells') mag.set(0.02, -0.02, model.fore.z * 0.55);
			hold.lerp(mag, Math.min(1, reach * 1.6));
		}
		at(hold);
		// the right fist closes round the grip, which leans back a touch; the
		// left round the fore end, or under the right on a handgun
		const handgun = model.fore.z > -0.1;
		const along = ALONG_R.set(0, 1, 0.3).normalize().transformDirection(this.gun.matrix);
		const alongL = ALONG_L.copy(
			handgun ? ALONG_R : ALONG_L.set(0, 0, -1).transformDirection(this.gun.matrix)
		);
		const slashing = this.knifeTime >= 0;
		blade.visible = slashing;
		if (slashing) {
			blade.position.copy(this.knife.position);
			blade.rotation.copy(this.knife.rotation);
			blade.updateMatrix();
			hold.set(0, 0, 0.04).applyMatrix4(blade.matrix);
			alongL.set(0, 0, -1).transformDirection(blade.matrix);
		}
		right.place(grip, along, ELBOW_R);
		left.place(hold, alongL, ELBOW_L);
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
