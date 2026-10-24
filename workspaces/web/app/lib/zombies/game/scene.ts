import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLS, ROWS, WINDOW_BOARDS, type Door, type GameMap, type Machine } from '../map';
import type { Finish, GroundKind, Layout, PropKind, Pt, WallKind } from '../layout';
import type { BoxSnap } from '../protocol';
import {
	SKY_TURN,
	surfaceMaterial,
	underSky,
	type Art,
	type PropName,
	type SurfaceName
} from './art';
import { BOX, PERKS, type PerkId } from '../rules';
import type { Shadows } from '../settings';
import { WEAPONS, ammoCost, type WeaponId } from '../weapons';
import { VIEW_LAYER } from './viewmodel';

// The world is drawn the way the rest of rafe.dev looks: pale grays, a soft
// haze, and type in Geist. Zombies are the darkest thing in it, so they read
// at a glance.
export const PALETTE = {
	sky: '#ececec',
	floor: '#d6d6d6',
	floorLine: '#c7c7c7',
	wall: '#f1f1f1',
	door: '#a3a3a3',
	ink: '#3d3d3d'
};
const FONT = '"Geist Variable", system-ui, sans-serif';

// with real textures the world is a run-down town at dusk, under a sunset
// sky: the haze is the sky's colour at the horizon, and the town beyond the
// map stands against it in silhouette
export const DUSK = {
	haze: '#675b68',
	silhouette: '#4a4050',
	chalk: '#ece6d6'
};

export type World = {
	root: THREE.Group;
	// the haze everything fades into, and the sky's colour without a picture
	sky: string;
	// gives a scene the sky and the haze
	dress(scene: THREE.Scene): void;
	openDoor(index: number): void;
	closeDoors(): void;
	setBoards(index: number, boards: number): void;
	setBox(box: BoxSnap): void;
	update(dt: number): void;
	// keeps the shadow map centred on the player
	follow(x: number, z: number): void;
	setShadows(quality: Shadows): void;
};

const WORLD_X = COLS;
const WORLD_Z = ROWS;
// the shadow map covers a square this far each way round the player, rather
// than the whole map, so each of its texels is a few centimetres across
const SHADOW_HALF = 36;
const SUN_DISTANCE = 70;
const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SILL = 0.9;
const LINTEL = 2.1;
const DOOR_TOP = 2.3;
const ROOM_WALL = 0.3;
const FACADE = 0.25; // how deep a building's walls are drawn, inward

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	draw(canvas.getContext('2d')!);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

// A seeded random, so the town looks the same for everyone.
function seeded(seed: number) {
	return () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
}

// ---- materials ---------------------------------------------------------------

type Materials = {
	finish: Record<Finish, THREE.Material>;
	inner: THREE.Material;
	ground: Record<GroundKind, THREE.Material>;
	roof: THREE.Material;
	shingle: THREE.Material;
	ceiling: THREE.Material;
	trim: THREE.Material;
	concrete: THREE.Material;
	wood: THREE.Material;
	metal: THREE.Material;
	shutter: THREE.Material;
	dark: THREE.Material;
	paint: THREE.Material;
	hedge: THREE.Material;
	leaves: THREE.Material;
	glass: THREE.Material;
	glassLit: THREE.Material;
	chainlink: THREE.Material;
	water: THREE.Material;
	litter: THREE.Material[];
};

function materials(art: Art | null): Materials {
	const plain = (color: string) => new THREE.MeshLambertMaterial({ color });
	const s = (name: SurfaceName, tile: number, tint?: string) =>
		art ? surfaceMaterial(art, name, tile, tint) : null;
	const pick = (m: THREE.Material | null, color: string) => m ?? plain(color);
	// a material of our own that takes the sky's light
	const sky = <T extends THREE.MeshStandardMaterial>(m: T) => (art ? underSky(m, art.sky) : m);
	const ground = (
		name: SurfaceName,
		tile: number,
		tint: string | undefined,
		color: string,
		layer: number
	) => {
		const m = pick(s(name, tile, tint), color);
		m.polygonOffset = true;
		m.polygonOffsetFactor = -layer;
		m.polygonOffsetUnits = -layer;
		return m;
	};
	return {
		finish: {
			brick: pick(s('wall_brick', 2.5, '#b8998a'), '#efefef'),
			brick_red: pick(s('wall_redbrick', 2.2, '#c9a89a'), '#ececec'),
			plaster: pick(s('wall_plaster', 3, '#e6cfaa'), '#f4f4f4'),
			concrete: pick(s('wall_concrete', 3), '#e9e9e9'),
			siding: pick(s('wall_siding', 2.5, '#e4eef2'), '#f2f2f2'),
			metal: pick(s('wall_metal', 2.5, '#c4bcb0'), '#e4e4e4')
		},
		inner: pick(s('wall_plaster', 3, '#e8dfcf'), '#f6f6f6'),
		ground: {
			dirt: ground('ground_dirt', 4, '#a89a88', PALETTE.floor, 0),
			asphalt: ground('ground_asphalt', 4, '#8e97a8', '#d0d0d0', 2),
			sidewalk: ground('ground_sidewalk', 2.4, '#b8b2a6', '#dedede', 1),
			concrete: ground('ground_concrete', 4, '#b3ada3', '#dadada', 1),
			grass: ground('ground_grass', 3, '#8a9070', '#d9d9d9', 3),
			tile: ground('floor_checker', 1.6, '#cfc8bb', '#e2e2e2', 4)
		},
		roof: pick(s('roof_flat', 3, '#8a8580'), '#e0e0e0'),
		shingle: pick(s('roof_shingle', 2.5, '#9a9590'), '#dcdcdc'),
		ceiling: plain(art ? '#4a4540' : '#f0f0f0'),
		trim: plain(art ? '#3d3a36' : '#e6e6e6'),
		concrete: pick(s('wall_concrete', 2), '#e8e8e8'),
		wood: pick(s('planks', 1.2, '#b8a48a'), '#c9b9a3'),
		metal: pick(s('rusty_metal', 1.5), PALETTE.door),
		shutter: pick(s('shutter', 2.4, '#b0aaa0'), '#e2e2e2'),
		dark: new THREE.MeshBasicMaterial({ color: art ? '#07080a' : '#bdbdbd' }),
		paint: new THREE.MeshLambertMaterial({
			color: art ? '#d9d2b0' : '#bdbdbd',
			transparent: true,
			opacity: 0.6,
			polygonOffset: true,
			polygonOffsetFactor: -6,
			polygonOffsetUnits: -6
		}),
		hedge: art
			? sky(
					new THREE.MeshStandardMaterial({
						color: '#4f6136',
						map: art.surfaces.ground_grass.color,
						roughness: 1,
						flatShading: true
					})
				)
			: plain('#dcdcdc'),
		leaves: sky(
			new THREE.MeshStandardMaterial({
				color: art ? '#3e4a2c' : '#d6d6d6',
				roughness: 1,
				flatShading: true
			})
		),
		glass: sky(
			new THREE.MeshStandardMaterial({
				color: art ? '#1b2129' : '#cfcfcf',
				roughness: 0.25,
				metalness: 0.6
			})
		),
		glassLit: new THREE.MeshStandardMaterial({
			color: '#2a2016',
			emissive: art ? '#ffb46a' : '#000000',
			emissiveIntensity: 0.9,
			roughness: 0.4
		}),
		chainlink: sky(
			new THREE.MeshStandardMaterial({
				map: chainlinkTexture(),
				color: art ? '#b9bec4' : '#9a9a9a',
				metalness: 0.6,
				roughness: 0.5,
				alphaTest: 0.5,
				side: THREE.DoubleSide
			})
		),
		litter: ['#c4bcac', '#8d877c', '#4a4744', '#b9a98a'].map(
			(color) =>
				new THREE.MeshLambertMaterial({
					color,
					polygonOffset: true,
					polygonOffsetFactor: -6,
					polygonOffsetUnits: -6
				})
		),
		water: sky(
			new THREE.MeshStandardMaterial({
				color: '#0c0d10',
				roughness: 0.05,
				metalness: 0.9,
				transparent: true,
				opacity: 0.8,
				polygonOffset: true,
				polygonOffsetFactor: -7,
				polygonOffsetUnits: -7
			})
		)
	};
}

// A diamond mesh of wire, repeating every 10 cm.
function chainlinkTexture() {
	const t = canvasTexture(64, 64, (g) => {
		g.clearRect(0, 0, 64, 64);
		g.strokeStyle = '#fff';
		g.lineWidth = 3;
		g.beginPath();
		g.moveTo(0, 32);
		g.lineTo(32, 0);
		g.lineTo(64, 32);
		g.lineTo(32, 64);
		g.closePath();
		g.stroke();
	});
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set(1 / 0.1, 1 / 0.1);
	return t;
}

// ---- geometry helpers ------------------------------------------------------

