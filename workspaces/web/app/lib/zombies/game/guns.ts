import * as THREE from 'three';
import type { WeaponId } from '../weapons';
import { loadTexture, modelLoader } from './art';

// The guns and the hands that hold them: Quaternius' low-poly guns, dressed
// in scanned wood and worn metal from Poly Haven, and arms in a sleeve and
// glove. Without them the guns stay plain boxes.

const BASE = '/zombies/guns/';

// Where each gun is held, in metres, in the model's own space: the barrel
// along -z from the back of the gun at 0, y up. grip is the right hand, fore
// the left, sight the line the eye looks down, and muzzle the end of the bore.
type Fit = { grip: number[]; fore: number[]; sight: number; muzzle: number[] };

const FITS: Record<WeaponId, Fit> = {
	m1911: { grip: [0, 0, -0.04], fore: [0, -0.035, -0.05], sight: 0.088, muzzle: [0, 0.068, -0.22] },
	olympia: {
		grip: [0, -0.01, -0.11],
		fore: [0, 0.015, -0.4],
		sight: 0.09,
		muzzle: [0, 0.066, -0.6]
	},
	m14: { grip: [0, -0.02, -0.3], fore: [0, 0, -0.62], sight: 0.062, muzzle: [0, 0.046, -1.12] },
	mp5: {
		grip: [0, -0.015, -0.29],
		fore: [0, 0.06, -0.54],
		sight: 0.145,
		muzzle: [0, 0.095, -0.68]
	},
	ak74u: { grip: [0, 0, -0.045], fore: [0, 0.07, -0.33], sight: 0.13, muzzle: [0, 0.09, -0.52] },
	remington: {
		grip: [0, -0.04, -0.27],
		fore: [0, -0.005, -0.62],
		sight: 0.056,
		muzzle: [0, 0.037, -1]
	},
	galil: { grip: [0, 0, -0.31], fore: [0, 0.07, -0.64], sight: 0.15, muzzle: [0, 0.103, -0.97] },
	python: { grip: [0, 0, -0.035], fore: [0, -0.035, -0.045], sight: 0.1, muzzle: [0, 0.08, -0.3] },
	rpd: { grip: [0, 0, -0.32], fore: [0, 0.075, -0.69], sight: 0.16, muzzle: [0, 0.111, -1.04] },
	raygun: { grip: [0, 0, -0.05], fore: [0, -0.035, -0.06], sight: 0.12, muzzle: [0, 0.075, -0.3] }
};

export type GunModel = {
	// the gun, with the right hand's grip at its origin; a magazine that
	// comes out in a reload is the child named mag
	gun: THREE.Object3D;
	// the left hand's hold, the eye line and the muzzle, from the grip
	fore: THREE.Vector3;
	// how far the gun reaches back behind the grip
	back: number;
	sight: number;
	muzzle: THREE.Vector3;
};

export type Kit = {
	guns: Record<WeaponId, GunModel>;
	sleeve: THREE.Material;
	glove: THREE.Material;
};

let loading: Promise<Kit | null> | null = null;

// Loads every gun once. Resolves to null if anything fails.
export function loadGuns(): Promise<Kit | null> {
	loading ??= load().catch((err) => {
		console.warn('zombies: guns failed to load, drawing them plain', err);
		return null;
	});
	return loading;
}

type Set3 = { color: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture };

async function load(): Promise<Kit> {
	const loader = modelLoader();
	const texture = async (name: string, color: boolean) => {
		const t = await loadTexture(`${BASE}${name}.webp`);
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.anisotropy = 4;
		if (color) t.colorSpace = THREE.SRGBColorSpace;
		return t;
	};
	const set = async (name: string): Promise<Set3> => {
		const [color, normal, arm] = await Promise.all([
			texture(`${name}_color`, true),
			texture(`${name}_normal`, false),
			texture(`${name}_arm`, false)
		]);
		return { color, normal, arm };
	};
	const ids = (Object.keys(FITS) as WeaponId[]).filter((id) => id !== 'raygun');
	const [wood, wear, sleeve, glove, ...models] = await Promise.all([
		set('wood'),
		texture('metal_arm', false),
		set('sleeve'),
		set('glove'),
		...ids.map((id) => loader.loadAsync(`${BASE}${id}.glb`))
	]);
	const finishes = new Map<string, THREE.Material>();
	const finish = (m: THREE.MeshStandardMaterial) => {
		let f = finishes.get(m.name);
		if (!f) {
			f = /wood/i.test(m.name) ? stock(m, wood) : steel(m, wear);
			finishes.set(m.name, f);
		}
		return f;
	};
	const guns = {} as Record<WeaponId, GunModel>;
	ids.forEach((id, i) => {
		const scene = models[i].scene as THREE.Object3D;
		scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			mesh.material = finish(mesh.material as THREE.MeshStandardMaterial);
			mesh.castShadow = true;
		});
		guns[id] = fitted(scene, FITS[id]);
	});
	guns.raygun = fitted(rayGun(wear), FITS.raygun);
	return {
		guns,
		sleeve: fabric(sleeve, '#6e6448', 0.4),
		glove: fabric(glove, '#4a4038', 0.12)
	};
}

