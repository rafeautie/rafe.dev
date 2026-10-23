import * as THREE from 'three';
import type { Blocking } from '../map';
import { WALL_HEIGHT } from '../map';

// Bodies, zombie and player alike, are six boxes hung between eleven joints.
// Walking is a pose worked out from the joints each frame; dying hands the same
// joints to a ragdoll, which lets them fall where they will, held together only
// by the distances between them. That is what makes a body drop limp.

export const J = {
	headTop: 0,
	neck: 1,
	pelvis: 2,
	lShoulder: 3,
	rShoulder: 4,
	lHand: 5,
	rHand: 6,
	lHip: 7,
	rHip: 8,
	lFoot: 9,
	rFoot: 10
} as const;
const JOINTS = 11;

export type Joints = Float32Array;
export const newJoints = (): Joints => new Float32Array(JOINTS * 3);

const PARTS = [
	// [from, to, width, length, depth]
	{ a: J.pelvis, b: J.neck, size: [0.46, 0.62, 0.26] },
	{ a: J.neck, b: J.headTop, size: [0.26, 0.3, 0.26] },
	{ a: J.lShoulder, b: J.lHand, size: [0.11, 0.62, 0.11] },
	{ a: J.rShoulder, b: J.rHand, size: [0.11, 0.62, 0.11] },
	{ a: J.lHip, b: J.lFoot, size: [0.15, 0.95, 0.15] },
	{ a: J.rHip, b: J.rFoot, size: [0.15, 0.95, 0.15] }
] as const;

const geometries = PARTS.map(({ size }) => new THREE.BoxGeometry(size[0], size[1], size[2]));

export type BodyColors = { skin: string; shirt: string; pants: string };

export class Body {
	readonly meshes: THREE.Mesh[];
	readonly materials: THREE.MeshLambertMaterial[];

	constructor(
		parent: THREE.Object3D,
		colors: BodyColors,
		readonly joints: Joints = newJoints()
	) {
		const skin = new THREE.MeshLambertMaterial({ color: colors.skin, transparent: true });
		const shirt = new THREE.MeshLambertMaterial({ color: colors.shirt, transparent: true });
		const pants = new THREE.MeshLambertMaterial({ color: colors.pants, transparent: true });
		this.materials = [skin, shirt, pants];
		const materialFor = [shirt, skin, skin, skin, pants, pants];
		this.meshes = geometries.map((g, i) => {
			const mesh = new THREE.Mesh(g, materialFor[i]);
			mesh.castShadow = true;
			mesh.matrixAutoUpdate = false;
			parent.add(mesh);
			return mesh;
		});
	}

	// Puts each box between its two joints.
	place() {
		const j = this.joints;
		// the shoulders say which way the body faces, for every box
		right.fromArray(j, J.rShoulder * 3).sub(a.fromArray(j, J.lShoulder * 3));
		PARTS.forEach((part, i) => {
			a.fromArray(j, part.a * 3);
			b.fromArray(j, part.b * 3);
			placeBetween(this.meshes[i], a, b, right);
		});
	}

	setOpacity(opacity: number) {
		for (const m of this.materials) {
			m.opacity = opacity;
			m.depthWrite = opacity > 0.99;
		}
	}