// Static geometry, gathered by material and merged at the end into one mesh
// each, so the town draws in a few dozen calls.
class Batch {
	private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
	add(material: THREE.Material, geometry: THREE.BufferGeometry) {
		const list = this.parts.get(material) ?? [];
		list.push(geometry.index ? geometry.toNonIndexed() : geometry);
		this.parts.set(material, list);
	}
	flush(root: THREE.Object3D, { shadows = true } = {}) {
		for (const [material, list] of this.parts) {
			for (const g of list) {
				for (const name of Object.keys(g.attributes))
					if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
			}
			const merged = mergeGeometries(list, false);
			if (!merged) continue;
			const mesh = new THREE.Mesh(merged, material);
			mesh.castShadow = shadows && !(material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
			mesh.receiveShadow = true;
			mesh.matrixAutoUpdate = false;
			root.add(mesh);
		}
		this.parts.clear();
	}
}

// A box standing on a wall line: `len` along the line from a, `h` tall from y,
// `t` thick, pushed `off` along the line's left normal. UVs are in metres,
// running on along the wall from `u`, so pieces of one wall line up.
function wallBox(
	a: Pt,
	b: Pt,
	s0: number,
	s1: number,
	y0: number,
	y1: number,
	t: number,
	off: number
): THREE.BufferGeometry {
	const len = s1 - s0;
	const h = y1 - y0;
	const g = new THREE.BoxGeometry(len, h, t);
	const uv = g.getAttribute('uv') as THREE.BufferAttribute;
	const pos = g.getAttribute('position') as THREE.BufferAttribute;
	// faces in order +x, -x, +y, -y, +z, -z, four corners each
	for (let i = 0; i < uv.count; i++) {
		const face = Math.floor(i / 4);
		const x = pos.getX(i) + len / 2 + s0;
		const y = pos.getY(i) + h / 2 + y0;
		const z = pos.getZ(i);
		if (face >= 4) uv.setXY(i, face === 4 ? x : -x, y);
		else if (face >= 2) uv.setXY(i, x, z);
		else uv.setXY(i, z, y);
	}
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const L = Math.hypot(dx, dz);
	const ux = dx / L;
	const uz = dz / L;
	const mid = (s0 + s1) / 2;
	g.rotateY(-Math.atan2(dz, dx));
	g.translate(a[0] + ux * mid - uz * off, y0 + h / 2, a[1] + uz * mid + ux * off);
	return g;
}

// A flat polygon at height y, facing up (or down), UVs in metres.
function flat(poly: Pt[], y: number, down = false): THREE.BufferGeometry {
	const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
	const g = new THREE.ShapeGeometry(shape);
	g.rotateX(-Math.PI / 2);
	g.translate(0, y, 0);
	if (down) {
		// the triangles turned over, to face down
		const idx = g.index!;
		for (let i = 0; i < idx.count; i += 3) {
			const t = idx.getX(i);
			idx.setX(i, idx.getX(i + 2));
			idx.setX(i + 2, t);
		}
		g.computeVertexNormals();
	}
	return g;
}

const signedArea = (poly: Pt[]) =>
	poly.reduce((sum, [x, z], i) => {
		const [nx, nz] = poly[(i + 1) % poly.length];
		return sum + x * nz - nx * z;
	}, 0) / 2;

// A polygon's edges, each with the unit normal pointing out of it.
function outline(poly: Pt[]) {
	// in x-right, z-down, a positive area runs clockwise on screen and the
	// left normal points in
	const flip = signedArea(poly) > 0 ? -1 : 1;
	return poly.map((a, i) => {
		const b = poly[(i + 1) % poly.length];
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const nx = (-(b[1] - a[1]) / len) * flip;
		const nz = ((b[0] - a[0]) / len) * flip;
		// left of a to b is the normal the wall builder pushes along
		return { a, b, len, nx, nz, outLeft: flip > 0 };
	});
}

// A gap in a wall: where along it (s0 to s1) and how high (y0 to y1).
type Hole = { s0: number; s1: number; y0: number; y1: number };

// The doors, windows and openings lying along a wall line.
function holesIn(a: Pt, b: Pt, layout: Layout, height: number): Hole[] {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const len = Math.hypot(dx, dz);
	const ux = dx / len;
	const uz = dz / len;
	const out: Hole[] = [];
	const take = ([p, q]: Pt[], y0: number, y1: number) => {
		const off = (v: Pt) => Math.abs((v[0] - a[0]) * -uz + (v[1] - a[1]) * ux);
		if (off(p) > 0.12 || off(q) > 0.12) return;
		const s0 = (p[0] - a[0]) * ux + (p[1] - a[1]) * uz;
		const s1 = (q[0] - a[0]) * ux + (q[1] - a[1]) * uz;
		const lo = Math.max(0, Math.min(s0, s1));
		const hi = Math.min(len, Math.max(s0, s1));
		if (hi - lo > 0.05) out.push({ s0: lo, s1: hi, y0, y1: Math.min(y1, height) });
	};
	for (const d of layout.doors) take(d.at, 0, d.kind === 'door' ? DOOR_TOP : Infinity);
	for (const w of layout.windows) take(w, SILL, LINTEL);
	for (const o of layout.openings) take(o, 0, height > 3 ? Math.min(height - 0.6, 3) : Infinity);
	return out.sort((p, q) => p.s0 - q.s0);
}

// A wall from a to b with its holes left open: full-height pieces between
// the holes, and pieces under and over each.
function wallWithHoles(
	batch: Batch,
	material: THREE.Material,
	a: Pt,
	b: Pt,
	holes: Hole[],
	height: number,
	t: number,
	off: number
) {
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
	let s = 0;
	for (const hole of holes) {
		if (hole.s0 > s + 0.01) batch.add(material, wallBox(a, b, s, hole.s0, 0, height, t, off));
		if (hole.y0 > 0.01) batch.add(material, wallBox(a, b, hole.s0, hole.s1, 0, hole.y0, t, off));
		if (hole.y1 < height - 0.01)
			batch.add(material, wallBox(a, b, hole.s0, hole.s1, hole.y1, height, t, off));
		s = Math.max(s, hole.s1);
	}
	if (len > s + 0.01) batch.add(material, wallBox(a, b, s, len, 0, height, t, off));
}

// ---- the world -------------------------------------------------------------

export function buildWorld(map: GameMap, art: Art | null = null): World {
	const root = new THREE.Group();
	const layout = map.layout;
	const sky = art ? DUSK.haze : PALETTE.sky;
	const m = materials(art);
	const batch = new Batch();
	const random = seeded(11);
	const lights: { light: THREE.PointLight; base: number; flicker: number }[] = [];
	// props and the like, placed as objects of their own and gathered into
	// instances once they're all down (see instanceStatics)
	const statics = new THREE.Group();
	root.add(statics);

	// the ground, each layer a hair above the last
	layout.ground.forEach((g, i) => {
		batch.add(m.ground[g.kind], flat(g.poly, 0.0005 * i));
	});
	for (const [a, b] of layout.paint) {
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const g = new THREE.PlaneGeometry(len, 0.14);
		g.rotateX(-Math.PI / 2);
		g.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0]));
		g.translate((a[0] + b[0]) / 2, 0.012, (a[1] + b[1]) / 2);
		batch.add(m.paint, g);
	}
	// kerbs along the road
	for (const line of layout.curbs) {
		for (let i = 0; i < line.length - 1; i++) {
			const [a, b] = [line[i], line[i + 1]];
			const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			batch.add(m.concrete, wallBox(a, b, -0.1, len + 0.1, 0, 0.1, 0.22, 0));
		}
	}

	for (const b of layout.buildings) buildBuilding(batch, b, layout, m, random, art);
	for (const room of layout.rooms) lights.push(...buildRoom(root, batch, room, layout, m, art));
	for (const w of layout.walls) buildWall(statics, batch, w.kind, w.line, layout, m, art, random);
	for (const c of layout.canopies) {
		const roof = new THREE.ExtrudeGeometry(
			new THREE.Shape(c.poly.map(([x, z]) => new THREE.Vector2(x, -z))),
			{ depth: 0.5, bevelEnabled: false }
		);
		roof.rotateX(-Math.PI / 2);
		roof.translate(0, c.height, 0);
		batch.add(m.finish.metal, roof);
		// lit from under
		const under = flat(c.poly, c.height - 0.01, true);
		batch.add(m.glassLit, under);
		const lamp = new THREE.PointLight('#e8f0ff', art ? 6 : 0, 14, 1.6);
		const [cx, cz] = centroid(c.poly);
		lamp.position.set(cx, c.height - 0.6, cz);
		root.add(lamp);
		lights.push({ light: lamp, base: lamp.intensity, flicker: 0.04 });
	}

	const fires: Fire[] = [];
	if (art) placeProps(statics, batch, layout, art, m, random, fires);
	else placePlainProps(batch, layout, m);
	if (art) {
		puddles(batch, layout, m, random);
		litter(batch, layout, m, random);
		wires(root, layout);
	}
	const lava = art ? lavaCracks(root, layout, random) : null;
	const windows = buildWindows(root, batch, map, layout, art);
	batch.flush(root);
	instanceStatics(statics);
	if (art) root.add(skyline(random), outskirts(map, m, random), stars(random));

	const doors = map.doors.map((d) => buildDoor(root, d, m, art));

	// wall guns, drawn in chalk on the wall's face
	for (const wall of map.wallBuys) {
		const weapon = WEAPONS[wall.weapon];
		const texture = canvasTexture(512, 256, (g) => {
			g.strokeStyle = art ? DUSK.chalk : PALETTE.ink;
			g.fillStyle = art ? DUSK.chalk : PALETTE.ink;
			g.lineWidth = 5;
			g.lineJoin = 'round';
			// a side-on gun, as long as the real one
			const len = 120 + weapon.length * 380;
			const left = 256 - len / 2;
			g.strokeRect(left, 70, len, 34);
			g.strokeRect(left + len * 0.62, 104, 26, 50);
			if (weapon.length > 0.4) g.strokeRect(left + len * 0.2, 104, 22, 34);
			g.textAlign = 'center';
			g.font = `500 40px ${FONT}`;
			g.fillText(weapon.name, 256, 196);
			g.font = `500 28px ${FONT}`;
			g.globalAlpha = 0.7;
			g.fillText(`${weapon.cost} · AMMO ${ammoCost(weapon)}`, 256, 236);
		});
		const plane = new THREE.Mesh(
			new THREE.PlaneGeometry(1.8, 0.9),
			new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
		);
		const face = faceDepth(layout, wall.x, wall.z) + 0.015;
		plane.position.set(wall.x + wall.nx * face, 1.55, wall.z + wall.nz * face);
		plane.lookAt(wall.x + wall.nx * 2, 1.55, wall.z + wall.nz * 2);
		root.add(plane);
	}

	let box: ReturnType<typeof buildBox> | null = null;
	for (const machine of map.machines) {
		if (machine.kind === 'box') box = buildBox(root, machine, art);
		else buildPerk(root, machine, machine.kind);
	}

	// with the art the sky itself lights what reflects it (see underSky), so
	// the hemisphere light only fills in the rest
	const ambient = art
		? new THREE.HemisphereLight('#a394b6', '#6a5a48', 2)
		: new THREE.HemisphereLight('#ffffff', '#9a9a9a', 1.6);
	root.add(ambient);
	const sun = art
		? new THREE.DirectionalLight('#ffad72', 2.6)
		: new THREE.DirectionalLight('#ffffff', 1.5);
	// with the art, a low sun setting off to the west
	const sunDir = (art ? new THREE.Vector3(-60, 30, 24) : new THREE.Vector3(20, 50, 12)).normalize();
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	Object.assign(sun.shadow.camera, {
		left: -SHADOW_HALF,
		right: SHADOW_HALF,
		top: SHADOW_HALF,
		bottom: -SHADOW_HALF,
		near: 1,
		far: SUN_DISTANCE * 2 + 40
	});
	sun.shadow.camera.updateProjectionMatrix();
	sun.shadow.bias = -0.0004;
	// the gun in hand is drawn in its own pass and needs the same light
	ambient.layers.enable(VIEW_LAYER);
	sun.layers.enable(VIEW_LAYER);
	sun.shadow.normalBias = 0.03;
	root.add(sun, sun.target);
	// the light's own frame, so its target can be snapped to the shadow
	// map's texels: moved freely, the shadows' edges would crawl with every
	// step the player took
	const sunFrame = new THREE.Quaternion().setFromRotationMatrix(
		new THREE.Matrix4().lookAt(sunDir, ORIGIN, UP)
	);
	const sunFrameBack = sunFrame.clone().invert();
	const snap = new THREE.Vector3();
	const follow = (x: number, z: number) => {
		const texel = (2 * SHADOW_HALF) / sun.shadow.mapSize.width;
		snap.set(x, 0, z).applyQuaternion(sunFrameBack);
		snap.x = Math.round(snap.x / texel) * texel;
		snap.y = Math.round(snap.y / texel) * texel;
		snap.applyQuaternion(sunFrame);
		sun.target.position.copy(snap);
		sun.position.copy(snap).addScaledVector(sunDir, SUN_DISTANCE);
	};
	follow(WORLD_X / 2, WORLD_Z / 2);

	let clock = 0;
	return {
		root,
		sky,
		dress(scene) {
			scene.background = art ? art.sky : new THREE.Color(sky);
			scene.backgroundRotation.copy(SKY_TURN);
			scene.fog = new THREE.Fog(sky, art ? 14 : 10, art ? 80 : 62);
		},
		openDoor(index) {
			const door = doors[index];
			if (door && door.opening < 0) door.opening = 0;
		},
		closeDoors() {
			for (const door of doors) {
				door.opening = -1;
				door.mesh.visible = true;
				door.mesh.position.y = 0;
			}
		},
		setBoards(index, boards) {
			windows.setBoards(index, boards);
		},
		setBox(state) {
			box?.set(state);
		},
		update(dt) {
			clock += dt;
			windows.update(dt);
			box?.update(dt);
			lava?.update(dt);
			for (const f of fires) burn(f, dt, clock);
			for (const door of doors) {
				if (door.opening < 0 || !door.mesh.visible) continue;
				door.opening += dt;
				const t = Math.min(1, door.opening / 0.8);
				door.mesh.position.y = -t * t * (door.height + 0.1);
				if (t >= 1) door.mesh.visible = false;
			}
			// tired lights buzz and dip
			for (const l of lights) {
				if (!l.flicker) continue;
				const n = Math.sin(clock * 23 + l.base) * Math.sin(clock * 7.3) * Math.sin(clock * 1.7 + 2);
				l.light.intensity = l.base * (n > 0.85 - l.flicker * 4 ? 0.25 : 1);
			}
		},
		follow,
		setShadows(quality) {
			sun.castShadow = quality !== 'off';
			const size = quality === 'high' ? 2048 : 1024;
			if (sun.shadow.mapSize.width === size) return;
			sun.shadow.mapSize.set(size, size);
			// thrown away so it's made again at the new size
			sun.shadow.map?.dispose();
			sun.shadow.map = null;
		}
	};
}

