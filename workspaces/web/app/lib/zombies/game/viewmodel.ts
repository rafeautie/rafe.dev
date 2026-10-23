import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../weapons';

// The gun in the player's hands, and the knife. Plain dark boxes, drawn over
// the world, that kick, sway, dip for a reload and come up to the eye when
// aiming.

const HIP = new THREE.Vector3(0.2, -0.2, -0.42);
const ADS = new THREE.Vector3(0, -0.115, -0.32);

export class ViewModel {
	readonly root = new THREE.Group();
	private gun = new THREE.Group();
	private body: THREE.Mesh;
	private barrel: THREE.Mesh;
	private grip: THREE.Mesh;
	private sight: THREE.Mesh;
	private flash: THREE.Mesh;
	private light: THREE.PointLight;
	private knife: THREE.Mesh;
	private kick = 0;
	private flashTime = 0;
	private knifeTime = -1;
	private bobTime = 0;
	private weapon: WeaponId | null = null;

	constructor() {
		const dark = new THREE.MeshLambertMaterial({ color: '#2f2f2f' });
		const darker = new THREE.MeshLambertMaterial({ color: '#232323' });
		this.body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dark);
		this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), darker);
		this.barrel.rotation.x = Math.PI / 2;
		this.grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), darker);
		this.grip.rotation.x = 0.25;
		this.sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.02), darker);
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
		this.gun.add(this.body, this.barrel, this.grip, this.sight, this.flash, this.light);
		this.knife = new THREE.Mesh(
			new THREE.BoxGeometry(0.025, 0.035, 0.3),
			new THREE.MeshLambertMaterial({ color: '#8c8c8c' })
		);
		this.knife.visible = false;
		this.root.add(this.gun, this.knife);
		// drawn last, over walls it would otherwise poke into
		this.root.traverse((o) => {
			o.renderOrder = 10;
			if (o instanceof THREE.Mesh) (o.material as THREE.Material).depthTest = false;
		});
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
		const muzzle = -len - len * 0.4 - 0.02;
		this.flash.position.set(0, 0.012, muzzle);
		this.light.position.set(0, 0.05, muzzle);
	}

	fire(kick: number) {
		this.kick = Math.min(1, this.kick + 0.35 + kick * 6);
		this.flashTime = 0.05;
		this.flash.rotation.z = Math.random() * Math.PI;
		this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
	}

	stab() {
		this.knifeTime = 0;
	}

	// ads, reload and swap run 0 to 1; moving is the player's speed in m/s
	update(
		dt: number,
		s: { ads: number; reload: number; swap: number; moving: number; downed: boolean }
	) {
		this.bobTime += dt * (2 + s.moving * 1.6);
		this.kick = Math.max(0, this.kick - dt * 9);
		const bob = Math.min(1, s.moving / 5) * (1 - s.ads * 0.85);
		const pos = HIP.clone().lerp(ADS, s.ads);
		pos.x += Math.sin(this.bobTime) * 0.012 * bob;
		pos.y += Math.abs(Math.cos(this.bobTime)) * 0.012 * bob - this.kick * 0.012;
		pos.z += this.kick * 0.05;
		// lowered for a reload or a swap
		const dip = Math.sin(Math.min(1, s.reload) * Math.PI) * 0.6 + s.swap;
		pos.y -= dip * 0.18;
		if (s.downed) pos.x += 0.04;
		this.gun.position.copy(pos);
		this.gun.rotation.set(this.kick * 0.12 - dip * 0.5, 0, s.downed ? 0.25 : 0);

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
