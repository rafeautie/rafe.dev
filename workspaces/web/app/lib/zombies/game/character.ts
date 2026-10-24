import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { J, newJoints, type Figure, type Joints, type Posture } from './rig';

// Real characters, in place of the boxes. Every model shares one skeleton
// (Mixamo's), so every animation plays on every one. The game still thinks in
// the eleven joints of rig.ts: each frame they are read off the bones, so hits
// land where the model is, and when a body drops the ragdoll moves the joints
// and the bones are turned to follow them.

const BASE = '/zombies/models/';
export const SURVIVORS = ['brian', 'louise', 'bryce', 'elizabeth', 'swat'] as const;
export const ZOMBIES = ['zombie_guy', 'zombiegirl', 'zombie_brute'] as const;

// a model, and every clip fitted to it
type Model = { scene: THREE.Object3D; scale: number; clips: Map<string, Clip> };

export type Cast = { models: Map<string, Model> };

type Clip = {
	full: THREE.AnimationClip;
	lower: THREE.AnimationClip;
	upper: THREE.AnimationClip;
	// how fast and which way the clip walked before it was pinned in place,
	// m/s, in the model's frame (+z ahead, +x to its left)
	speed: number;
	dir: [number, number];
};

const UPPER = /Spine|Neck|Head|Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Pinky/;

let loading: Promise<Cast | null> | null = null;

// Loads every model and the animations, once. Resolves to null if anything
// fails to load, and the game keeps its boxes.
export function loadCast(): Promise<Cast | null> {
	loading ??= load().catch((err) => {
		console.warn('zombies: characters failed to load, using boxes', err);
		return null;
	});
	return loading;
}

async function load(): Promise<Cast> {
	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
	const names = [...SURVIVORS, ...ZOMBIES];
	const [anims, ...gltfs] = await Promise.all([
		loader.loadAsync(BASE + 'animations.glb'),
		...names.map((n) => loader.loadAsync(BASE + n + '.glb'))
	]);
	const hipsRest = restHips(anims.scene);
	const models = new Map<string, Model>();
	gltfs.forEach((gltf, i) => {
		const name = names[i];
		const scene = gltf.scene;
		const bones = new Set<string>();
		scene.traverse((o) => {
			if ((o as THREE.Bone).isBone) bones.add(o.name);
			if ((o as THREE.Mesh).isMesh) {
				const mesh = o as THREE.SkinnedMesh;
				mesh.castShadow = true;
				// skinned bounds don't follow the pose, so they'd be culled wrongly
				mesh.frustumCulled = false;
			}
		});
		// the clips' hips were set for their own skeleton's height, so they're
		// moved to this one's, and bones this model lacks are left out
		const fit = restHips(scene) / hipsRest;
		const clips = new Map<string, Clip>();
		for (const full of anims.animations) {
			const tracks = full.tracks
				.filter((t) => bones.has(t.name.slice(0, t.name.lastIndexOf('.'))))
				.map((t) => {
					if (!/Hips\.position$/.test(t.name) || Math.abs(fit - 1) < 1e-3) return t;
					const fitted = t.clone();
					for (let k = 0; k < fitted.values.length; k++) fitted.values[k] *= fit;
					return fitted;
				});
			const extras = (full.userData ?? {}) as { speed?: number; dir?: [number, number] };
			const cut = (part: string, keep: (t: THREE.KeyframeTrack) => boolean) =>
				new THREE.AnimationClip(full.name + part, full.duration, tracks.filter(keep));
			clips.set(full.name, {
				full: cut('', () => true),
				lower: cut(':lower', (t) => !UPPER.test(t.name)),
				upper: cut(':upper', (t) => UPPER.test(t.name)),
				speed: (extras.speed ?? 0) > 0.05 ? extras.speed! : 0,
				dir: extras.dir ?? [0, 0]
			});
		}
		// every survivor and zombie stands about as tall; the brute towers
		const want = name === 'zombie_brute' ? 1.18 : 0.96;
		models.set(name, { scene, scale: want / worldHips(scene), clips });
	});
	return { models };
}