const tile = (t: THREE.Texture, n: number) => {
	const c = t.clone();
	c.repeat.set(n, n);
	return c;
};

// Wooden parts in scanned walnut: a lighter and a darker stain, after the
// flat colours the guns come with.
function stock(m: THREE.MeshStandardMaterial, s: Set3) {
	const dark = m.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.05;
	return new THREE.MeshStandardMaterial({
		name: m.name,
		color: dark ? '#7c6050' : '#a88a70',
		map: tile(s.color, 7),
		normalMap: tile(s.normal, 7),
		roughnessMap: tile(s.arm, 7),
		roughness: 0.85,
		metalness: 0
	});
}

// Metal parts in their own shade, lifted out of near black, with worn
// patches where the finish has rubbed shiny.
function steel(m: THREE.MeshStandardMaterial, wear: THREE.Texture) {
	const tint = m.color.clone();
	const hsl = tint.getHSL({ h: 0, s: 0, l: 0 });
	tint.setHSL(hsl.h, hsl.s * 0.5, 0.012 + hsl.l);
	return new THREE.MeshStandardMaterial({
		name: m.name,
		color: tint,
		roughnessMap: tile(wear, 6),
		roughness: 0.75,
		metalness: 0.5
	});
}

function fabric(s: Set3, tint: string, tile: number) {
	const at = (t: THREE.Texture) => {
		const c = t.clone();
		c.repeat.set(1 / tile, 1 / tile);
		return c;
	};
	return new THREE.MeshStandardMaterial({
		color: tint,
		map: at(s.color),
		normalMap: at(s.normal),
		roughnessMap: at(s.arm),
		roughness: 1,
		metalness: 0
	});
}

// Moves a gun so its grip is at the origin.
function fitted(scene: THREE.Object3D, fit: Fit): GunModel {
	const grip = new THREE.Vector3().fromArray(fit.grip);
	const gun = new THREE.Group();
	scene.position.sub(grip);
	gun.add(scene);
	return {
		gun,
		fore: new THREE.Vector3().fromArray(fit.fore).sub(grip),
		back: -grip.z,
		sight: fit.sight - grip.y,
		muzzle: new THREE.Vector3().fromArray(fit.muzzle).sub(grip)
	};
}

// The Ray Gun, which no pack has: a ribbed bell of a barrel over a pistol
// grip, red and chrome, with a green glow inside.
function rayGun(wear: THREE.Texture): THREE.Object3D {
	const root = new THREE.Group();
	const red = new THREE.MeshStandardMaterial({
		color: '#8f1d16',
		metalness: 0.5,
		roughness: 0.45
	});
	const chrome = new THREE.MeshStandardMaterial({
		color: '#b9b9b4',
		metalness: 1,
		roughness: 0.3,
		roughnessMap: wear
	});
	const glow = new THREE.MeshStandardMaterial({
		color: '#1d3b1f',
		emissive: '#5dff74',
		emissiveIntensity: 1.6
	});
	// the body: a bulb that flares into a dish at the muzzle
	const profile = [
		[0, 0],
		[0.03, 0.005],
		[0.045, 0.04],
		[0.046, 0.1],
		[0.032, 0.16],
		[0.026, 0.2],
		[0.03, 0.24],
		[0.058, 0.29],
		[0.06, 0.3],
		[0.02, 0.3]
	].map(([r, y]) => new THREE.Vector2(r * 0.65, y));
	const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), red);
	body.rotation.x = -Math.PI / 2;
	body.position.set(0, 0.075, 0);
	// chrome rings round the waist
	for (let i = 0; i < 3; i++) {
		const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024 - i * 0.002, 0.005, 8, 20), chrome);
		ring.position.set(0, 0.075, -0.17 - i * 0.03);
		root.add(ring);
	}
	// the glowing cell in a window on top
	const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10), glow);
	cell.rotation.x = Math.PI / 2;
	cell.position.set(0, 0.104, -0.08);
	const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), glow);
	muzzle.position.set(0, 0.075, -0.299);
	muzzle.rotation.y = Math.PI;
	const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.045), chrome);
	grip.position.set(0, -0.0, -0.05);
	grip.rotation.x = 0.3;
	const guard = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI), chrome);
	guard.position.set(0, 0.035, -0.09);
	guard.rotation.set(Math.PI, Math.PI / 2, 0);
	root.add(body, cell, muzzle, grip, guard);
	root.traverse((o) => {
		if ((o as THREE.Mesh).isMesh) o.castShadow = true;
	});
	return root;
}
