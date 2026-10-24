import * as THREE from 'three';
import { WEAPONS, type WeaponId } from '../weapons';

// Another player's gun, held out in their right hand and pointed where they
// look, with a flash at the muzzle and a streak to where the shot went each
// time they fire.

const FLASH_TIME = 0.06;
const TRACER_TIME = 0.08;

const dark = new THREE.MeshLambertMaterial({ color: '#262626' });
const box = new THREE.BoxGeometry(1, 1, 1);

export class HeldGun {
	private gun = new THREE.Group();
	private body = new THREE.Mesh(box, dark);
	private flash: THREE.Mesh;
	private tracer: THREE.Mesh;
	private flashTime = 0;
	private tracerTime = 0;
	private weapon: WeaponId | null = null;
	private length = 0;
	private muzzle = new THREE.Vector3();
	private dir = new THREE.Vector3();

	constructor(parent: THREE.Object3D) {
		this.body.castShadow = true;
		this.gun.rotation.order = 'YXZ';
		this.flash = new THREE.Mesh(
			new THREE.PlaneGeometry(0.3, 0.3),
			new THREE.MeshBasicMaterial({
				color: '#fff3d6',
				transparent: true,
				opacity: 0.9,
				depthWrite: false,
				side: THREE.DoubleSide,
				blending: THREE.AdditiveBlending
			})
		);
		this.flash.visible = false;
		this.gun.add(this.body, this.flash);
		this.tracer = new THREE.Mesh(
			box,
			new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, depthWrite: false })
		);
		this.tracer.visible = false;
		parent.add(this.gun, this.tracer);
	}

	setWeapon(id: WeaponId) {
		if (this.weapon === id) return;
		this.weapon = id;
		// a little longer than in first person, to read from across a room
		this.length = WEAPONS[id].length * 1.2 + 0.1;
		this.body.scale.set(0.07, 0.09, this.length);
		this.body.position.set(0, 0, -this.length / 2);
		this.flash.position.set(0, 0, -this.length - 0.08);
		const tint = WEAPONS[id].tracer ?? '#fff6e0';
		(this.tracer.material as THREE.MeshBasicMaterial).color.set(tint);
		(this.flash.material as THREE.MeshBasicMaterial).color.set(WEAPONS[id].tracer ?? '#fff3d6');
	}

	// hand is where the right hand is, in the world; yaw and pitch are where
	// the gun points, roll how far it's tipped on its side
	place(hand: THREE.Vector3, yaw: number, pitch: number, visible: boolean, roll = 0) {
		this.gun.visible = visible;
		this.gun.position.copy(hand);
		this.gun.rotation.set(pitch, yaw, roll);
		this.dir.set(0, 0, -1).applyEuler(this.gun.rotation);
		this.muzzle.copy(hand).addScaledVector(this.dir, this.length + 0.05);
	}

	get muzzlePoint() {
		return this.muzzle;
	}

	get aim() {
		return this.dir;
	}

	// distance is how far the shot went before it hit something
	fire(distance: number) {
		this.flashTime = FLASH_TIME;
		this.flash.rotation.z = Math.random() * Math.PI;
		this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
		const d = Math.max(0.5, distance);
		this.tracer.scale.set(0.02, 0.02, d);
		this.tracer.position.copy(this.muzzle).addScaledVector(this.dir, d / 2);
		this.tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
		this.tracerTime = TRACER_TIME;
	}

	update(dt: number) {
		this.flashTime -= dt;
		this.flash.visible = this.gun.visible && this.flashTime > 0;
		this.tracerTime -= dt;
		this.tracer.visible = this.tracerTime > 0;
		(this.tracer.material as THREE.MeshBasicMaterial).opacity =
			Math.max(0, this.tracerTime / TRACER_TIME) * 0.7;
	}

	dispose() {
		this.gun.removeFromParent();
		this.tracer.removeFromParent();
		(this.flash.material as THREE.Material).dispose();
		this.flash.geometry.dispose();
		(this.tracer.material as THREE.Material).dispose();
	}
}
