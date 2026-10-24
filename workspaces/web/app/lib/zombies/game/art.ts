import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// The world's surfaces and props: scanned textures and models from Poly
// Haven, shrunk for the web. Without them the world keeps its plain look.

const BASE = '/zombies/world/';

export const SURFACES = [
	'floor',
	'wall_concrete',
	'wall_plaster',
	'wall_brick',
	'planks',
	'rusty_metal'
] as const;
export type SurfaceName = (typeof SURFACES)[number];

export const PROPS = [
	'wooden_military_crate',
	'mounted_fluorescent_lights',
	'old_military_crate',
	'barrel_01',
	'metal_trash_can',
	'concrete_road_barrier',
	'steel_frame_shelves_02',
	'wheelchair_01',
	'portable_generator',
	'power_box_01',
	'old_tyre',
	'cardboard_box_01',
	'trashbag'
] as const;
export type PropName = (typeof PROPS)[number];

export type Surface = {
	color: THREE.Texture;
	normal: THREE.Texture;
	// ambient occlusion, roughness and metalness in red, green and blue
	arm: THREE.Texture;
};

export type Art = {
	surfaces: Record<SurfaceName, Surface>;
	props: Record<PropName, THREE.Object3D>;
};

let loading: Promise<Art | null> | null = null;

// Loads every texture and prop, once. Resolves to null if anything fails,
// and the world is drawn plain.
export function loadArt(): Promise<Art | null> {
	loading ??= load().catch((err) => {
		console.warn('zombies: world art failed to load, drawing it plain', err);
		return null;
	});
	return loading;
}

async function load(): Promise<Art> {
	const textures = new THREE.TextureLoader();
	const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
	const texture = async (name: string, color: boolean) => {
		const t = await textures.loadAsync(`${BASE}${name}.webp`);
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.anisotropy = 8;
		if (color) t.colorSpace = THREE.SRGBColorSpace;
		return t;
	};
	const [surfaces, props] = await Promise.all([
		Promise.all(
			SURFACES.map(async (name) => {
				const [color, normal, arm] = await Promise.all([
					texture(`${name}_color`, true),
					texture(`${name}_normal`, false),
					texture(`${name}_arm`, false)
				]);
				return [name, { color, normal, arm }] as const;
			})
		),
		Promise.all(
			PROPS.map(async (name) => {
				const gltf = await loader.loadAsync(`${BASE}${name}.glb`);
				gltf.scene.traverse((o) => {
					if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
				});
				return [name, gltf.scene as THREE.Object3D] as const;
			})
		)
	]);
	return {
		surfaces: Object.fromEntries(surfaces) as Record<SurfaceName, Surface>,
		props: Object.fromEntries(props) as Record<PropName, THREE.Object3D>
	};
}

// A material for a surface, with the texture repeating every `tile` metres
// on geometry whose UVs are in metres (see metreUVs).
export function surfaceMaterial(s: Surface, tile: number, tint = '#ffffff') {
	const at = (t: THREE.Texture) => {
		const c = t.clone();
		c.repeat.set(1 / tile, 1 / tile);
		return c;
	};
	return new THREE.MeshStandardMaterial({
		color: tint,
		map: at(s.color),
		normalMap: at(s.normal),
		aoMap: at(s.arm),
		roughnessMap: at(s.arm),
		metalnessMap: at(s.arm),
		metalness: 1,
		roughness: 1
	});
}

// Stretches a box's UVs so one unit is one metre on every face, so a texture
// keeps its size whatever the box's shape.
export function metreUVs(geometry: THREE.BoxGeometry) {
	const { width, height, depth } = geometry.parameters;
	// faces in order +x, -x, +y, -y, +z, -z, four corners each
	const sizes: [number, number][] = [
		[depth, height],
		[depth, height],
		[width, depth],
		[width, depth],
		[width, height],
		[width, height]
	];
	const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
	for (let face = 0; face < 6; face++) {
		const [u, v] = sizes[face];
		for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
	}
	uv.needsUpdate = true;
	return geometry;
}