// Gathers the props into instances: every mesh drawn from the same geometry
// with the same material becomes one draw call however many times it stands
// nearby. Thirty barrels, say, were thirty calls, and thirty more for their
// shadows. They're gathered by patch of town rather than all together, since
// one instanced mesh is drawn whole or not at all: gathered across the whole
// map, every barrel would be drawn whenever any one was in view.
const INSTANCE_PATCH = 20;
function instanceStatics(group: THREE.Group) {
	group.updateMatrixWorld(true);
	const alike = new Map<string, THREE.Mesh[]>();
	const at = new THREE.Vector3();
	group.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
		if (Array.isArray(mesh.material)) return;
		// a part of a model turned off (see fitted) stays off
		for (let p: THREE.Object3D | null = mesh; p && p !== group; p = p.parent)
			if (!p.visible) return;
		at.setFromMatrixPosition(mesh.matrixWorld);
		const patch = `${Math.floor(at.x / INSTANCE_PATCH)},${Math.floor(at.z / INSTANCE_PATCH)}`;
		const key = `${mesh.geometry.uuid}|${mesh.material.uuid}|${patch}`;
		const list = alike.get(key) ?? [];
		list.push(mesh);
		alike.set(key, list);
	});
	for (const list of alike.values()) {
		if (list.length < 2) continue;
		const first = list[0];
		const instanced = new THREE.InstancedMesh(first.geometry, first.material, list.length);
		list.forEach((mesh, i) => instanced.setMatrixAt(i, mesh.matrixWorld));
		instanced.castShadow = first.castShadow;
		instanced.receiveShadow = first.receiveShadow;
		instanced.matrixAutoUpdate = false;
		instanced.computeBoundingSphere();
		group.add(instanced);
		for (const mesh of list) mesh.removeFromParent();
	}
	pruneEmpty(group);
}

// Takes out the empty groups under an object, which would otherwise still
// be walked every frame.
function pruneEmpty(root: THREE.Object3D) {
	const prune = (o: THREE.Object3D) => {
		for (const child of [...o.children]) prune(child);
		if (o !== root && o.children.length === 0 && o.type === 'Group') o.removeFromParent();
	};
	prune(root);
}

// Merges everything under an object into one mesh per material, keeping its
// place under the object, so something made of a dozen pieces that moves
// as one (a door) is drawn in a couple of calls.
const local = new THREE.Matrix4();
function mergeParts(holder: THREE.Object3D) {
	holder.updateMatrixWorld(true);
	const back = holder.matrixWorld.clone().invert();
	const alike = new Map<
		string,
		{ material: THREE.Material; parts: THREE.BufferGeometry[]; shadow: boolean }
	>();
	const meshes: THREE.Mesh[] = [];
	holder.traverse((o) => {
		if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
	});
	for (const mesh of meshes) {
		mesh.removeFromParent();
		if (Array.isArray(mesh.material) || !mesh.visible) continue;
		const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
		g.applyMatrix4(local.multiplyMatrices(back, mesh.matrixWorld));
		// only alike geometry merges, so each set is kept to one shape of data
		const key = `${mesh.material.uuid}|${Object.keys(g.attributes).sort().join()}`;
		const entry = alike.get(key) ?? { material: mesh.material, parts: [], shadow: mesh.castShadow };
		entry.parts.push(g);
		alike.set(key, entry);
	}
	for (const { material, parts, shadow } of alike.values()) {
		const merged = mergeGeometries(parts, false);
		if (!merged) continue;
		const mesh = new THREE.Mesh(merged, material);
		mesh.castShadow = shadow;
		mesh.receiveShadow = true;
		holder.add(mesh);
	}
	pruneEmpty(holder);
}

const centroid = (poly: Pt[]): Pt => [
	poly.reduce((s, p) => s + p[0], 0) / poly.length,
	poly.reduce((s, p) => s + p[1], 0) / poly.length
];

// Whether a point lies on the outline of one of these polygons.
const onOutline = (polys: { poly: Pt[] }[], x: number, z: number) =>
	polys.some((p) => outline(p.poly).some(({ a, b }) => pointLine(x, z, a, b) < 0.12));

// How far a wall's face stands off its line, at a point on it: a building's
// face is its outline, other walls are thick both ways.
function faceDepth(layout: Layout, x: number, z: number) {
	if (onOutline(layout.rooms, x, z)) return ROOM_WALL / 2;
	return onOutline(layout.buildings, x, z) ? 0 : 0.15;
}

