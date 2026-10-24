import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// The world's surfaces and props: scanned textures and models from Poly
// Haven, shrunk for the web. Without them the world keeps its plain look.

const BASE = '/zombies/world/';

export const SURFACES = [
	'ground_asphalt',
	'ground_dirt',
	'fence',
	'wall_concrete',
	'wall_plaster',
	'wall_brick',
	'planks',
	'rusty_metal',
	'ground_grass',
	'ground_sidewalk',
	'ground_concrete',
	'floor_checker',
	'wall_redbrick',
	'wall_siding',
	'wall_metal',
	'roof_flat',
	'roof_shingle',
	'shutter'
] as const;
export type SurfaceName = (typeof SURFACES)[number];

export const PROPS = [
	'wooden_military_crate',
	'street_lamp_01',
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
	'trashbag',
	'covered_car',
	'fire_hydrant',
	'utility_box_02',
	'exterior_aircon_unit',
	'security_light',
	'shrub_02',
	'shrub_04',
	'painted_wooden_bench',
	'steel_frame_shelves_03',
	'wooden_crate_02',
	'concrete_road_barrier_02',
	'water_manhole_cover',
	'wooden_table_03',
	'painted_wooden_chair_01',
	'rollershutter_door'
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
	// the evening sky all round, as a picture and as the light it throws
	sky: THREE.Texture;
};

// How the sky is turned, so its sunset sits where the sun light comes from
// (west, a little south: see the sun in buildWorld).
export const SKY_TURN = new THREE.Euler(0, (-120 * Math.PI) / 180, 0);
// how strongly the sky lights the surfaces that reflect it
const SKY_LIGHT = 0.7;

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

// Loads a picture as a texture. Where the browser can, the picture is
// decoded off the main thread, so a dozen big textures arriving at once
// don't freeze the lobby. Bitmaps come already the right way up, so the
// texture is told not to flip them again.
export async function loadTexture(url: string): Promise<THREE.Texture> {
	if (typeof createImageBitmap !== 'function') return new THREE.TextureLoader().loadAsync(url);
	const bitmap = await new THREE.ImageBitmapLoader()
		.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' })
		.loadAsync(url);
	const t = new THREE.Texture(bitmap);
	t.flipY = false;
	t.needsUpdate = true;
	return t;
}

// A model loader whose mesh decoding runs on worker threads, as many as
// there are spare cores, so the models unpack in parallel.
export function modelLoader() {
	// eslint-disable-next-line react-hooks/rules-of-hooks -- a setting on the decoder, not a hook
	MeshoptDecoder.useWorkers(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)));
	return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

async function load(): Promise<Art> {
	const loader = modelLoader();
	const texture = async (name: string, color: boolean) => {
		const t = await loadTexture(`${BASE}${name}.webp`);
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.anisotropy = 8;
		if (color) t.colorSpace = THREE.SRGBColorSpace;
		return t;
	};
	const [sky, surfaces, props] = await Promise.all([
		loadTexture(`${BASE}sky.webp`).then((t) => {
			t.mapping = THREE.EquirectangularReflectionMapping;
			t.colorSpace = THREE.SRGBColorSpace;
			return t;
		}),
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
	// the props' own materials pick up the sky too
	for (const [, prop] of props)
		prop.traverse((o) => {
			const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (material?.isMeshStandardMaterial) underSky(material, sky);
		});
	return {
		surfaces: Object.fromEntries(surfaces) as Record<SurfaceName, Surface>,
		props: Object.fromEntries(props) as Record<PropName, THREE.Object3D>,
		sky
	};
}

// Lights a material with the sky: a faint reflection of it, and its colour
// in the shade. Only standard materials take it, so the plain look and the
// characters stay as they are.
export function underSky<T extends THREE.MeshStandardMaterial>(material: T, sky: THREE.Texture) {
	material.envMap = sky;
	material.envMapIntensity = SKY_LIGHT;
	material.envMapRotation = SKY_TURN;
	return material;
}

// A material for a surface, with the texture repeating every `tile` metres
// on geometry whose UVs are in metres (see metreUVs).
export function surfaceMaterial(art: Art, name: SurfaceName, tile: number, tint = '#ffffff') {
	const s = art.surfaces[name];
	const at = (t: THREE.Texture) => {
		const c = t.clone();
		c.repeat.set(1 / tile, 1 / tile);
		return c;
	};
	return underSky(
		new THREE.MeshStandardMaterial({
			color: tint,
			map: at(s.color),
			normalMap: at(s.normal),
			aoMap: at(s.arm),
			roughnessMap: at(s.arm),
			metalnessMap: at(s.arm),
			metalness: 1,
			roughness: 1
		}),
		art.sky
	);
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
