import * as THREE from 'three';
import { WALL_HEIGHT } from '../map';

// Short-lived things the world shows when something happens: blood when a
// zombie is hit, a head bursting, marks left on walls and floors, dust where
// a bullet hits a wall, dirt where a zombie climbs out of the ground, the
// glow of a power-up, and the eyes of every zombie. Each is one method, so
// the look behind it can be swapped without the game noticing.
//
// Everything here is drawn in a handful of calls however much is going on:
// the chips are one instanced mesh, the marks one per kind, the eyes one
// cloud of points. Before, each chip and mark was a mesh of its own, and a
// busy fight was hundreds of draw calls on its own.

const CHUNK = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const MARK = new THREE.PlaneGeometry(1, 1);
const MAX_PARTICLES = 240;
const MAX_BLOOD = 96;
const MAX_HOLES = 64;
const MAX_EYES = 2 * 48;
const MARK_LIFE = 40; // seconds before a mark starts to fade
const MARK_FADE = 5;

export const BLOOD = '#6e2a2a';
const BLOOD_DARK = '#4a1717';
const DUST = '#9a9a9a';
const DIRT = '#5a4a38';
const DIRT_DARK = '#3b2f22';
// the eyes: the hot orange of the games this is after
const EYE = '#ff8a1f';

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

// a hot point with a soft halo, for an eye
function glowTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 64;
	const g = canvas.getContext('2d')!;
	const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	grad.addColorStop(0, 'rgba(255,255,255,1)');
	grad.addColorStop(0.18, 'rgba(255,230,190,0.95)');
	grad.addColorStop(0.4, 'rgba(255,160,60,0.45)');
	grad.addColorStop(1, 'rgba(255,120,30,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 64, 64);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const look = new THREE.Vector3();

// Chips of blood, dust or dirt: all drawn as one instanced mesh, each with
// its own colour, shrinking away as it dies rather than fading, since an
// instance cannot have an opacity of its own.
class Chips {
	readonly mesh: THREE.InstancedMesh;
	private count = 0;
	private pos = new Float32Array(MAX_PARTICLES * 3);
	private vel = new Float32Array(MAX_PARTICLES * 3);
	private life = new Float32Array(MAX_PARTICLES);
	private span = new Float32Array(MAX_PARTICLES);
	private size = new Float32Array(MAX_PARTICLES);

	constructor(parent: THREE.Object3D) {
		this.mesh = new THREE.InstancedMesh(
			CHUNK,
			new THREE.MeshBasicMaterial({ color: '#ffffff' }),
			MAX_PARTICLES
		);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		// colours are set per chip, which creates the attribute
		this.mesh.setColorAt(0, color.set(BLOOD));
		this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
		this.mesh.count = 0;
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		parent.add(this.mesh);
	}

	spawn(at: THREE.Vector3, tint: string, size: number, v: { x: number; y: number; z: number }) {
		// full up: the oldest is the one at the front, so take its place
		const i = this.count < MAX_PARTICLES ? this.count++ : this.oldest();
		this.pos[i * 3] = at.x;
		this.pos[i * 3 + 1] = at.y;
		this.pos[i * 3 + 2] = at.z;
		this.vel[i * 3] = v.x;
		this.vel[i * 3 + 1] = v.y;
		this.vel[i * 3 + 2] = v.z;
		this.span[i] = this.life[i] = 0.4 + Math.random() * 0.4;
		this.size[i] = size;
		this.mesh.setColorAt(i, color.set(tint));
		this.mesh.instanceColor!.needsUpdate = true;
	}

	private oldest() {
		let best = 0;
		for (let i = 1; i < this.count; i++) if (this.life[i] < this.life[best]) best = i;
		return best;
	}

	update(dt: number) {
		const { pos, vel, life } = this;
		let i = 0;
		while (i < this.count) {
			life[i] -= dt;
			if (life[i] <= 0) {
				// swap the last chip in over the dead one
				const last = --this.count;
				if (i !== last) {
					for (let k = 0; k < 3; k++) {
						pos[i * 3 + k] = pos[last * 3 + k];
						vel[i * 3 + k] = vel[last * 3 + k];
					}
					life[i] = life[last];
					this.span[i] = this.span[last];
					this.size[i] = this.size[last];
					this.mesh.getColorAt(last, color);
					this.mesh.setColorAt(i, color);
					this.mesh.instanceColor!.needsUpdate = true;
				}
				continue;
			}
			vel[i * 3 + 1] -= 9 * dt;
			pos[i * 3] += vel[i * 3] * dt;
			pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
			pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
			if (pos[i * 3 + 1] < 0.02) {
				pos[i * 3 + 1] = 0.02;
				vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
			}
			// gone in its last third
			const s = this.size[i] * Math.min(1, (life[i] / this.span[i]) * 3);
			dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.setScalar(s);
			dummy.updateMatrix();
			this.mesh.setMatrixAt(i, dummy.matrix);
			i++;
		}
		this.mesh.count = this.count;
		this.mesh.instanceMatrix.needsUpdate = true;
	}
}

// Marks of one kind on walls and floors, as one instanced mesh: a ring of
// slots, the oldest written over when they're all taken, each shrinking to
// nothing once it has had its time.
class Marks {
	readonly mesh: THREE.InstancedMesh;
	private next = 0;
	private used = 0;
	private age: Float32Array;
	private size: Float32Array;

	constructor(parent: THREE.Object3D, texture: THREE.Texture, max: number) {
		this.age = new Float32Array(max);
		this.size = new Float32Array(max);
		this.mesh = new THREE.InstancedMesh(
			MARK,
			new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				polygonOffset: true,
				polygonOffsetFactor: -2,
				polygonOffsetUnits: -2
			}),
			max
		);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.count = 0;
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.renderOrder = 1;
		parent.add(this.mesh);
	}

	add(at: THREE.Vector3, normal: THREE.Vector3, size: number) {
		const max = this.age.length;
		const i = this.next;
		this.next = (this.next + 1) % max;
		this.used = Math.min(max, this.used + 1);
		this.age[i] = 0;
		this.size[i] = size;
		dummy.position.copy(at).addScaledVector(normal, 0.01);
		dummy.lookAt(look.copy(dummy.position).add(normal));
		dummy.rotateZ(Math.random() * Math.PI * 2);
		dummy.scale.set(size, size, 1);
		dummy.updateMatrix();
		this.mesh.setMatrixAt(i, dummy.matrix);
		this.mesh.count = this.used;
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	update(dt: number) {
		for (let i = 0; i < this.used; i++) {
			const was = this.age[i];
			this.age[i] += dt;
			// shrinking away once it has had its time; once gone, left at
			// nothing until written over
			if (this.age[i] < MARK_LIFE || was >= MARK_LIFE + MARK_FADE) continue;
			const left = Math.max(0, 1 - (this.age[i] - MARK_LIFE) / MARK_FADE);
			this.mesh.getMatrixAt(i, dummy.matrix);
			dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
			dummy.scale.set(this.size[i] * left, this.size[i] * left, 1);
			dummy.updateMatrix();
			this.mesh.setMatrixAt(i, dummy.matrix);
			this.mesh.instanceMatrix.needsUpdate = true;
		}
	}

	clear() {
		this.next = this.used = 0;
		this.mesh.count = 0;
	}
}