function pointLine(x: number, z: number, a: Pt, b: Pt) {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const l2 = dx * dx + dz * dz;
	const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
	return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

// ---- buildings and rooms --------------------------------------------------

function buildBuilding(
	batch: Batch,
	b: Layout['buildings'][number],
	layout: Layout,
	m: Materials,
	random: () => number,
	art: Art | null
) {
	const finish = m.finish[b.finish];
	const edges = outline(b.poly);
	const gable = b.roof === 'gable' && b.poly.length === 4;
	edges.forEach(({ a, b: q, len, outLeft }, i) => {
		// the facade sits just inside the outline
		const off = (outLeft ? -1 : 1) * (FACADE / 2);
		const holes = holesIn(a, q, layout, b.height);
		wallWithHoles(batch, finish, a, q, holes, b.height, FACADE, off);
		// a parapet round a flat roof
		if (!gable)
			batch.add(m.trim, wallBox(a, q, -0.05, len + 0.05, b.height, b.height + 0.12, 0.34, off));
		// windows up the front, a storey every 3.2 m, some lit, some boarded
		const out = outLeft ? 1 : -1;
		if (b.height > 5 && len > 3.5) {
			const count = Math.floor((len - 1.6) / 3.1);
			const start = (len - (count - 1) * 3.1) / 2;
			for (let floor = 1; 3.2 * floor + 2.4 < b.height - 0.4; floor++) {
				for (let k = 0; k < count; k++) {
					const s = start + k * 3.1;
					const y = 3.2 * floor + 0.8;
					const r = random();
					const glass = r < 0.16 ? m.glassLit : r < 0.26 ? m.wood : m.glass;
					batch.add(
						m.trim,
						wallBox(a, q, s - 0.68, s + 0.68, y - 0.08, y + 1.68, 0.06, out * 0.03)
					);
					batch.add(glass, wallBox(a, q, s - 0.6, s + 0.6, y, y + 1.6, 0.04, out * 0.05));
				}
			}
		}
		// the ground floor: shutters on shop fronts, doors along the motel,
		// dark or boarded windows elsewhere
		if (b.sign === 'MOTEL' && i === 0) {
			for (let s = 2.2; s < len - 1; s += 4.3) {
				if (holes.some((h) => h.s0 < s + 0.7 && h.s1 > s - 0.7)) continue;
				batch.add(m.trim, wallBox(a, q, s - 0.56, s + 0.56, 0, 2.2, 0.06, out * 0.03));
				batch.add(m.metal, wallBox(a, q, s - 0.48, s + 0.48, 0, 2.12, 0.04, out * 0.05));
			}
		} else if (!b.sign && b.height > 5 && len > 3.5) {
			const count = Math.floor((len - 1.6) / 3.1);
			const start = (len - (count - 1) * 3.1) / 2;
			for (let k = 0; k < count; k++) {
				const s = start + k * 3.1;
				if (holes.some((h) => h.s0 < s + 1.2 && h.s1 > s - 1.2)) continue;
				const glass = random() < 0.5 ? m.wood : m.glass;
				batch.add(m.trim, wallBox(a, q, s - 0.68, s + 0.68, 0.82, 2.38, 0.06, out * 0.03));
				batch.add(glass, wallBox(a, q, s - 0.6, s + 0.6, 0.9, 2.3, 0.04, out * 0.05));
			}
		}
		if (b.sign && b.sign !== 'MOTEL' && i === 0 && b.height < 9) {
			for (let s = 0.8; s + 2.6 < len - 0.6; s += 3.3) {
				if (holes.some((h) => h.s0 < s + 2.8 && h.s1 > s - 0.2)) continue;
				batch.add(m.shutter, wallBox(a, q, s, s + 2.6, 0.05, 2.6, 0.06, out * 0.03));
				batch.add(m.trim, wallBox(a, q, s - 0.1, s + 2.7, 2.6, 2.85, 0.16, out * 0.07));
			}
		}
	});
	if (gable) {
		batch.add(m.shingle, gableRoof(b.poly, b.height));
	} else {
		batch.add(m.roof, flat(b.poly, b.height + 0.01));
		// a unit or two humming on the roof
		if (art && b.height > 4.5) {
			const [cx, cz] = centroid(b.poly);
			const ac = new THREE.BoxGeometry(1.4, 1, 1);
			ac.translate(cx + (random() - 0.5) * 3, b.height + 0.5, cz + (random() - 0.5) * 3);
			batch.add(m.finish.metal, ac);
		}
	}
	if (b.sign) batch.add(signMaterial(b.sign, art), signGeometry(edges[0], b.height));
}

// A pitched roof over a rectangle, its ridge along the longer side.
function gableRoof(poly: Pt[], h: number): THREE.BufferGeometry {
	let [p0, p1, p2, p3] = poly;
	if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < Math.hypot(p2[0] - p1[0], p2[1] - p1[1]))
		[p0, p1, p2, p3] = [p1, p2, p3, p0];
	const over = 0.4;
	const rise = 2;
	const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	// push the eaves out a little
	const grow = (p: Pt, c: Pt): Pt => {
		const dx = p[0] - c[0];
		const dz = p[1] - c[1];
		const l = Math.hypot(dx, dz);
		return [p[0] + (dx / l) * over, p[1] + (dz / l) * over];
	};
	const c = centroid(poly);
	const [a, b, cc, d] = [p0, p1, p2, p3].map((p) => grow(p, c));
	const r0 = mid(a, d);
	const r1 = mid(b, cc);
	const v = (p: Pt, y: number) => [p[0], y, p[1]];
	const tris = [
		// two slopes
		[v(a, h), v(b, h), v(r1, h + rise)],
		[v(a, h), v(r1, h + rise), v(r0, h + rise)],
		[v(cc, h), v(d, h), v(r0, h + rise)],
		[v(cc, h), v(r0, h + rise), v(r1, h + rise)],
		// gable ends
		[v(d, h), v(a, h), v(r0, h + rise)],
		[v(b, h), v(cc, h), v(r1, h + rise)]
	];
	const pos: number[] = [];
	const uv: number[] = [];
	for (const tri of tris) {
		// face up and out whichever way the corners came in
		const [p, q, r] = tri;
		const n = new THREE.Vector3()
			.subVectors(new THREE.Vector3(...q), new THREE.Vector3(...p))
			.cross(new THREE.Vector3().subVectors(new THREE.Vector3(...r), new THREE.Vector3(...p)));
		const centre = new THREE.Vector3((p[0] + q[0] + r[0]) / 3, 0, (p[2] + q[2] + r[2]) / 3);
		const outward = new THREE.Vector3(centre.x - c[0], 1, centre.z - c[1]);
		const ordered = n.dot(outward) >= 0 ? [p, q, r] : [p, r, q];
		for (const corner of ordered) {
			pos.push(...corner);
			uv.push(corner[0] + corner[2] * 0.3, corner[1] * 1.4 + corner[2] * 0.2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.computeVertexNormals();
	return g;
}

function signMaterial(text: string, art: Art | null) {
	const neon = art && text !== 'APARTMENTS';
	const texture = canvasTexture(1024, 256, (g) => {
		g.fillStyle = art ? '#1c1a18' : '#e6e6e6';
		g.fillRect(0, 0, 1024, 256);
		g.strokeStyle = art ? '#3a352e' : '#cfcfcf';
		g.lineWidth = 10;
		g.strokeRect(5, 5, 1014, 246);
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.font = `700 150px ${FONT}`;
		if (neon) {
			g.shadowColor = text === 'DINER' ? '#ff4a5a' : text === 'MOTEL' ? '#4ae0ff' : '#ffb84a';
			g.shadowBlur = 30;
		}
		g.fillStyle = !art
			? PALETTE.ink
			: neon
				? text === 'DINER'
					? '#ffd0d4'
					: text === 'MOTEL'
						? '#d4f6ff'
						: '#ffe6c0'
				: '#d8cdb8';
		g.fillText(text, 512, 136, 960);
	});
	return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}

// A sign board on a building's front, up by its roof line.
function signGeometry(edge: ReturnType<typeof outline>[number], height: number) {
	const width = Math.min(edge.len * 0.7, 7);
	const tall = width / 4;
	const g = new THREE.PlaneGeometry(width, tall);
	const y = Math.min(height - tall / 2 - 0.4, 4.6);
	const mx = (edge.a[0] + edge.b[0]) / 2 + edge.nx * 0.08;
	const mz = (edge.a[1] + edge.b[1]) / 2 + edge.nz * 0.08;
	g.rotateY(Math.atan2(edge.nx, edge.nz));
	g.translate(mx, y, mz);
	return g;
}

// A room: walls round its outline with doors and windows cut out, plaster
// inside, a ceiling, a roof, and its lights.
function buildRoom(
	root: THREE.Object3D,
	batch: Batch,
	room: Layout['rooms'][number],
	layout: Layout,
	m: Materials,
	art: Art | null
) {
	const edges = outline(room.poly);
	const ceiling = Math.min(room.height - 0.5, 4.2);
	for (const { a, b, len, outLeft } of edges) {
		const holes = holesIn(a, b, layout, room.height);
		const out = outLeft ? 1 : -1;
		// the outer half in the building's finish, the inner half plastered
		wallWithHoles(
			batch,
			m.finish[room.finish],
			a,
			b,
			holes,
			room.height,
			ROOM_WALL / 2,
			(out * ROOM_WALL) / 4
		);
		wallWithHoles(
			batch,
			m.inner,
			a,
			b,
			holes.map((h) => ({ ...h, y1: Math.min(h.y1, ceiling) })),
			ceiling,
			ROOM_WALL / 2,
			(-out * ROOM_WALL) / 4
		);
		batch.add(m.trim, wallBox(a, b, -0.15, len + 0.15, room.height, room.height + 0.15, 0.4, 0));
		// skirting and a dado rail inside
		batch.add(m.trim, wallBox(a, b, 0, len, 0, 0.12, 0.03, -out * (ROOM_WALL / 2 + 0.015)));
	}
	batch.add(m.ceiling, flat(room.poly, ceiling, true));
	batch.add(m.roof, flat(room.poly, room.height + 0.01));
	if (room.sign) batch.add(signMaterial(room.sign, art), signGeometry(edges[0], room.height + 1.6));
	// strip lights down the middle, and one light for the room
	const [cx, cz] = centroid(room.poly);
	const strip = new THREE.BoxGeometry(1.4, 0.06, 0.18);
	const angle = Math.atan2(edges[0].b[1] - edges[0].a[1], edges[0].b[0] - edges[0].a[0]);
	for (const off of [-3, 0, 3]) {
		const g = strip.clone();
		g.rotateY(-angle);
		g.translate(cx + Math.cos(angle) * off, ceiling - 0.04, cz + Math.sin(angle) * off);
		batch.add(m.glassLit, g);
	}
	const light = new THREE.PointLight(room.floor === 'tile' ? '#ffe2b8' : '#dfe8ff', 9, 16, 1.4);
	light.position.set(cx, ceiling - 0.4, cz);
	root.add(light);
	return [{ light, base: light.intensity, flicker: room.sign === 'DINER' ? 0.1 : 0 }];
}

// ---- walls and fences ------------------------------------------------------

const WALL_HEIGHTS: Record<WallKind, number> = {
	brick: 2.6,
	lowwall: 1.1,
	fence: 1.9,
	chainlink: 2.4,
	hedge: 1.7,
	debris: 1.2
};

function buildWall(
	root: THREE.Object3D,
	batch: Batch,
	kind: WallKind,
	line: Pt[],
	layout: Layout,
	m: Materials,
	art: Art | null,
	random: () => number
) {
	const h = WALL_HEIGHTS[kind];
	for (let i = 0; i < line.length - 1; i++) {
		const [a, b] = [line[i], line[i + 1]];
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (len < 0.01) continue;
		const holes = holesIn(a, b, layout, h);
		const solidRuns = runs(len, holes);
		if (kind === 'brick' || kind === 'lowwall') {
			wallWithHoles(batch, m.finish.brick, a, b, holes, h, 0.3, 0);
			for (const [s0, s1] of solidRuns)
				batch.add(m.concrete, wallBox(a, b, s0 - 0.02, s1 + 0.02, h, h + 0.08, 0.38, 0));
		} else if (kind === 'fence') {
			for (const [s0, s1] of solidRuns) {
				batch.add(m.wood, wallBox(a, b, s0, s1, 0.05, h, 0.04, 0));
				for (let s = s0; s <= s1 + 0.01; s += Math.max(0.5, (s1 - s0) / Math.ceil((s1 - s0) / 2.2)))
					batch.add(m.wood, wallBox(a, b, s - 0.05, s + 0.05, 0, h + 0.06, 0.1, 0.07));
				batch.add(m.wood, wallBox(a, b, s0, s1, h * 0.25, h * 0.25 + 0.09, 0.04, 0.05));
				batch.add(m.wood, wallBox(a, b, s0, s1, h * 0.8, h * 0.8 + 0.09, 0.04, 0.05));
			}
		} else if (kind === 'chainlink') {
			for (const [s0, s1] of solidRuns) {
				batch.add(m.chainlink, wallBox(a, b, s0, s1, 0.04, h - 0.05, 0.005, 0));
				batch.add(m.metal, wallBox(a, b, s0, s1, h - 0.06, h, 0.05, 0));
				const posts = Math.max(1, Math.ceil((s1 - s0) / 2.5));
				for (let k = 0; k <= posts; k++) {
					const s = s0 + ((s1 - s0) * k) / posts;
					batch.add(m.metal, wallBox(a, b, s - 0.03, s + 0.03, 0, h + 0.05, 0.06, 0));
				}
			}
		} else if (kind === 'hedge') {
			for (const [s0, s1] of solidRuns) {
				for (let s = s0; s < s1; s += 0.7) {
					const top = h + (random() - 0.5) * 0.3;
					const g = new THREE.IcosahedronGeometry(0.62, 1);
					g.scale(1.1, top / 1.25, 1);
					g.translate(0, top / 2, 0);
					const dx = b[0] - a[0];
					const dz = b[1] - a[1];
					const k = Math.min(1, (s + 0.35) / len);
					g.translate(
						a[0] + dx * k + (random() - 0.5) * 0.15,
						0,
						a[1] + dz * k + (random() - 0.5) * 0.15
					);
					batch.add(m.hedge, g);
				}
			}
		} else if (kind === 'debris') {
			for (const [s0, s1] of solidRuns) debrisPile(root, batch, a, b, s0, s1, m, art, random);
		}
	}
}

// The solid stretches of a wall between its holes, for ones whose holes
// run full height.
function runs(len: number, holes: Hole[]): [number, number][] {
	const out: [number, number][] = [];
	let s = 0;
	for (const h of holes) {
		if (h.s0 > s + 0.01) out.push([s, h.s0]);
		s = Math.max(s, h.s1);
	}
	if (len > s + 0.01) out.push([s, len]);
	return out;
}

// Barriers, crates and tyres heaped along a line.
function debrisPile(
	root: THREE.Object3D,
	batch: Batch,
	a: Pt,
	b: Pt,
	s0: number,
	s1: number,
	m: Materials,
	art: Art | null,
	random: () => number
) {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const len = Math.hypot(dx, dz);
	const ux = dx / len;
	const uz = dz / len;
	const angle = Math.atan2(dz, dx);
	for (let s = s0 + 0.8; s < s1 - 0.4; s += 1.55) {
		const x = a[0] + ux * s + (random() - 0.5) * 0.25 * -uz;
		const z = a[1] + uz * s + (random() - 0.5) * 0.25 * ux;
		if (art) {
			const name: PropName = random() < 0.5 ? 'concrete_road_barrier' : 'concrete_road_barrier_02';
			const p = fitted(art, name).clone();
			p.position.set(x, 0, z);
			p.rotation.y = -angle + (random() - 0.5) * 0.25;
			root.add(p);
			if (random() < 0.35) {
				const extra = fitted(art, random() < 0.5 ? 'old_tyre' : 'barrel_01').clone();
				extra.position.set(x + -uz * (random() < 0.5 ? 0.6 : -0.6), 0, z + ux * 0.6);
				extra.rotation.y = random() * 6;
				root.add(extra);
			}
		} else {
			const g = new THREE.BoxGeometry(1.5, 0.85, 0.6);
			g.rotateY(-angle);
			g.translate(x, 0.425, z);
			batch.add(m.concrete, g);
		}
	}
}

// ---- doors -----------------------------------------------------------------

function buildDoor(root: THREE.Object3D, door: Door, m: Materials, art: Art | null) {
	const [a, b] = [door.a, door.b];
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
	const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
	const mesh = new THREE.Group();
	root.add(mesh);
	const holder = new THREE.Group();
	holder.position.set(door.x, 0, door.z);
	holder.rotation.y = -angle;
	mesh.add(holder);
	const height = door.kind === 'door' ? DOOR_TOP : door.kind === 'gate' ? 2.3 : 1.5;
	const label = canvasTexture(256, 256, (g) => {
		if (!art) {
			g.fillStyle = PALETTE.door;
			g.fillRect(0, 0, 256, 256);
		}
		g.fillStyle = art ? DUSK.chalk : '#f5f5f5';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.font = `${art ? 700 : 500} 64px ${FONT}`;
		g.fillText(String(door.cost), 128, 118);
		g.font = `${art ? 700 : 500} 26px ${FONT}`;
		g.fillText(door.kind === 'debris' ? 'CLEAR' : door.kind === 'gate' ? 'GATE' : 'DOOR', 128, 172);
	});
	const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
		const part = new THREE.Mesh(geometry, material);
		part.castShadow = part.receiveShadow = true;
		holder.add(part);
		return part;
	};
	if (door.kind === 'door') {
		add(new THREE.BoxGeometry(len, height, 0.12).translate(0, height / 2, 0), m.metal);
	} else if (door.kind === 'gate') {
		add(
			new THREE.BoxGeometry(len - 0.1, height - 0.1, 0.01).translate(0, height / 2, 0),
			m.chainlink
		);
		for (const [w, h, x, y] of [
			[len, 0.06, 0, height - 0.03],
			[len, 0.06, 0, 0.08],
			[0.06, height, -len / 2 + 0.03, height / 2],
			[0.06, height, len / 2 - 0.03, height / 2],
			[len, 0.04, 0, height / 2]
		])
			add(new THREE.BoxGeometry(w, h, 0.06).translate(x, y, 0), m.metal);
	} else {
		// a heap of junk blocking the way, cleared when bought
		const r = seeded(door.index + 3);
		if (art) {
			for (let k = 0; k < 3; k++) {
				const piece = fitted(art, k === 1 ? 'old_military_crate' : 'concrete_road_barrier').clone();
				piece.position.set((k - 1) * (len / 3), k === 1 ? 0.85 : 0, (r() - 0.5) * 0.3);
				piece.rotation.y = (r() - 0.5) * 0.4;
				holder.add(piece);
			}
			const tyre = fitted(art, 'old_tyre').clone();
			tyre.position.set(len / 2 - 0.3, 0, 0.5);
			holder.add(tyre);
		} else {
			add(new THREE.BoxGeometry(len, height, 0.6).translate(0, height / 2, 0), m.concrete);
		}
	}
	// the price on a plate each side
	const plate = new THREE.MeshBasicMaterial({
		map: label,
		transparent: true,
		depthWrite: false,
		opacity: 0.9
	});
	for (const side of [1, -1]) {
		const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), plate);
		const depth = door.kind === 'debris' ? 0.45 : 0.08;
		p.position.set(0, door.kind === 'debris' ? 1.1 : 1.35, side * depth);
		p.rotation.y = side > 0 ? 0 : Math.PI;
		holder.add(p);
	}
	mergeParts(holder);
	return { mesh, opening: -1, height: height + (door.kind === 'debris' ? 0.9 : 0) };
}