// the bone by its Mixamo name; the animations file has no meshes, so its
// bones load as plain objects, which any allows
function findBone(root: THREE.Object3D, name: string, any = false) {
	let found: THREE.Bone | null = null;
	root.traverse((o) => {
		if (
			!found &&
			(any || (o as THREE.Bone).isBone) &&
			o.name.replace(/^mixamorig\d*:?/, '') === name
		)
			found = o as THREE.Bone;
	});
	return found as THREE.Bone | null;
}

// the hips' distance from the armature, in its own units
function restHips(root: THREE.Object3D) {
	return findBone(root, 'Hips', true)?.position.length() ?? 1;
}

// how high the hips stand at rest, in metres
function worldHips(root: THREE.Object3D) {
	root.updateMatrixWorld(true);
	return findBone(root, 'Hips')?.getWorldPosition(new THREE.Vector3()).y ?? 1;
}

const BONES = {
	headTop: 'HeadTop_End',
	head: 'Head',
	neck: 'Neck',
	hips: 'Hips',
	lShoulder: 'LeftArm',
	rShoulder: 'RightArm',
	lHand: 'LeftHand',
	rHand: 'RightHand',
	lHip: 'LeftUpLeg',
	rHip: 'RightUpLeg',
	lFoot: 'LeftFoot',
	rFoot: 'RightFoot',
	spine: 'Spine',
	spine1: 'Spine1',
	spine2: 'Spine2'
} as const;
type BoneKey = keyof typeof BONES;

// which bone stands for each of the eleven joints
const JOINT_BONES: [number, BoneKey][] = [
	[J.headTop, 'headTop'],
	[J.neck, 'neck'],
	[J.pelvis, 'hips'],
	[J.lShoulder, 'lShoulder'],
	[J.rShoulder, 'rShoulder'],
	[J.lHand, 'lHand'],
	[J.rHand, 'rHand'],
	[J.lHip, 'lHip'],
	[J.rHip, 'rHip'],
	[J.lFoot, 'lFoot'],
	[J.rFoot, 'rFoot']
];

// limbs the ragdoll swings, each along the line between two joints
const LIMBS: [BoneKey, number, number][] = [
	['head', J.neck, J.headTop],
	['lShoulder', J.lShoulder, J.lHand],
	['rShoulder', J.rShoulder, J.rHand],
	['lHip', J.lHip, J.lFoot],
	['rHip', J.rHip, J.rFoot]
];

type Playing = { action: THREE.AnimationAction; weight: number; target: number };

// One layer of animation: what it's playing and what it's fading out of.
class Layer {
	private playing: Playing[] = [];
	current: THREE.AnimationAction | null = null;

	constructor(private mixer: THREE.AnimationMixer) {}

	play(
		clip: THREE.AnimationClip,
		fade: number,
		opts: { once?: boolean; restart?: boolean; sync?: THREE.AnimationAction | null } = {}
	) {
		const action = this.mixer.clipAction(clip);
		if (this.current === action && !opts.restart) return action;
		action.enabled = true;
		action.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
		action.clampWhenFinished = !!opts.once;
		action.paused = false;
		const was = this.playing.find((p) => p.action === action);
		if (opts.once) action.time = 0;
		else if (!was && opts.sync && opts.sync !== action)
			// a new walk picks up the stride where the old one left off
			action.time = (opts.sync.time / opts.sync.getClip().duration) * clip.duration;
		else if (!was) action.time = 0;
		action.play();
		for (const p of this.playing) p.target = 0;
		if (was) was.target = 1;
		else this.playing.push({ action, weight: fade > 0 ? 0 : 1, target: 1 });
		this.fade = fade;
		this.current = action;
		return action;
	}