export class Effects {
	private chips: Chips;
	private bloodMarks: Marks;
	private holeMarks: Marks;
	private glows: { mesh: THREE.Mesh; t: number }[] = [];
	private eyes: THREE.Points;
	private eyePos: Float32Array;
	private eyeCount = 0;
	private clock = 0;

	constructor(parent: THREE.Object3D) {
		this.chips = new Chips(parent);
		this.bloodMarks = new Marks(parent, splatTexture('rgba(92, 22, 22, 0.85)', true), MAX_BLOOD);
		this.holeMarks = new Marks(parent, splatTexture('rgba(40, 40, 40, 0.75)', false), MAX_HOLES);
		// every zombie's eyes, as one cloud of glowing points
		this.eyePos = new Float32Array(MAX_EYES * 3);
		const g = new THREE.BufferGeometry();
		const attr = new THREE.BufferAttribute(this.eyePos, 3);
		attr.setUsage(THREE.DynamicDrawUsage);
		g.setAttribute('position', attr);
		g.setDrawRange(0, 0);
		this.eyes = new THREE.Points(
			g,
			new THREE.PointsMaterial({
				map: glowTexture(),
				color: EYE,
				size: 0.17,
				sizeAttenuation: true,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				toneMapped: false
			})
		);
		this.eyes.frustumCulled = false;
		this.eyes.matrixAutoUpdate = false;
		this.eyes.renderOrder = 4;
		parent.add(this.eyes);
	}