// ---- props -------------------------------------------------------------------

// How each kind of prop is drawn from the models: which model, the share of
// it to keep, and how to stand it.
const PROP_MODELS: Partial<
	Record<PropKind, { name: PropName; part?: string; half?: 1 | -1; scale?: number; turn?: number }>
> = {
	car: { name: 'covered_car', turn: Math.PI / 2 },
	dumpster: { name: 'metal_trash_can', part: 'rust', scale: 1.15 },
	barrier: { name: 'concrete_road_barrier' },
	shrub: { name: 'shrub_02', scale: 0.32 },
	hydrant: { name: 'fire_hydrant', half: -1 },
	bench: { name: 'painted_wooden_bench' },
	barrel: { name: 'barrel_01' },
	crate: { name: 'wooden_crate_02', turn: Math.PI / 2 },
	pallet_rack: { name: 'steel_frame_shelves_03' },
	aircon: { name: 'exterior_aircon_unit', part: 'rusted' },
	utility_box: { name: 'utility_box_02' },
	trash_can: { name: 'metal_trash_can', part: 'rust' },
	trashbag: { name: 'trashbag' },
	tyre: { name: 'old_tyre' },
	box: { name: 'cardboard_box_01' },
	generator: { name: 'portable_generator' },
	table: { name: 'wooden_table_03' },
	shelf: { name: 'steel_frame_shelves_03' }
};

const fittedCache = new WeakMap<Art, Map<string, THREE.Object3D>>();

// A model stood on the ground, centred on its footprint, optionally cut
// down to one part (or one half) of the file.
function fitted(art: Art, name: PropName, opts: { part?: string; half?: 1 | -1 } = {}) {
	let cache = fittedCache.get(art);
	if (!cache) fittedCache.set(art, (cache = new Map()));
	const key = `${name}|${opts.part ?? ''}|${opts.half ?? 0}`;
	let found = cache.get(key);
	if (found) return found;
	const model = art.props[name].clone();
	model.updateMatrixWorld(true);
	if (opts.part || opts.half) {
		model.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			if (opts.part && !o.name.includes(opts.part) && !mesh.parent?.name.includes(opts.part))
				o.visible = false;
			if (opts.half) {
				const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
				if (Math.sign(c.x) !== opts.half) o.visible = false;
			}
		});
	}
	const box = new THREE.Box3();
	model.traverse((o) => {
		if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o);
	});
	if (box.isEmpty()) model.traverse((o) => (o.visible = true));
	const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
	model.position.set(-c.x, -(box.isEmpty() ? 0 : box.min.y), -c.z);
	found = new THREE.Group().add(model);
	cache.set(key, found);
	return found;
}

function placeProps(
	root: THREE.Object3D,
	batch: Batch,
	layout: Layout,
	art: Art,
	m: Materials,
	random: () => number,
	fires: Fire[]
) {
	for (const prop of layout.props) {
		const [x, z] = prop.at;
		const rot = (-prop.rot * Math.PI) / 180;
		if (prop.kind === 'fire') {
			// the flames and the light go above the props, which are gathered
			// into instances; the barrel itself is one of them
			fire(root.parent ?? root, root, art, x, z, fires);
			continue;
		}
		const spec = PROP_MODELS[prop.kind];
		if (spec) {
			const p = new THREE.Group();
			const model = fitted(art, spec.name, spec).clone();
			model.rotation.y = spec.turn ?? 0;
			if (spec.scale) model.scale.setScalar(spec.scale);
			p.add(model);
			p.position.set(x, 0, z);
			p.rotation.y = rot + (prop.kind === 'shrub' ? random() * 6 : 0);
			root.add(p);
			if (prop.kind === 'table') {
				for (const side of [1, -1]) {
					const chair = fitted(art, 'painted_wooden_chair_01').clone();
					chair.position.set(0, 0, side * 0.62);
					chair.rotation.y = side > 0 ? Math.PI : 0;
					p.add(chair);
				}
			}
			continue;
		}
		if (prop.kind === 'lamp') placeLamp(root, art, x, z, prop.rot);
		else if (prop.kind === 'tree') tree(batch, x, z, random, m);
		else if (prop.kind === 'pine') pine(batch, x, z, random, m);
		else if (prop.kind === 'pole') pole(batch, x, z, rot, m);
		else if (prop.kind === 'post') {
			batch.add(m.trim, new THREE.BoxGeometry(0.4, 4.6, 0.4).translate(x, 2.3, z));
		} else if (prop.kind === 'pump') pump(root, x, z, rot, art, m);
		else if (prop.kind === 'truck') truck(batch, x, z, rot, m);
		else if (prop.kind === 'counter') {
			const g = new THREE.BoxGeometry(2.4, 1.05, 0.8);
			g.rotateY(rot);
			g.translate(x, 0.525, z);
			batch.add(m.wood, g);
			const top = new THREE.BoxGeometry(2.5, 0.06, 0.9);
			top.rotateY(rot);
			top.translate(x, 1.08, z);
			batch.add(m.trim, top);
		}
	}
	// manhole covers down the road
	for (const [a, b] of layout.paint.filter((_, i) => i % 7 === 3)) {
		const cover = fitted(art, 'water_manhole_cover').clone();
		cover.position.set((a[0] + b[0]) / 2 + 1.4, 0.01, (a[1] + b[1]) / 2 + 0.9);
		root.add(cover);
	}
}

// Without the art, the props that matter for cover are drawn as plain blocks.
function placePlainProps(batch: Batch, layout: Layout, m: Materials) {
	for (const prop of layout.props) {
		const [x, z] = prop.at;
		const size =
			prop.kind === 'car'
				? [4.3, 1.3, 1.85]
				: prop.kind === 'truck'
					? [6.5, 2.8, 2.4]
					: prop.kind === 'dumpster'
						? [1.9, 1.2, 1.1]
						: prop.kind === 'fire'
							? [0.6, 0.9, 0.6]
							: null;
		if (!size) continue;
		const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
		g.rotateY((-prop.rot * Math.PI) / 180);
		g.translate(x, size[1] / 2, z);
		batch.add(m.finish.concrete, g);
	}
}

// A broad, scruffy tree: a trunk, and a few lumps of leaves on branches.
function tree(batch: Batch, x: number, z: number, random: () => number, m: Materials) {
	const h = 3.4 + random() * 1.2;
	batch.add(m.wood, new THREE.CylinderGeometry(0.12, 0.22, h, 7).translate(x, h / 2, z));
	for (let k = 0; k < 6; k++) {
		const a = random() * Math.PI * 2;
		const r = 0.6 + random() * 1.3;
		const y = 3.6 + random() * 1.8;
		const branch = new THREE.CylinderGeometry(0.05, 0.09, r + 0.6, 5);
		branch.rotateZ(Math.PI / 2 - 0.6);
		branch.rotateY(-a);
		branch.translate(x + Math.cos(a) * r * 0.45, y - 0.8, z + Math.sin(a) * r * 0.45);
		batch.add(m.wood, branch);
		const blob = new THREE.IcosahedronGeometry(1 + random() * 0.7, 1);
		const pos = blob.getAttribute('position') as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++)
			pos.setXYZ(
				i,
				pos.getX(i) * (0.85 + random() * 0.3),
				pos.getY(i) * 0.75,
				pos.getZ(i) * (0.85 + random() * 0.3)
			);
		blob.translate(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
		batch.add(m.leaves, blob);
	}
}

// A dark fir: cones stacked on a trunk.
function pine(batch: Batch, x: number, z: number, random: () => number, m: Materials) {
	batch.add(m.wood, new THREE.CylinderGeometry(0.1, 0.18, 2, 6).translate(x, 1, z));
	const h = 6 + random() * 2;
	for (let k = 0; k < 4; k++) {
		const r = 2 - k * 0.42;
		const cone = new THREE.ConeGeometry(r, h * 0.36, 8);
		cone.rotateY(random() * 3);
		cone.translate(x, 1.4 + k * h * 0.17 + h * 0.18, z);
		batch.add(m.leaves, cone);
	}
}

// A wooden utility pole with its cross-arm, turned so the arm reaches
// across the wires it carries (see `wires`).
const POLE_ARM = 7.6;
function pole(batch: Batch, x: number, z: number, rot: number, m: Materials) {
	batch.add(m.wood, new THREE.CylinderGeometry(0.13, 0.17, 8.5, 8).translate(x, 4.25, z));
	batch.add(m.wood, new THREE.BoxGeometry(2.2, 0.14, 0.14).rotateY(rot).translate(x, POLE_ARM, z));
	for (const dx of [-0.9, -0.3, 0.3, 0.9])
		batch.add(
			m.trim,
			new THREE.CylinderGeometry(0.04, 0.05, 0.22, 6)
				.translate(dx, POLE_ARM + 0.19, 0)
				.rotateY(rot)
				.translate(x, 0, z)
		);
}