	stop(fade: number) {
		for (const p of this.playing) p.target = 0;
		this.fade = fade;
		this.current = null;
	}

	private fade = 0.2;

	// eases every weight toward its target; scale multiplies the whole layer
	update(dt: number, scale = 1) {
		const step = this.fade > 0 ? dt / this.fade : 1;
		this.playing = this.playing.filter((p) => {
			p.weight += Math.max(-step, Math.min(step, p.target - p.weight));
			if (p.weight <= 0 && p.target === 0) {
				p.action.stop();
				return false;
			}
			p.action.setEffectiveWeight(p.weight * scale);
			return true;
		});
	}

	get busy() {
		return this.playing.some((p) => p.target > 0);
	}
}

const v = new THREE.Vector3();
const w = new THREE.Vector3();
const q = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const m = new THREE.Matrix4();
const side = new THREE.Vector3();
const up = new THREE.Vector3();
const fwd = new THREE.Vector3();

export class Character implements Figure {
	readonly root = new THREE.Group();
	readonly meshes: THREE.Mesh[] = [];
	readonly joints: Joints = newJoints();
	private model: THREE.Object3D;
	private bones = {} as Record<BoneKey, THREE.Bone>;
	private mixer: THREE.AnimationMixer;
	private base: Layer;
	private baseUpper: Layer;
	private over: Layer;
	private overWeight = 0;
	private overTarget = 0;
	private clips: Map<string, Clip>;
	private materials: THREE.Material[] = [];
	private ragdolling = false;
	// the pose the ragdoll started from: each driven bone's turn in the world,
	// the line it lay along, and the torso's frame
	private start = new Map<BoneKey, { q: THREE.Quaternion; dir: THREE.Vector3 }>();
	private torso0 = new THREE.Quaternion();
	// what the zombie or player was doing last frame
	private mode = '';
	private shots = -1;
	private knifes = -1;
	private oneShot = 0;