	dispose() {
		for (const mesh of this.meshes) mesh.removeFromParent();
		for (const m of this.materials) m.dispose();
	}
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const right = new THREE.Vector3();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();

function placeBetween(
	mesh: THREE.Mesh,
	from: THREE.Vector3,
	to: THREE.Vector3,
	hint: THREE.Vector3
) {
	ay.subVectors(to, from);
	const len = ay.length();
	if (len < 1e-6) ay.set(0, 1, 0);
	else ay.divideScalar(len);
	ax.copy(hint).addScaledVector(ay, -hint.dot(ay));
	if (ax.lengthSq() < 1e-6) ax.set(ay.y, -ay.x, 0);
	ax.normalize();
	az.crossVectors(ax, ay);
	mesh.matrix.makeBasis(ax, ay, az);
	mesh.matrix.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
	mesh.matrixWorldNeedsUpdate = true;
}

// Writes a local pose (facing -z, right is +x) into world joints.
function toWorld(out: Joints, local: number[], x: number, y: number, z: number, yaw: number) {
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	for (let i = 0; i < JOINTS; i++) {
		const lx = local[i * 3];
		const ly = local[i * 3 + 1];
		const lz = local[i * 3 + 2];
		out[i * 3] = x + lx * c + lz * s;
		out[i * 3 + 1] = y + ly;
		out[i * 3 + 2] = z - lx * s + lz * c;
	}
}

const pose: number[] = new Array(JOINTS * 3).fill(0);
function set(joint: number, x: number, y: number, z: number) {
	pose[joint * 3] = x;
	pose[joint * 3 + 1] = y;
	pose[joint * 3 + 2] = z;
}

// A shambling zombie, arms out. `step` is the walk cycle in radians and
// `swing` runs 0 to 1 through an attack.
export function zombiePose(
	out: Joints,
	x: number,
	y: number,
	z: number,
	yaw: number,
	step: number,
	swing: number,
	lean: number
) {
	const s = Math.sin(step);
	const bob = Math.abs(s) * 0.04;
	const lift = Math.sin(swing * Math.PI);
	set(J.pelvis, 0, 0.95 + bob, 0);
	set(J.neck, 0, 1.52 + bob, -0.1 - lean);
	set(J.headTop, 0.03, 1.81 + bob, -0.18 - lean * 1.4);
	set(J.lShoulder, -0.24, 1.47 + bob, -0.08 - lean);
	set(J.rShoulder, 0.24, 1.47 + bob, -0.08 - lean);
	set(J.lHand, -0.22, 1.4 + s * 0.06 + lift * 0.4, -0.68 - lean + lift * 0.15);
	set(J.rHand, 0.22, 1.4 - s * 0.06 + lift * 0.4, -0.68 - lean + lift * 0.15);
	set(J.lHip, -0.12, 0.95 + bob, 0);
	set(J.rHip, 0.12, 0.95 + bob, 0);
	set(J.lFoot, -0.13, 0.04 + Math.max(0, s) * 0.12, -s * 0.32);
	set(J.rFoot, 0.13, 0.04 + Math.max(0, -s) * 0.12, s * 0.32);
	toWorld(out, pose, x, y, z, yaw);
}

// Another player: upright with a gun held out, or downed, propped on one arm.
export function playerPose(
	out: Joints,
	x: number,
	y: number,
	z: number,
	yaw: number,
	step: number,
	downed: boolean
) {
	if (downed) {
		set(J.pelvis, 0, 0.22, 0.1);
		set(J.neck, 0, 0.55, -0.45);
		set(J.headTop, 0, 0.8, -0.62);
		set(J.lShoulder, -0.24, 0.5, -0.4);
		set(J.rShoulder, 0.24, 0.5, -0.4);
		set(J.lHand, -0.3, 0.08, -0.55);
		set(J.rHand, 0.12, 0.62, -0.95);
		set(J.lHip, -0.12, 0.2, 0.1);
		set(J.rHip, 0.12, 0.2, 0.1);
		set(J.lFoot, -0.18 + Math.sin(step) * 0.05, 0.08, 1.02);
		set(J.rFoot, 0.18 - Math.sin(step) * 0.05, 0.08, 1.02);
	} else {
		const s = Math.sin(step);
		const bob = Math.abs(s) * 0.03;
		set(J.pelvis, 0, 0.95 + bob, 0);
		set(J.neck, 0, 1.55 + bob, -0.02);
		set(J.headTop, 0, 1.86 + bob, -0.04);
		set(J.lShoulder, -0.24, 1.5 + bob, 0);
		set(J.rShoulder, 0.24, 1.5 + bob, 0);
		set(J.lHand, -0.06, 1.32 + bob, -0.5);
		set(J.rHand, 0.12, 1.25 + bob, -0.3);
		set(J.lHip, -0.12, 0.95 + bob, 0);
		set(J.rHip, 0.12, 0.95 + bob, 0);
		set(J.lFoot, -0.13, 0.04 + Math.max(0, s) * 0.1, -s * 0.34);
		set(J.rFoot, 0.13, 0.04 + Math.max(0, -s) * 0.1, s * 0.34);
	}
	toWorld(out, pose, x, y, z, yaw);
}

// pairs held at the distance they had when the body went down
const BONES: [number, number][] = [];
{
	// the torso is braced on every pair, so it stays one piece
	const torso = [J.neck, J.pelvis, J.lShoulder, J.rShoulder, J.lHip, J.rHip];
	for (let i = 0; i < torso.length; i++)
		for (let k = i + 1; k < torso.length; k++) BONES.push([torso[i], torso[k]]);
	BONES.push(
		[J.headTop, J.neck],
		[J.headTop, J.lShoulder],
		[J.headTop, J.rShoulder],
		[J.lShoulder, J.lHand],
		[J.rShoulder, J.rHand],
		[J.lHip, J.lFoot],
		[J.rHip, J.rFoot],
		// loose limits, so a limb cannot fold through the body
		[J.lHand, J.pelvis],
		[J.rHand, J.pelvis],
		[J.lFoot, J.neck],
		[J.rFoot, J.neck]
	);
}
const LIMIT_FROM = BONES.length - 4; // the last four only push apart

const GRAVITY = 14;
const RADIUS = 0.09;
const STEP = 1 / 120;

export class Ragdoll {
	private prev: Float32Array;
	private rest: Float32Array;
	private acc = 0;
	age = 0;