// Overhead lines slung from pole to pole, sagging between them. They're
// drawn as lines, so they stay a wire's width however far off they are.
function wires(root: THREE.Object3D, layout: Layout) {
	const points: number[] = [];
	for (const run of layout.wires) {
		for (let i = 0; i < run.length - 1; i++) {
			const [a, b] = [run[i], run[i + 1]];
			const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			// across the run, where the arm's insulators sit
			const nx = -(b[1] - a[1]) / len;
			const nz = (b[0] - a[0]) / len;
			for (const off of [-0.6, 0.6]) {
				const steps = Math.max(6, Math.ceil(len / 2));
				let last: number[] | null = null;
				for (let k = 0; k <= steps; k++) {
					const t = k / steps;
					const sag = len * 0.025 * 4 * t * (1 - t);
					const p = [
						a[0] + (b[0] - a[0]) * t + nx * off,
						POLE_ARM + 0.3 - sag,
						a[1] + (b[1] - a[1]) * t + nz * off
					];
					if (last) points.push(...last, ...p);
					last = p;
				}
			}
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
	root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#0d0c0f' })));
}

// Rainwater standing in the dips of the ground, mirroring the sky.
function puddles(batch: Batch, layout: Layout, m: Materials, random: () => number) {
	for (const { at, size, rot } of layout.puddles) {
		const g = new THREE.CircleGeometry(size / 2, 18);
		// an uneven edge
		const pos = g.getAttribute('position') as THREE.BufferAttribute;
		for (let i = 1; i < pos.count; i++) {
			const k = 0.8 + random() * 0.35;
			pos.setXY(i, pos.getX(i) * k, pos.getY(i) * (0.55 + random() * 0.2));
		}
		g.rotateX(-Math.PI / 2);
		g.rotateY((-rot * Math.PI) / 180);
		g.translate(at[0], 0.014, at[1]);
		batch.add(m.water, g);
	}
}

// Scraps of paper and rubbish blown into the paved parts of town.
function litter(batch: Batch, layout: Layout, m: Materials, random: () => number) {
	for (const g of layout.ground) {
		if (g.kind === 'dirt' || g.kind === 'grass' || g.kind === 'tile') continue;
		const xs = g.poly.map((p) => p[0]);
		const zs = g.poly.map((p) => p[1]);
		const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
		const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
		const count = Math.round(Math.abs(signedArea(g.poly)) / 45);
		for (let n = 0, tries = 0; n < count && tries < count * 20; tries++) {
			const x = x0 + random() * (x1 - x0);
			const z = z0 + random() * (z1 - z0);
			if (!inside(g.poly, x, z)) continue;
			n++;
			const scrap = new THREE.PlaneGeometry(0.16 + random() * 0.22, 0.12 + random() * 0.16);
			scrap.rotateX(-Math.PI / 2);
			scrap.rotateY(random() * Math.PI);
			scrap.translate(x, 0.01, z);
			batch.add(m.litter[Math.floor(random() * m.litter.length)], scrap);
		}
	}
}

function inside(poly: Pt[], x: number, z: number) {
	let hit = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, zi] = poly[i];
		const [xj, zj] = poly[j];
		if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
	}
	return hit;
}

// The first stars, high up where the sky has darkened.
function stars(random: () => number) {
	const pos: number[] = [];
	const col: number[] = [];
	for (let k = 0; k < 180; k++) {
		const a = random() * Math.PI * 2;
		// more of them the higher up, none where the sky is still bright
		const up = 0.45 + random() * 0.55;
		const r = Math.sqrt(1 - up * up);
		pos.push(WORLD_X / 2 + Math.cos(a) * r * 360, up * 360, WORLD_Z / 2 + Math.sin(a) * r * 360);
		const bright = (0.15 + random() * 0.45) * up;
		col.push(bright, bright, bright * (0.9 + random() * 0.1));
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	return new THREE.Points(
		g,
		new THREE.PointsMaterial({
			size: 1.3,
			sizeAttenuation: false,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			fog: false
		})
	);
}

// A petrol pump: a cabinet with a lit display.
const PUMP_BODY = new Map<string, THREE.Material>();
function pump(
	root: THREE.Object3D,
	x: number,
	z: number,
	rot: number,
	art: Art | null,
	m: Materials
) {
	const g = new THREE.Group();
	g.position.set(x, 0, z);
	g.rotation.y = rot;
	const island = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.9), m.concrete);
	island.position.y = 0.09;
	// one material between every pump, so they draw as one
	const paint = art ? '#8c2a22' : '#d0d0d0';
	let shell = PUMP_BODY.get(paint);
	if (!shell)
		PUMP_BODY.set(
			paint,
			(shell = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.6 }))
		);
	const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.7, 0.5), shell);
	body.position.y = 1.03;
	const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), m.glassLit);
	screen.position.set(0, 1.45, 0.26);
	const back = screen.clone();
	back.position.z = -0.26;
	back.rotation.y = Math.PI;
	island.castShadow = body.castShadow = true;
	g.add(island, body, screen, back);
	root.add(g);
}

// A box truck left where it stopped: a cab, a box on a chassis, and six
// wheels. Its footprint is the one in SOLID_PROPS.
function truck(batch: Batch, x: number, z: number, rot: number, m: Materials) {
	const place = (g: THREE.BufferGeometry) => g.rotateY(rot).translate(x, 0, z);
	// the box, with ribs down its sides
	batch.add(m.finish.metal, place(new THREE.BoxGeometry(4.5, 2.4, 2.4).translate(1, 2.2, 0)));
	for (let k = -1.9; k <= 1.9; k += 0.76)
		batch.add(m.trim, place(new THREE.BoxGeometry(0.08, 2.44, 2.46).translate(1 + k, 2.2, 0)));
	batch.add(m.trim, place(new THREE.BoxGeometry(4.55, 0.1, 2.45).translate(1, 1.02, 0)));
	// the chassis and the cab
	batch.add(m.trim, place(new THREE.BoxGeometry(6.2, 0.3, 1).translate(0.05, 0.78, 0)));
	batch.add(m.metal, place(new THREE.BoxGeometry(1.7, 1.45, 2.3).translate(-2.3, 1.72, 0)));
	batch.add(m.trim, place(new THREE.BoxGeometry(1.75, 0.5, 2.35).translate(-2.3, 0.98, 0)));
	batch.add(m.glass, place(new THREE.BoxGeometry(0.04, 0.8, 2).translate(-3.16, 1.95, 0)));
	for (const side of [1, -1]) {
		batch.add(
			m.glass,
			place(new THREE.BoxGeometry(0.9, 0.6, 0.04).translate(-2.5, 1.95, side * 1.16))
		);
		batch.add(
			m.glassLit,
			place(new THREE.BoxGeometry(0.06, 0.2, 0.3).translate(-3.17, 1.1, side * 0.85))
		);
	}
	for (const [dx, dz] of [
		[-2.4, 1],
		[-2.4, -1],
		[1.4, 1.05],
		[1.4, -1.05],
		[2.5, 1.05],
		[2.5, -1.05]
	]) {
		const wheel = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 14);
		wheel.rotateX(Math.PI / 2);
		wheel.translate(dx, 0.48, dz);
		batch.add(m.dark, place(wheel));
		const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 10);
		hub.rotateX(Math.PI / 2);
		hub.translate(dx, 0.48, dz);
		batch.add(m.trim, place(hub));
	}
}

// A street lamp, its arm reaching out toward `deg` (0 east, 90 south), its
// bulb lit and its light on the ground below.
// the lit glass, one for every lamp rather than one each, so the lamps
// can be drawn together
const LIT_GLASS = new Map<string, THREE.MeshStandardMaterial>();
function placeLamp(root: THREE.Object3D, art: Art, x: number, z: number, deg: number) {
	const lamp = art.props.street_lamp_01.clone();
	let bulb: THREE.Object3D | null = null;
	lamp.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		const mat = mesh.material as THREE.MeshStandardMaterial;
		if (/bulb|glass/.test(mat.name)) {
			let lit = LIT_GLASS.get(mat.uuid);
			if (!lit) {
				lit = mat.clone();
				lit.emissive.set('#ffc98a');
				lit.emissiveIntensity = 3;
				LIT_GLASS.set(mat.uuid, lit);
			}
			mesh.material = lit;
			if (/bulb/.test(mat.name)) bulb = mesh;
		}
	});
	// which way the arm reaches, from where the bulb sits
	lamp.updateMatrixWorld(true);
	const head = new THREE.Box3().setFromObject(bulb ?? lamp).getCenter(new THREE.Vector3());
	const flip = head.x < 0 ? Math.PI : 0;
	// local +x turned to point along deg
	lamp.rotation.y = (-deg * Math.PI) / 180 + flip;
	lamp.position.set(x, 0, z);
	root.add(lamp);
	lamp.updateMatrixWorld(true);
	const at = new THREE.Box3().setFromObject(bulb ?? lamp).getCenter(new THREE.Vector3());
	const pool = lampPool();
	pool.rotation.x = -Math.PI / 2;
	pool.position.set(at.x, 0.03, at.z);
	root.add(pool);
}

// A street lamp's light, painted on the ground under it. Every pool shares
// one picture and one square of geometry, so they're drawn together.
let pool: { geometry: THREE.PlaneGeometry; material: THREE.MeshBasicMaterial } | null = null;
function lampPool() {
	pool ??= {
		geometry: new THREE.PlaneGeometry(9, 9),
		material: new THREE.MeshBasicMaterial({
			map: canvasTexture(128, 128, (g) => {
				const glow = g.createRadialGradient(64, 64, 0, 64, 64, 64);
				glow.addColorStop(0, 'rgba(255,196,120,0.42)');
				glow.addColorStop(0.45, 'rgba(255,180,100,0.14)');
				glow.addColorStop(1, 'rgba(255,170,90,0)');
				g.fillStyle = glow;
				g.fillRect(0, 0, 128, 128);
			}),
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		})
	};
	return new THREE.Mesh(pool.geometry, pool.material);
}

// ---- fire and lava -----------------------------------------------------------

// A barrel burning away: flames licking over its rim, and its light on
// everything round it.
type Fire = { flames: THREE.Sprite[]; light: THREE.PointLight; seed: number; top: number };

let flameMaterial: THREE.SpriteMaterial | null = null;
function fire(
	root: THREE.Object3D,
	statics: THREE.Object3D,
	art: Art,
	x: number,
	z: number,
	fires: Fire[]
) {
	const barrel = fitted(art, 'barrel_01').clone();
	barrel.position.set(x, 0, z);
	barrel.rotation.y = x * 3;
	statics.add(barrel);
	barrel.updateMatrixWorld(true);
	const top = new THREE.Box3().setFromObject(barrel).max.y;
	flameMaterial ??= new THREE.SpriteMaterial({
		map: canvasTexture(64, 96, (g) => {
			const glow = g.createRadialGradient(32, 60, 0, 32, 48, 48);
			glow.addColorStop(0, 'rgba(255,245,200,1)');
			glow.addColorStop(0.25, 'rgba(255,170,60,0.9)');
			glow.addColorStop(0.6, 'rgba(255,80,10,0.35)');
			glow.addColorStop(1, 'rgba(255,40,0,0)');
			g.fillStyle = glow;
			g.fillRect(0, 0, 64, 96);
		}),
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		toneMapped: false
	});
	const flames = [0, 1, 2].map(() => {
		const s = new THREE.Sprite(flameMaterial!);
		s.position.set(x, top, z);
		s.renderOrder = 3;
		root.add(s);
		return s;
	});
	const light = new THREE.PointLight('#ff8a30', 6, 9, 1.6);
	light.position.set(x, top + 0.5, z);
	root.add(light);
	fires.push({ flames, light, seed: x + z, top });
}

// the flames flicker and climb, and the light with them
function burn(f: Fire, dt: number, clock: number) {
	const t = clock + f.seed;
	f.flames.forEach((s, i) => {
		const flick = 0.5 + 0.12 * Math.sin(t * 13 + i * 2.1) + 0.06 * Math.sin(t * 31 + i);
		s.scale.set(flick * 0.75, flick * 1.25 + 0.12 * Math.sin(t * 17 + i * 0.9), 1);
		s.position.y = f.top + 0.2 + i * 0.16 + 0.07 * Math.sin(t * 9 + i * 1.7);
		s.position.x += (Math.sin(t * 23 + i) * 0.02 - (s.position.x - f.light.position.x)) * 0.5;
		s.position.z += (Math.cos(t * 19 + i) * 0.02 - (s.position.z - f.light.position.z)) * 0.5;
	});
	f.light.intensity = 5.5 + 1.6 * Math.sin(t * 21) * Math.sin(t * 7.3);
}