	// a spray of blood where a zombie was hit, thrown along the shot
	blood(at: THREE.Vector3, dir: THREE.Vector3, amount = 1) {
		const count = Math.round(5 * amount);
		for (let i = 0; i < count; i++) {
			this.chips.spawn(at, i % 3 ? BLOOD : BLOOD_DARK, 0.6 + Math.random() * 0.9, {
				x: dir.x * (1 + Math.random() * 2.5) + (Math.random() - 0.5) * 1.6,
				y: dir.y * 2 + Math.random() * 1.8,
				z: dir.z * (1 + Math.random() * 2.5) + (Math.random() - 0.5) * 1.6
			});
		}
	}

	// a head shot off: a burst all around, mostly along the shot
	headPop(at: THREE.Vector3, dir: THREE.Vector3) {
		for (let i = 0; i < 22; i++) {
			this.chips.spawn(at, i % 4 ? BLOOD : BLOOD_DARK, 0.8 + Math.random() * 1.6, {
				x: dir.x * 2.5 + (Math.random() - 0.5) * 4,
				y: 1 + Math.random() * 3.5,
				z: dir.z * 2.5 + (Math.random() - 0.5) * 4
			});
		}
	}

	// a puff of dust and chips where a bullet met a wall or the floor
	dust(at: THREE.Vector3, normal: THREE.Vector3) {
		for (let i = 0; i < 4; i++) {
			this.chips.spawn(at, DUST, 0.5 + Math.random() * 0.6, {
				x: normal.x * 1.5 + (Math.random() - 0.5) * 1.5,
				y: normal.y * 1.5 + Math.random() * 1.5,
				z: normal.z * 1.5 + (Math.random() - 0.5) * 1.5
			});
		}
	}

	// earth thrown up where a zombie claws its way out of the ground
	dirt(at: THREE.Vector3) {
		for (let i = 0; i < 14; i++) {
			this.chips.spawn(at, i % 3 ? DIRT : DIRT_DARK, 0.7 + Math.random() * 1.1, {
				x: (Math.random() - 0.5) * 3,
				y: 1.5 + Math.random() * 3,
				z: (Math.random() - 0.5) * 3
			});
		}
	}

	// a mark left on a surface, facing out along its normal: blood, or a
	// bullet hole
	decal(at: THREE.Vector3, normal: THREE.Vector3, kind: 'blood' | 'hole', size = 1) {
		if (at.y > WALL_HEIGHT - 0.05) return;
		const scale = (kind === 'blood' ? 0.5 + Math.random() * 0.6 : 0.09) * size;
		(kind === 'blood' ? this.bloodMarks : this.holeMarks).add(at, normal, scale);
	}

	// a soft light that pulses over a power-up waiting to be picked up
	glow(mesh: THREE.Mesh) {
		this.glows.push({ mesh, t: Math.random() * 10 });
	}

	unglow(mesh: THREE.Mesh) {
		this.glows = this.glows.filter((g) => g.mesh !== mesh);
	}

	// Starts a fresh set of eyes for this frame; each pair is added with
	// `eye`, and `endEyes` hands them to the graphics card.
	beginEyes() {
		this.eyeCount = 0;
	}

	eye(x: number, y: number, z: number) {
		if (this.eyeCount >= MAX_EYES) return;
		const o = this.eyeCount++ * 3;
		this.eyePos[o] = x;
		this.eyePos[o + 1] = y;
		this.eyePos[o + 2] = z;
	}

	endEyes() {
		const g = this.eyes.geometry;
		g.setDrawRange(0, this.eyeCount);
		g.getAttribute('position').needsUpdate = true;
		// a slow, uneasy flicker
		const m = this.eyes.material as THREE.PointsMaterial;
		m.size = 0.17 + Math.sin(this.clock * 9) * Math.sin(this.clock * 2.3) * 0.015;
	}

	clear() {
		this.bloodMarks.clear();
		this.holeMarks.clear();
	}

	update(dt: number) {
		this.clock += dt;
		this.chips.update(dt);
		this.bloodMarks.update(dt);
		this.holeMarks.update(dt);
		for (const g of this.glows) {
			g.t += dt;
			g.mesh.position.y = 0.55 + Math.sin(g.t * 2.4) * 0.08;
			g.mesh.rotation.y += dt * 1.6;
		}
	}
}