	constructor(
		readonly body: Body,
		// per joint velocity, m/s
		velocity: Float32Array
	) {
		const j = body.joints;
		this.prev = new Float32Array(j.length);
		for (let i = 0; i < j.length; i++) this.prev[i] = j[i] - velocity[i] * STEP;
		this.rest = new Float32Array(BONES.length);
		BONES.forEach(([p, q], i) => {
			this.rest[i] = Math.hypot(
				j[p * 3] - j[q * 3],
				j[p * 3 + 1] - j[q * 3 + 1],
				j[p * 3 + 2] - j[q * 3 + 2]
			);
			// the limits allow a lot of slack
			if (i >= LIMIT_FROM) this.rest[i] *= 0.55;
		});
	}

	update(dt: number, blocking: Blocking) {
		this.age += dt;
		// settled bodies stop simulating
		if (this.age > 6) return;
		this.acc += Math.min(dt, 0.05);
		while (this.acc >= STEP) {
			this.acc -= STEP;
			this.step(blocking);
		}
		this.body.place();
	}

	private step(blocking: Blocking) {
		const j = this.body.joints;
		const prev = this.prev;
		for (let i = 0; i < JOINTS; i++) {
			const o = i * 3;
			const onFloor = j[o + 1] <= RADIUS + 0.001;
			// floor friction
			const keep = onFloor ? 0.82 : 0.995;
			for (let k = 0; k < 3; k++) {
				const v = (j[o + k] - prev[o + k]) * (k === 1 ? 0.995 : keep);
				prev[o + k] = j[o + k];
				j[o + k] += v;
			}
			j[o + 1] -= GRAVITY * STEP * STEP;
		}
		for (let iter = 0; iter < 6; iter++) {
			BONES.forEach(([p, q], i) => {
				const po = p * 3;
				const qo = q * 3;
				const dx = j[qo] - j[po];
				const dy = j[qo + 1] - j[po + 1];
				const dz = j[qo + 2] - j[po + 2];
				const d = Math.hypot(dx, dy, dz) || 1e-6;
				if (i >= LIMIT_FROM && d >= this.rest[i]) return;
				const diff = ((d - this.rest[i]) / d) * 0.5;
				j[po] += dx * diff;
				j[po + 1] += dy * diff;
				j[po + 2] += dz * diff;
				j[qo] -= dx * diff;
				j[qo + 1] -= dy * diff;
				j[qo + 2] -= dz * diff;
			});
			for (let i = 0; i < JOINTS; i++) {
				const o = i * 3;
				if (j[o + 1] < RADIUS) j[o + 1] = RADIUS;
				if (j[o + 1] < WALL_HEIGHT) {
					const [x, z] = blocking.pushOut(j[o], j[o + 2], RADIUS);
					j[o] = x;
					j[o + 2] = z;
				}
			}
		}
	}
}

// Closest approach between a ray and a segment: the distance along the ray,
// or -1 if they pass farther apart than r.
export function rayCapsule(
	o: THREE.Vector3,
	d: THREE.Vector3,
	joints: Joints,
	p: number,
	q: number,
	r: number
): number {
	const px = joints[p * 3];
	const py = joints[p * 3 + 1];
	const pz = joints[p * 3 + 2];
	const ux = joints[q * 3] - px;
	const uy = joints[q * 3 + 1] - py;
	const uz = joints[q * 3 + 2] - pz;
	const wx = o.x - px;
	const wy = o.y - py;
	const wz = o.z - pz;
	const uu = ux * ux + uy * uy + uz * uz;
	const ud = ux * d.x + uy * d.y + uz * d.z;
	const uw = ux * wx + uy * wy + uz * wz;
	const dw = d.x * wx + d.y * wy + d.z * wz;
	const denom = uu - ud * ud; // d is a unit vector
	let s = denom > 1e-9 ? (uw - ud * dw) / denom : 0; // along the segment, 0 to 1 once clamped
	s = Math.max(0, Math.min(1, uu > 1e-9 ? s : 0));
	// the ray's closest point to that point on the segment
	const cx = px + ux * s;
	const cy = py + uy * s;
	const cz = pz + uz * s;
	const t = (cx - o.x) * d.x + (cy - o.y) * d.y + (cz - o.z) * d.z;
	if (t < 0) return -1;
	const dist = Math.hypot(o.x + d.x * t - cx, o.y + d.y * t - cy, o.z + d.z * t - cz);
	return dist <= r ? t : -1;
}