// Cracks in the ground with fire under them, the way the town in Black Ops
// 2 is split by lava: a scorched patch, glowing fissures, and a pulse of
// light over them. All of them are two draw calls.
function lavaCracks(root: THREE.Object3D, layout: Layout, random: () => number) {
	if (!layout.lava.length) return null;
	const cracks = canvasTexture(256, 256, (g) => {
		g.clearRect(0, 0, 256, 256);
		const scorch = g.createRadialGradient(128, 128, 10, 128, 128, 120);
		scorch.addColorStop(0, 'rgba(12,8,8,0.92)');
		scorch.addColorStop(0.7, 'rgba(12,8,8,0.6)');
		scorch.addColorStop(1, 'rgba(12,8,8,0)');
		g.fillStyle = scorch;
		g.fillRect(0, 0, 256, 256);
		g.lineCap = 'round';
		g.lineJoin = 'round';
		// fissures wandering out from the middle to the edges, branching as
		// they go: the glow round each first, then the fire in it, then its
		// white-hot core
		const walk = (x: number, y: number, a: number, width: number, steps: number) => {
			for (let k = 0; k < steps && width > 0.8; k++) {
				const nx = x + Math.cos(a) * (7 + random() * 9);
				const ny = y + Math.sin(a) * (7 + random() * 9);
				for (const [color, w, blur] of [
					['rgba(255,80,0,0.85)', width * 3.2, 18],
					['rgba(255,150,40,1)', width * 1.3, 4],
					['rgba(255,240,200,0.95)', width * 0.5, 0]
				] as const) {
					g.strokeStyle = color;
					g.lineWidth = w;
					g.shadowColor = '#ff4a00';
					g.shadowBlur = blur;
					g.beginPath();
					g.moveTo(x, y);
					g.lineTo(nx, ny);
					g.stroke();
				}
				x = nx;
				y = ny;
				a += (random() - 0.5) * 1;
				if (random() < 0.25)
					walk(x, y, a + (random() - 0.5) * 2.4, width * 0.6, 5 + Math.floor(random() * 6));
				width *= 0.95;
			}
		};
		const arms = 6 + Math.floor(random() * 3);
		for (let i = 0; i < arms; i++)
			walk(128, 128, (i / arms) * Math.PI * 2 + random() * 0.5, 5, 11 + Math.floor(random() * 6));
	});
	const material = new THREE.MeshBasicMaterial({
		map: cracks,
		transparent: true,
		depthWrite: false,
		toneMapped: false,
		polygonOffset: true,
		polygonOffsetFactor: -8,
		polygonOffsetUnits: -8
	});
	const glowMaterial = new THREE.MeshBasicMaterial({
		map: canvasTexture(64, 64, (g) => {
			const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
			glow.addColorStop(0, 'rgba(255,120,30,0.5)');
			glow.addColorStop(0.5, 'rgba(255,80,10,0.18)');
			glow.addColorStop(1, 'rgba(255,60,0,0)');
			g.fillStyle = glow;
			g.fillRect(0, 0, 64, 64);
		}),
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		toneMapped: false
	});
	const crackParts: THREE.BufferGeometry[] = [];
	const glowParts: THREE.BufferGeometry[] = [];
	for (const { at, size, rot } of layout.lava) {
		const place = (g: THREE.BufferGeometry, s: number, y: number) =>
			g
				.scale(s, s, 1)
				.rotateX(-Math.PI / 2)
				.rotateY((-rot * Math.PI) / 180)
				.translate(at[0], y, at[1]);
		crackParts.push(place(new THREE.PlaneGeometry(1, 1), size, 0.016));
		glowParts.push(place(new THREE.PlaneGeometry(1, 1), size * 1.7, 0.02));
	}
	const crackMesh = new THREE.Mesh(mergeGeometries(crackParts)!, material);
	const glowMesh = new THREE.Mesh(mergeGeometries(glowParts)!, glowMaterial);
	crackMesh.renderOrder = 1;
	glowMesh.renderOrder = 2;
	crackMesh.matrixAutoUpdate = glowMesh.matrixAutoUpdate = false;
	root.add(crackMesh, glowMesh);
	let clock = 0;
	return {
		update(dt: number) {
			clock += dt;
			// a slow breathing, with a flicker over it
			const pulse = 0.5 + 0.5 * Math.sin(clock * 1.3) * Math.sin(clock * 0.37 + 1);
			glowMaterial.opacity = 0.55 + pulse * 0.45 + 0.08 * Math.sin(clock * 11);
			material.opacity = 0.9 + pulse * 0.1;
		}
	};
}

// ---- the skyline beyond the map ------------------------------------------

// Blocks of town filling the ground between the map and the skyline, kept
// clear of anywhere players go and of the rooms zombies climb out of.
function outskirts(map: GameMap, m: Materials, random: () => number) {
	const reach = new Set([0]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const d of map.doors)
			if (reach.has(d.areas[0]) !== reach.has(d.areas[1])) {
				d.areas.forEach((a) => reach.add(a));
				grew = true;
			}
	}
	const clear = (x0: number, z0: number, x1: number, z1: number) => {
		for (let z = Math.floor(z0); z < z1; z++)
			for (let x = Math.floor(x0); x < x1; x++) {
				if (x < 0 || z < 0 || x >= COLS || z >= ROWS) continue;
				if (reach.has(map.area[z * COLS + x])) return false;
			}
		return !map.windows.some((w) => w.x > x0 - 4 && w.x < x1 + 4 && w.z > z0 - 4 && w.z < z1 + 4);
	};
	const batch = new Batch();
	const group = new THREE.Group();
	const finishes = [m.finish.brick, m.finish.brick_red, m.finish.concrete];
	const step = 11;
	for (let z = -40; z < ROWS + 40; z += step) {
		for (let x = -40; x < COLS + 40; x += step) {
			const w = step - 1 - random() * 2;
			const d = step - 1 - random() * 2;
			if (!clear(x - 2.5, z - 2.5, x + w + 2.5, z + d + 2.5)) continue;
			const h = 6 + random() * 9;
			const poly: Pt[] = [
				[x, z],
				[x + w, z],
				[x + w, z + d],
				[x, z + d]
			];
			for (const { a, b } of outline(poly)) {
				batch.add(
					finishes[Math.floor(random() * finishes.length)],
					wallBox(a, b, 0, Math.hypot(b[0] - a[0], b[1] - a[1]), 0, h, 0.3, 0)
				);
				for (let y = 3.6; y < h - 1.5; y += 3.2)
					for (let s = 1.5; s < Math.hypot(b[0] - a[0], b[1] - a[1]) - 1.5; s += 3) {
						const glass = random() < 0.12 ? m.glassLit : m.glass;
						batch.add(glass, wallBox(a, b, s - 0.55, s + 0.55, y, y + 1.5, 0.4, 0));
					}
			}
			batch.add(m.roof, flat(poly, h));
		}
	}
	batch.flush(group, { shadows: false });
	return group;
}