	constructor(parent: THREE.Object3D, cast: Cast, name: string) {
		const model = cast.models.get(name)!;
		this.clips = model.clips;
		this.model = SkeletonUtils.clone(model.scene);
		this.model.scale.multiplyScalar(model.scale);
		this.root.add(this.model);
		this.model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			// each body fades on its own, so each has its own materials
			const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((mat) =>
				mat.clone()
			);
			mesh.material = Array.isArray(mesh.material) ? own : own[0];
			this.materials.push(...own);
			this.meshes.push(mesh);
		});
		for (const [key, bone] of Object.entries(BONES)) {
			this.bones[key as BoneKey] = findBone(this.model, bone)!;
		}
		// a model without a bone at the crown gets one, a head's height up
		if (!this.bones.headTop) {
			const top = new THREE.Bone();
			top.position.set(0, 18, 0);
			this.bones.head.add(top);
			this.bones.headTop = top;
		}
		this.mixer = new THREE.AnimationMixer(this.model);
		this.base = new Layer(this.mixer);
		this.baseUpper = new Layer(this.mixer);
		this.over = new Layer(this.mixer);
		parent.add(this.root);
	}

	private clip(name: string) {
		return this.clips.get(name)!;
	}

	// The whole body plays clip; with sync, a walk keeps its stride.
	private loop(name: string, timeScale: number, fade = 0.25, once = false) {
		const c = this.clip(name);
		const lower = this.base.play(c.lower, fade, {
			once,
			restart: once && this.mode !== name,
			sync: once ? null : this.base.current
		});
		const upper = this.baseUpper.play(c.upper, fade, {
			once,
			restart: once && this.mode !== name,
			sync: once ? null : lower
		});
		lower.timeScale = upper.timeScale = timeScale;
		upper.time = lower.time;
		this.mode = name;
		return lower;
	}

	// The arms and chest play clip over whatever the legs are doing.
	private overlay(
		name: string | null,
		fade = 0.15,
		opts: { once?: boolean; restart?: boolean } = {}
	) {
		if (!name) {
			this.overTarget = 0;
			if (this.over.busy) this.over.stop(fade);
			return null;
		}
		this.overTarget = 1;
		return this.over.play(this.clip(name).upper, fade, opts);
	}

	private advance(dt: number, x: number, y: number, z: number, yaw: number) {
		// facing yaw means looking toward -z turned by yaw; the model looks +z
		this.root.position.set(x, y, z);
		this.root.rotation.set(0, yaw + Math.PI, 0);
		this.overWeight += Math.max(-dt * 8, Math.min(dt * 8, this.overTarget - this.overWeight));
		this.base.update(dt);
		this.baseUpper.update(dt, 1 - this.overWeight);
		this.over.update(dt, this.overWeight);
		this.mixer.update(dt);
	}

	// The upper body bends to look up or down, a third at each spine bone.
	private bend(pitch: number) {
		if (Math.abs(pitch) < 1e-3) return;
		this.root.updateMatrixWorld(true);
		side.set(1, 0, 0).applyQuaternion(this.root.quaternion);
		for (const key of ['spine', 'spine1', 'spine2'] as const) {
			turnWorld(this.bones[key], side, -pitch / 3);
		}
	}

	// reads the joints off the bones
	private read() {
		this.root.updateMatrixWorld(true);
		for (const [joint, key] of JOINT_BONES) {
			this.bones[key].getWorldPosition(v);
			v.toArray(this.joints, joint * 3);
		}
	}

	zombie(
		dt: number,
		s: {
			x: number;
			y: number;
			z: number;
			yaw: number;
			// m/s, and 0 walk, 1 run, 2 sprint
			speed: number;
			pace: number;
			// a lasting variety, so they don't all walk the same
			variant: number;
			rising: number;
			attacking: boolean;
			tearing: boolean;
			climbing: boolean;
			// set the frame a hit lands
			hit: boolean;
		}
	) {
		if (this.ragdolling) return;
		if (s.rising > 0) {
			const a = this.loop('z_rise', 1, 0, true);
			a.time = (1 - s.rising) * a.getClip().duration;
			a.timeScale = 0;
		} else if (s.tearing) {
			this.loop('z_punch', 1.3);
		} else if (s.attacking) {
			this.loop('z_attack', 1.6, 0.15, true);
		} else if (s.speed > 0.2 || s.climbing) {
			const name =
				s.pace === 0
					? ['z_walk_b', 'z_walk_a', 'z_walk_c'][s.variant % 3]
					: ['z_run_a', 'z_run_b'][s.variant % 2];
			const c = this.clip(name);
			this.loop(name, clamp(Math.max(s.speed, 0.6) / c.speed, 0.6, s.pace === 0 ? 2.6 : 1.6));
		} else {
			this.loop('z_idle', 1);
		}
		if (s.hit) this.overlay('z_hit', 0.08, { once: true, restart: true })!.timeScale = 2;
		else if (this.over.current && isDone(this.over.current, 0.55)) this.overlay(null, 0.3);
		this.advance(dt, s.x, s.y, s.z, s.yaw);
		this.read();
	}

	player(
		dt: number,
		s: {
			x: number;
			y: number;
			z: number;
			yaw: number;
			// how they're moving, m/s, in the world
			vx: number;
			vz: number;
			downed: boolean;
			air: boolean;
			pistol: boolean;
			// seconds a reload takes with this gun
			reload: number;
			shots: number;
			knifes: number;
			pose: Posture;
			reloading: boolean;
		}
	) {
		if (this.ragdolling) return;
		const st = s.pose;
		// movement in the model's frame: +z ahead, +x to its left
		const c = Math.cos(s.yaw);
		const sn = Math.sin(s.yaw);
		const ahead = -s.vx * sn - s.vz * c;
		const right = s.vx * c - s.vz * sn;
		const mx = -right;
		const mz = ahead;
		const speed = Math.hypot(mx, mz);
		const moving = speed > 0.3;
		let aimUpper = st.ads > 0.5;
		if (s.downed) {
			const a = this.loop('z_crawl_fast', clamp(speed / this.clip('z_crawl_fast').speed, 0, 1.2));
			if (!moving) a.timeScale = 0;
			aimUpper = false;
		} else if (s.air) {
			this.loop('jump_loop', 1, 0.15);
		} else if (st.slide > 0.5) {
			this.loop('rifle_crouch', 1, 0.12);
		} else if (st.crouch > 0.5) {
			if (moving) this.walk('crouch', mx, mz, speed);
			else this.loop(st.ads > 0.5 ? 'rifle_crouch_aim' : 'rifle_crouch', 1);
			aimUpper = aimUpper && moving;
		} else if (st.sprint > 0.5 && moving) {
			const name = mx > 0.4 * mz ? 'sprint_fl' : mx < -0.4 * mz ? 'sprint_fr' : 'sprint_f';
			this.loop(name, clamp(speed / this.clip(name).speed, 0.7, 1.4));
			aimUpper = false;
		} else if (moving) {
			if (s.pistol) this.pistolWalk(mx, mz, speed);
			else this.walk(speed > 3 ? 'run' : 'walk', mx, mz, speed);
		} else {
			this.loop(s.pistol ? 'pistol_idle' : st.ads > 0.5 ? 'rifle_aim' : 'rifle_idle', 1);
			aimUpper = aimUpper && s.pistol;
		}

		// the arms: a knife, a reload, a shot, or holding the aim, in that order
		const stabbed = this.knifes >= 0 && s.knifes !== this.knifes;
		const fired = this.shots >= 0 && s.shots !== this.shots;
		this.knifes = s.knifes;
		this.shots = s.shots;
		this.oneShot -= dt;
		if (s.downed) {
			this.overlay(null);
		} else if (stabbed) {
			this.overlay('stab', 0.06, { once: true, restart: true })!.timeScale = 3.2;
			this.oneShot = 0.7;
		} else if (this.oneShot > 0) {
			// a stab or a shot plays out
		} else if (s.reloading) {
			const a = this.overlay('reload', 0.15, { once: true })!;
			a.timeScale = this.clip('reload').full.duration / Math.max(0.5, s.reload);
		} else if (fired) {
			this.overlay('fire', 0.04, { once: true, restart: true });
			this.oneShot = 0.15;
		} else {
			this.overlay(aimUpper ? 'rifle_aim' : null, 0.2);
		}
		this.advance(dt, s.x, s.y, s.z, s.yaw);
		if (!s.downed && st.sprint < 0.5) this.bend(st.pitch);
		this.read();
	}

	// eight ways at a walk, a run or a crouch
	private walk(kind: 'walk' | 'run' | 'crouch', mx: number, mz: number, speed: number) {
		const a = Math.atan2(mx, mz);
		const dirs = ['f', 'fl', 'l', 'bl', 'b', 'br', 'r', 'fr'];
		const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
		const name = `${kind}_${dirs[i]}`;
		this.loop(name, clamp(speed / this.clip(name).speed, 0.6, 1.5));
	}

	private pistolWalk(mx: number, mz: number, speed: number) {
		const run = speed > 3;
		let name: string;
		if (Math.abs(mx) > Math.abs(mz)) name = mx > 0 ? 'pistol_strafe_a' : 'pistol_strafe_b';
		else if (mz >= 0) name = run ? 'pistol_run_f' : 'pistol_walk_f';
		else name = run ? 'pistol_run_b' : 'pistol_walk_b';
		this.loop(name, clamp(speed / this.clip(name).speed, 0.6, 1.5));
	}

	// where the head is, for a name over it
	headHeight() {
		return this.joints[J.headTop * 3 + 1];
	}

	setVisible(visible: boolean) {
		this.root.visible = visible;
	}

	place() {
		if (!this.ragdolling) return;
		const j = this.joints;
		// the torso turns as its frame of hips, neck and shoulders has turned
		this.root.updateMatrixWorld(true);
		torsoFrame(j, q);
		q2.copy(q).multiply(this.torso0);
		setWorld(this.bones.hips, this.start.get('hips')!.q, q2, v.fromArray(j, J.pelvis * 3));
		// then each limb swings to lie along its two joints
		for (const [key, a, b] of LIMBS) {
			const bone = this.bones[key];
			const from = this.start.get(key)!;
			w.fromArray(j, b * 3)
				.sub(v.fromArray(j, a * 3))
				.normalize();
			q.setFromUnitVectors(from.dir, w);
			bone.parent!.updateMatrixWorld(true);
			setWorld(bone, from.q, q, null);
		}
		this.root.updateMatrixWorld(true);
	}

	// Called as the ragdoll takes over: notes the pose it starts from.
	startRagdoll() {
		this.ragdolling = true;
		this.mixer.stopAllAction();
		this.root.updateMatrixWorld(true);
		const j = this.joints;
		this.start.set('hips', {
			q: this.bones.hips.getWorldQuaternion(new THREE.Quaternion()),
			dir: new THREE.Vector3()
		});
		for (const [key, a, b] of LIMBS) {
			this.start.set(key, {
				q: this.bones[key].getWorldQuaternion(new THREE.Quaternion()),
				dir: new THREE.Vector3()
					.fromArray(j, b * 3)
					.sub(v.fromArray(j, a * 3))
					.normalize()
			});
		}
		torsoFrame(j, this.torso0);
		this.torso0.invert();
	}

	hideHead() {
		this.bones.head.scale.setScalar(0.001);
	}

	setOpacity(opacity: number) {
		for (const mat of this.materials) {
			mat.transparent = opacity < 0.99;
			mat.opacity = opacity;
			mat.depthWrite = opacity > 0.99;
		}
	}

	dispose() {
		this.mixer.stopAllAction();
		this.mixer.uncacheRoot(this.model);
		this.root.removeFromParent();
		for (const mat of this.materials) mat.dispose();
	}
}

