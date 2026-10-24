import * as THREE from 'three';
import { WALL_HEIGHT } from '../map';

// Short-lived things the world shows when something happens: blood when a
// zombie is hit, a head bursting, marks left on walls and floors, dust where
// a bullet hits a wall, the glow of a power-up. Each is one method, so the
// look behind it can be swapped for sprites or models without the game
// noticing.

const CHUNK = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const MARK = new THREE.PlaneGeometry(1, 1);
const MAX_PARTICLES = 160;
const MAX_MARKS = 90;
const MARK_LIFE = 40; // seconds before a mark starts to fade

type Particle = {
	mesh: THREE.Mesh;
	vx: number;
	vy: number;
	vz: number;
	life: number;
};

type Mark = { mesh: THREE.Mesh; age: number };

export const BLOOD = '#6e2a2a';
const BLOOD_DARK = '#4a1717';
const DUST = '#9a9a9a';

// a soft, ragged splat, drawn once and shared by every mark
function splatTexture(color: string, ragged: boolean) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	const g = canvas.getContext('2d')!;
	g.fillStyle = color;
	const blob = (x: number, y: number, r: number) => {
		const grad = g.createRadialGradient(x, y, 0, x, y, r);
		grad.addColorStop(0, color);
		grad.addColorStop(0.7, color);
		grad.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = grad;
		g.beginPath();
		g.arc(x, y, r, 0, Math.PI * 2);
		g.fill();
	};
	blob(64, 64, ragged ? 34 : 40);
	if (ragged) {
		for (let i = 0; i < 9; i++) {
			const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
			const d = 30 + Math.random() * 24;
			blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + Math.random() * 9);
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

export class Effects {
	private particles: Particle[] = [];
	private marks: Mark[] = [];
	private bloodMark: THREE.Texture;
	private holeMark: THREE.Texture;
	private glows: { mesh: THREE.Mesh; t: number }[] = [];
	private n = new THREE.Vector3();

	constructor(private parent: THREE.Object3D) {
		this.bloodMark = splatTexture('rgba(92, 22, 22, 0.85)', true);
		this.holeMark = splatTexture('rgba(40, 40, 40, 0.75)', false);
	}

	// a spray of blood where a zombie was hit, thrown along the shot
	blood(at: THREE.Vector3, dir: THREE.Vector3, amount = 1) {
		const count = Math.round(5 * amount);
		for (let i = 0; i < count; i++) {
			this.spawn(at, i % 3 ? BLOOD : BLOOD_DARK, 0.6 + Math.random() * 0.9, {
				x: dir.x * (1 + Math.random() * 2.5) + (Math.random() - 0.5) * 1.6,
				y: dir.y * 2 + Math.random() * 1.8,
				z: dir.z * (1 + Math.random() * 2.5) + (Math.random() - 0.5) * 1.6
			});
		}
	}

	// a head shot off: a burst all around, mostly along the shot
	headPop(at: THREE.Vector3, dir: THREE.Vector3) {
		for (let i = 0; i < 22; i++) {
			this.spawn(at, i % 4 ? BLOOD : BLOOD_DARK, 0.8 + Math.random() * 1.6, {
				x: dir.x * 2.5 + (Math.random() - 0.5) * 4,
				y: 1 + Math.random() * 3.5,
				z: dir.z * 2.5 + (Math.random() - 0.5) * 4
			});
		}
	}

	// a puff of dust and chips where a bullet met a wall or the floor
	dust(at: THREE.Vector3, normal: THREE.Vector3) {
		for (let i = 0; i < 4; i++) {
			this.spawn(at, DUST, 0.5 + Math.random() * 0.6, {
				x: normal.x * 1.5 + (Math.random() - 0.5) * 1.5,
				y: normal.y * 1.5 + Math.random() * 1.5,
				z: normal.z * 1.5 + (Math.random() - 0.5) * 1.5
			});
		}
	}

	// a mark left on a surface, facing out along its normal: blood, or a
	// bullet hole
	decal(at: THREE.Vector3, normal: THREE.Vector3, kind: 'blood' | 'hole', size = 1) {
		if (at.y > WALL_HEIGHT - 0.05) return;
		const material = new THREE.MeshBasicMaterial({
			map: kind === 'blood' ? this.bloodMark : this.holeMark,
			transparent: true,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -2 - this.marks.length * 0.01
		});
		const mesh =
			this.marks.length >= MAX_MARKS ? this.dropOldestMark() : new THREE.Mesh(MARK, material);
		if (mesh.material !== material) {
			(mesh.material as THREE.Material).dispose();
			mesh.material = material;
		}
		const scale = (kind === 'blood' ? 0.5 + Math.random() * 0.6 : 0.09) * size;
		mesh.scale.set(scale, scale, 1);
		mesh.position.copy(at).addScaledVector(normal, 0.01);
		mesh.lookAt(this.n.copy(mesh.position).add(normal));
		mesh.rotateZ(Math.random() * Math.PI * 2);
		mesh.renderOrder = 1;
		this.parent.add(mesh);
		this.marks.push({ mesh, age: 0 });
	}

	// a soft light that pulses over a power-up waiting to be picked up
	glow(mesh: THREE.Mesh) {
		this.glows.push({ mesh, t: Math.random() * 10 });
	}

	unglow(mesh: THREE.Mesh) {
		this.glows = this.glows.filter((g) => g.mesh !== mesh);
	}

	clear() {
		for (const m of this.marks) {
			m.mesh.removeFromParent();
			(m.mesh.material as THREE.Material).dispose();
		}
		this.marks = [];
	}

	update(dt: number) {
		this.particles = this.particles.filter((p) => {
			p.life -= dt;
			if (p.life <= 0) {
				p.mesh.removeFromParent();
				(p.mesh.material as THREE.Material).dispose();
				return false;
			}
			p.vy -= 9 * dt;
			p.mesh.position.x += p.vx * dt;
			p.mesh.position.y += p.vy * dt;
			p.mesh.position.z += p.vz * dt;
			if (p.mesh.position.y < 0.02) {
				p.mesh.position.y = 0.02;
				p.vx = p.vz = p.vy = 0;
			}
			(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life * 3);
			return true;
		});
		for (const m of this.marks) {
			m.age += dt;
			if (m.age > MARK_LIFE) {
				(m.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
					0,
					1 - (m.age - MARK_LIFE) / 5
				);
			}
		}
		while (this.marks.length && this.marks[0].age > MARK_LIFE + 5) {
			const m = this.marks.shift()!;
			m.mesh.removeFromParent();
			(m.mesh.material as THREE.Material).dispose();
		}
		for (const g of this.glows) {
			g.t += dt;
			g.mesh.position.y = 0.55 + Math.sin(g.t * 2.4) * 0.08;
			g.mesh.rotation.y += dt * 1.6;
		}
	}

	private dropOldestMark() {
		const m = this.marks.shift()!;
		m.mesh.removeFromParent();
		return m.mesh;
	}

	private spawn(
		at: THREE.Vector3,
		color: string,
		size: number,
		v: { x: number; y: number; z: number }
	) {
		const mesh =
			this.particles.length >= MAX_PARTICLES
				? this.takeOldest()
				: new THREE.Mesh(CHUNK, new THREE.MeshBasicMaterial({ color, transparent: true }));
		(mesh.material as THREE.MeshBasicMaterial).color.set(color);
		mesh.position.copy(at);
		mesh.scale.setScalar(size);
		this.parent.add(mesh);
		this.particles.push({ mesh, vx: v.x, vy: v.y, vz: v.z, life: 0.4 + Math.random() * 0.4 });
	}

	private takeOldest() {
		const p = this.particles.shift()!;
		return p.mesh;
	}
}