// Dark blocks of town all round, out past where anyone can go, with a few
// windows still lit. They're drawn without the haze, so they stand against
// the sky.
function skyline(random: () => number) {
	const group = new THREE.Group();
	// the blocks' own colour, with a window lit here and there
	const windows = canvasTexture(256, 256, (g) => {
		g.fillStyle = DUSK.silhouette;
		g.fillRect(0, 0, 256, 256);
		const r = seeded(5);
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 8; x++) {
				if (r() > 0.13) continue;
				g.fillStyle = r() < 0.5 ? '#ffb86a' : '#d8e4ff';
				g.fillRect(x * 32 + 9, y * 32 + 8, 14, 18);
			}
	});
	windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
	const material = new THREE.MeshBasicMaterial({ map: windows, fog: false });
	const parts: THREE.BufferGeometry[] = [];
	const cx = WORLD_X / 2;
	const cz = WORLD_Z / 2;
	// the sun sets over the lower blocks, so the sky glows between them
	const sunward = Math.atan2(24, -60);
	for (let k = 0; k < 90; k++) {
		const a = (k / 90) * Math.PI * 2 + random() * 0.05;
		// out past the map's corners
		const ring = 92 + random() * 40;
		const x = cx + Math.cos(a) * ring;
		const z = cz + Math.sin(a) * ring * 0.95;
		const w = 8 + random() * 14;
		const d = 8 + random() * 10;
		const toSun = Math.abs(((a - sunward + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
		const h = (6 + random() * 20) * (toSun < 1 ? 0.45 + toSun * 0.55 : 1);
		const g = new THREE.BoxGeometry(w, h, d);
		// windows a storey apart, whatever the block's size
		const uv = g.getAttribute('uv') as THREE.BufferAttribute;
		const pos = g.getAttribute('position') as THREE.BufferAttribute;
		for (let i = 0; i < uv.count; i++) {
			const face = Math.floor(i / 4);
			const along = face < 2 ? pos.getZ(i) : pos.getX(i);
			// roofs on an unlit corner of the windows
			if (face === 2 || face === 3) uv.setXY(i, 0.01, 0.01);
			else uv.setXY(i, (along + w) / 12.8, (pos.getY(i) + h / 2) / 12.8);
		}
		g.rotateY(-a);
		g.translate(x, h / 2, z);
		parts.push(g.toNonIndexed());
	}
	const merged = mergeGeometries(parts);
	if (merged) group.add(new THREE.Mesh(merged, material));
	return group;
}

// ---- windows, the box and perks -------------------------------------------

const dummy = new THREE.Object3D();

// a board on a window: which instanced mesh and slot draws it, the window's
// frame in the world, where it sits at rest, and what it's doing
type Board = {
	mesh: THREE.InstancedMesh;
	slot: number;
	frame: THREE.Matrix4;
	width: number;
	face: number;
	y: number;
	tilt: number;
	// seconds since it was pulled off, or -1
	falling: number;
	// a swell as it's nailed back on, 1 to 0
	pop: number;
	shown: boolean;
};

// The windows: a frame in each wall's hole with dark behind it, and boards
// nailed across the inside that zombies pull off and players nail back.
// The frames and the dark never move, so they join the static batch; the
// boards are two instanced meshes (one for each face of plank) across
// every window, a couple of draw calls for the whole town's boards where
// each was a call of its own, and another for its shadow. Each is built
// facing into its area (local +z), its wall's inside face `face` off the
// wall's line.
function buildWindows(
	root: THREE.Object3D,
	batch: Batch,
	map: GameMap,
	layout: Layout,
	art: Art | null
) {
	const frame = new THREE.MeshLambertMaterial({ color: art ? '#3a3027' : PALETTE.wall });
	const back = new THREE.MeshBasicMaterial({
		color: art ? '#050506' : '#cfcfcf',
		side: THREE.BackSide
	});
	const faces = art
		? [surfaceMaterial(art, 'planks', 1.2), surfaceMaterial(art, 'planks', 1.2, '#b8a48a')]
		: [
				new THREE.MeshLambertMaterial({ color: '#6b4f35' }),
				new THREE.MeshLambertMaterial({ color: '#8a6a4a' })
			];
	const plank = new THREE.BoxGeometry(1, 0.17, 0.06);
	const perFace = Math.max(1, Math.ceil((map.windows.length * WINDOW_BOARDS) / 2));
	const meshes = faces.map((material) => {
		const mesh = new THREE.InstancedMesh(plank, material, perFace);
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		mesh.castShadow = mesh.receiveShadow = true;
		mesh.frustumCulled = false;
		mesh.matrixAutoUpdate = false;
		root.add(mesh);
		return mesh;
	});
	const place = (b: Board) => {
		// pulled outward through the window and dropped, or at rest
		const t = Math.max(0, b.falling);
		dummy.position.set(0, b.y + t * 0.6 - t * t * 4, b.face + 0.04 - t * 2.2);
		dummy.rotation.set(t * 3, 0, b.tilt);
		const s = b.shown ? 1 + b.pop * 0.15 : 0;
		dummy.scale.set(b.width * s, s, s);
		dummy.updateMatrix();
		dummy.matrix.premultiply(b.frame);
		b.mesh.setMatrixAt(b.slot, dummy.matrix);
		b.mesh.instanceMatrix.needsUpdate = true;
	};
	const slots = [0, 0];
	const windows = map.windows.map((w) => {
		const face = faceDepth(layout, w.x, w.z);
		const at = new THREE.Matrix4().makeRotationY(Math.atan2(w.nx, w.nz)).setPosition(w.x, 0, w.z);
		const width = w.width;
		const depth = face * 2 + 0.25;
		for (const [fw, fh, x, y] of [
			[width + 0.16, 0.1, 0, SILL],
			[width + 0.16, 0.1, 0, LINTEL],
			[0.08, LINTEL - SILL, -width / 2, (SILL + LINTEL) / 2],
			[0.08, LINTEL - SILL, width / 2, (SILL + LINTEL) / 2]
		]) {
			batch.add(
				frame,
				new THREE.BoxGeometry(fw, fh, depth)
					.translate(x, y, face - depth / 2 + 0.02)
					.applyMatrix4(at)
			);
		}
		// the dark room behind
		batch.add(
			back,
			new THREE.BoxGeometry(width, LINTEL - SILL, 1.4)
				.translate(0, (SILL + LINTEL) / 2, face - depth - 0.7 + 0.02)
				.applyMatrix4(at)
		);
		const boards = Array.from({ length: WINDOW_BOARDS }, (_, i): Board => {
			const b: Board = {
				mesh: meshes[i % 2],
				slot: slots[i % 2]++,
				frame: at,
				width: width + 0.3,
				face,
				y: SILL + 0.12 + i * ((LINTEL - SILL - 0.24) / (WINDOW_BOARDS - 1)),
				tilt: (i % 2 ? 1 : -1) * (0.12 + ((i * 37) % 5) * 0.03),
				falling: -1,
				pop: 0,
				shown: true
			};
			place(b);
			return b;
		});
		return { boards, shown: WINDOW_BOARDS };
	});
	return {
		setBoards(index: number, n: number) {
			const w = windows[index];
			if (!w) return;
			// a board pulled off falls out of the frame; one put back pops in
			for (let i = n; i < w.shown; i++) w.boards[i].falling = 0;
			for (let i = w.shown; i < n; i++) {
				const b = w.boards[i];
				b.falling = -1;
				b.shown = true;
				b.pop = 1;
				place(b);
			}
			w.shown = n;
		},
		update(dt: number) {
			for (const w of windows) {
				for (const b of w.boards) {
					if (b.pop > 0) {
						b.pop = Math.max(0, b.pop - dt * 6);
						place(b);
					}
					if (b.falling < 0) continue;
					b.falling += dt;
					if (b.falling > 0.6) {
						b.falling = -1;
						b.shown = false;
					}
					place(b);
				}
			}
		}
	};
}

// The Mystery Box: a crate on the floor that opens when paid, spins
// through guns, and holds one up for whoever paid.
export function buildBox(root: THREE.Object3D, m: Machine, art: Art | null = null) {
	const group = new THREE.Group();
	group.position.set(m.x, 0, m.z);
	group.rotation.y = Math.atan2(m.nx, m.nz);
	const { base, hinge } = art ? crateFrom(art) : plainCrate();
	const gun = new THREE.Mesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.MeshLambertMaterial({ color: '#262626', emissive: '#3a3020' })
	);
	gun.visible = false;
	const light = new THREE.PointLight('#ffe7a8', 0, 5, 2);
	light.position.set(0, 1.4, 0.2);
	// the beam of light that stands over the box, so it can be found from
	// across the map, as in the games this is after
	const beam = new THREE.Mesh(
		new THREE.CylinderGeometry(0.1, 0.42, 44, 10, 1, true).translate(0, 22.3, 0),
		new THREE.MeshBasicMaterial({
			map: canvasTexture(8, 128, (g) => {
				const fade = g.createLinearGradient(0, 0, 0, 128);
				fade.addColorStop(0, 'rgba(255,255,255,0)');
				fade.addColorStop(0.7, 'rgba(255,255,255,0.35)');
				fade.addColorStop(1, 'rgba(255,255,255,0.9)');
				g.fillStyle = fade;
				g.fillRect(0, 0, 8, 128);
			}),
			color: '#9cc6ff',
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
			fog: false,
			toneMapped: false
		})
	);
	beam.position.set(0, 0.3, 0.1);
	beam.renderOrder = 3;
	group.add(base, hinge, gun, light, beam);
	root.add(group);
	let state: BoxSnap = { state: 'idle', weapon: null, by: null, left: 0 };
	let open = 0;
	let spin = 0;
	let clock = 0;
	const ids = Object.keys(WEAPONS) as WeaponId[];
	const show = (id: WeaponId) => gun.scale.set(WEAPONS[id].length * 1.4 + 0.1, 0.1, 0.08);
	return {
		set(next: BoxSnap) {
			state = next;
		},
		update(dt: number) {
			clock += dt;
			const opening = state.state !== 'idle';
			open += ((opening ? 1 : 0) - open) * Math.min(1, dt * 6);
			hinge.rotation.x = -open * 1.6;
			light.intensity = open * 4;
			gun.visible = open > 0.3;
			// the beam breathes, and dims while the box is open
			(beam.material as THREE.MeshBasicMaterial).opacity =
				(0.42 + 0.1 * Math.sin(clock * 1.7)) * (1 - open * 0.6);
			if (state.state === 'rolling') {
				// rises out of the box, flicking through guns, slowing as it goes
				spin += dt * (2 + state.left * 4);
				const rise = Math.min(1, (BOX.roll - state.left) / 1.2);
				gun.position.set(0, 0.8 + rise * 0.6, 0.1);
				show(ids[Math.floor(spin) % ids.length]);
			} else if (state.state === 'offering' && state.weapon) {
				show(state.weapon);
				// and sinks back as time runs out
				gun.position.set(0, 0.8 + Math.min(0.6, state.left * 0.15), 0.1);
			}
			gun.rotation.y = Math.PI / 2 + Math.sin(spin * 0.7) * 0.2;
		}
	};
}

function plainCrate() {
	const crate = new THREE.MeshLambertMaterial({ color: '#5a4632' });
	const face = new THREE.MeshLambertMaterial({
		map: canvasTexture(256, 128, (g) => {
			g.fillStyle = '#5a4632';
			g.fillRect(0, 0, 256, 128);
			g.fillStyle = '#e8d9a8';
			g.font = `600 84px ${FONT}`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText('?', 72, 66);
			g.fillText('?', 184, 66);
		})
	});
	// box faces: +x, -x, +y, -y, +z, -z
	const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 0.9), [
		crate,
		crate,
		crate,
		crate,
		face,
		crate
	]);
	base.position.y = 0.375;
	base.castShadow = true;
	const hinge = new THREE.Group();
	hinge.position.set(0, 0.75, -0.45);
	const lid = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 0.92), crate);
	lid.position.set(0, 0.05, 0.45);
	lid.castShadow = true;
	hinge.add(lid);
	return { base: base as THREE.Object3D, hinge };
}

// The box from the crate model: its lid comes off to swing on its own hinge
// at the back.
function crateFrom(art: Art) {
	const model = art.props.wooden_military_crate.clone();
	model.scale.setScalar(1.35);
	model.updateMatrixWorld(true);
	const lid = model.getObjectByName('wooden_military_crate_lid')!;
	const lidBox = new THREE.Box3().setFromObject(lid);
	const hinge = new THREE.Group();
	hinge.position.set(0, lidBox.min.y, lidBox.min.z);
	hinge.updateMatrixWorld(true);
	// the lid moves under the hinge, keeping where it sits
	hinge.attach(lid);
	return { base: model as THREE.Object3D, hinge };
}

// A perk machine, the way the games this is after have them: a tall vending
// cabinet in the perk's colour on a dark plinth, its lit front showing a
// bottle, the perk's name and its price, neon down its edges, and its own
// light spilling out of it.
export function buildPerk(root: THREE.Object3D, m: Machine, perk: PerkId) {
	const group = new THREE.Group();
	group.position.set(m.x, 0, m.z);
	group.rotation.y = Math.atan2(m.nx, m.nz);
	const info = PERKS[perk];
	const color = info.color;
	const body = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
	const dark = new THREE.MeshStandardMaterial({ color: '#17141a', roughness: 0.7 });
	const front = canvasTexture(256, 512, (g) => {
		// the cabinet's colour behind everything, darker at the foot
		const shade = g.createLinearGradient(0, 0, 0, 512);
		shade.addColorStop(0, color);
		shade.addColorStop(1, '#141214');
		g.fillStyle = shade;
		g.fillRect(0, 0, 256, 512);
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		// the name across the top, in light
		g.fillStyle = 'rgba(0,0,0,0.45)';
		g.fillRect(0, 0, 256, 96);
		g.fillStyle = '#fff4dc';
		g.shadowColor = '#fff1c0';
		g.shadowBlur = 14;
		const words = info.name.toUpperCase().split(' ');
		g.font = `800 ${words.length > 1 ? 34 : 40}px ${FONT}`;
		words.forEach((word, i) => g.fillText(word, 128, 48 + (i - (words.length - 1) / 2) * 38, 236));
		g.shadowBlur = 0;
		// the lit panel with the bottle on it
		g.fillStyle = '#f6efe0';
		g.beginPath();
		g.roundRect(22, 112, 212, 250, 10);
		g.fill();
		g.fillStyle = color;
		g.beginPath();
		g.moveTo(116, 136);
		g.lineTo(140, 136);
		g.lineTo(140, 176);
		g.quadraticCurveTo(170, 190, 170, 230);
		g.lineTo(170, 322);
		g.quadraticCurveTo(170, 340, 152, 340);
		g.lineTo(104, 340);
		g.quadraticCurveTo(86, 340, 86, 322);
		g.lineTo(86, 230);
		g.quadraticCurveTo(86, 190, 116, 176);
		g.closePath();
		g.fill();
		g.fillStyle = 'rgba(255,255,255,0.28)';
		g.fillRect(96, 200, 10, 120);
		g.fillStyle = '#f6efe0';
		g.fillRect(96, 244, 64, 46);
		g.fillStyle = color;
		g.font = `800 30px ${FONT}`;
		g.fillText(info.short, 128, 268);
		// the price, and what it does
		g.fillStyle = '#fff4dc';
		g.font = `700 54px ${FONT}`;
		g.fillText(String(info.cost), 128, 410);
		g.fillStyle = 'rgba(255,244,220,0.75)';
		g.font = `500 20px ${FONT}`;
		g.fillText(info.what.toUpperCase(), 128, 468, 232);
	});
	const face = new THREE.MeshLambertMaterial({
		map: front,
		emissiveMap: front,
		emissive: '#ffffff',
		emissiveIntensity: 0.75
	});
	// box faces: +x, -x, +y, -y, +z, -z
	const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 0.9), [
		body,
		body,
		body,
		dark,
		face,
		body
	]);
	cabinet.position.set(0, 1.35, 0);
	cabinet.castShadow = true;
	const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.2, 0.96), dark);
	plinth.position.y = 0.1;
	plinth.castShadow = true;
	// neon down each edge of the front and along the top
	const neon = new THREE.MeshBasicMaterial({
		color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.45),
		toneMapped: false
	});
	const strips = mergeGeometries([
		new THREE.BoxGeometry(0.04, 2.1, 0.04).translate(-0.53, 1.35, 0.46),
		new THREE.BoxGeometry(0.04, 2.1, 0.04).translate(0.53, 1.35, 0.46),
		new THREE.BoxGeometry(1.1, 0.04, 0.04).translate(0, 2.48, 0.46)
	])!;
	const light = new THREE.PointLight(color, 3.5, 4.5, 2);
	light.position.set(0, 1.5, 0.9);
	group.add(cabinet, plinth, new THREE.Mesh(strips, neon), light);
	root.add(group);
}