function clamp(x: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, x));
}

function isDone(action: THREE.AnimationAction, share: number) {
	return action.time >= action.getClip().duration * share;
}

// turns a bone about a world axis
function turnWorld(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
	bone.parent!.updateMatrixWorld(true);
	bone.parent!.getWorldQuaternion(q2);
	q.setFromAxisAngle(axis, angle);
	// local' = parent⁻¹ · turn · parent · local
	const turn = q2.clone().invert().multiply(q).multiply(q2);
	bone.quaternion.premultiply(turn);
	bone.updateMatrixWorld(true);
}

// puts a bone at world turn (delta · start), and at a world position if given
function setWorld(
	bone: THREE.Bone,
	start: THREE.Quaternion,
	delta: THREE.Quaternion,
	at: THREE.Vector3 | null
) {
	const parent = bone.parent!;
	parent.updateMatrixWorld(true);
	parent.getWorldQuaternion(q2);
	const want = delta.clone().multiply(start);
	bone.quaternion.copy(q2.invert().multiply(want));
	if (at) {
		m.copy(parent.matrixWorld).invert();
		bone.position.copy(at).applyMatrix4(m);
	}
	bone.updateMatrixWorld(true);
}

// the torso's turn: up along the spine, across the shoulders
function torsoFrame(j: Joints, out: THREE.Quaternion) {
	up.fromArray(j, J.neck * 3)
		.sub(v.fromArray(j, J.pelvis * 3))
		.normalize();
	side.fromArray(j, J.lShoulder * 3).sub(v.fromArray(j, J.rShoulder * 3));
	side.addScaledVector(up, -side.dot(up)).normalize();
	fwd.crossVectors(side, up);
	m.makeBasis(side, up, fwd);
	return out.setFromRotationMatrix(m);
}
