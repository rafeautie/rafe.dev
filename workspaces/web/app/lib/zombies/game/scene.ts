import * as THREE from 'three';
import {
	CELL,
	SIZE,
	WALL_HEIGHT,
	WINDOW_BOARDS,
	WORLD,
	centerOf,
	type GameMap,
	type Machine,
	type Window
} from '../map';
import type { BoxSnap } from '../protocol';
import { metreUVs, surfaceMaterial, type Art, type PropName, type SurfaceName } from './art';
import { BOX, PERKS, type PerkId } from '../rules';
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

// with real textures the world is a run-down town at dusk
export const DUSK = {
	sky: '#2b2b35',
	chalk: '#ece6d6'
};

export type World = {
	root: THREE.Group;
	// the sky and the haze it fades into
	sky: string;
	openDoor(index: number): void;
	closeDoors(): void;
	setBoards(index: number, boards: number): void;
	setBox(box: BoxSnap): void;
	update(dt: number): void;
};

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

export function buildWorld(map: GameMap, art: Art | null = null): World {
	const root = new THREE.Group();
	const sky = art ? DUSK.sky : PALETTE.sky;

	if (art) {
		buildGround(root, map, art);
		root.add(skyDome());
	} else {
		// one tile per cell
		const tile = canvasTexture(128, 128, (g) => {
			g.fillStyle = PALETTE.floor;
			g.fillRect(0, 0, 128, 128);
			g.strokeStyle = PALETTE.floorLine;
			g.lineWidth = 2;
			g.strokeRect(1, 1, 126, 126);
		});
		tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
		tile.repeat.set(SIZE, SIZE);
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(WORLD, WORLD),
			new THREE.MeshLambertMaterial({ map: tile })
		);
		floor.rotation.x = -Math.PI / 2;
		floor.position.set(WORLD / 2, 0, WORLD / 2);
		floor.receiveShadow = true;
		root.add(floor);
	}

	// walls and pillars, one box per cell, each room in its own finish;
	// windows and machines are drawn on their own
	const own = new Set([...map.windows.map((w) => w.cell), ...map.machines.map((m) => m.cell)]);
	const byFinish = new Map<THREE.Material, number[]>();
	const plainWall = new THREE.MeshLambertMaterial({ color: PALETTE.wall });
	const finishes = art ? wallFinishes(art) : null;
	for (let c = 0; c < SIZE * SIZE; c++) {
		if (!map.solid[c] || own.has(c)) continue;
		const cx = c % SIZE;
		const cy = Math.floor(c / SIZE);
		// the backs of brick buildings all round the edge, concrete walls
		// between the yards, and each yard's own pillars and fences
		const edge = cx === 0 || cy === 0 || cx === SIZE - 1 || cy === SIZE - 1;
		const divider = cx % SPAN === 0 || cy % SPAN === 0;
		const material = !finishes
			? plainWall
			: edge
				? finishes.wall_brick!
				: divider
					? finishes.wall_concrete!
					: (finishes[ROOM_FINISH[map.roomName(centerOf(cx), centerOf(cy))]] ??
						finishes.wall_concrete!);
		if (!byFinish.has(material)) byFinish.set(material, []);
		byFinish.get(material)!.push(c);
	}
	const wallBox = metreUVs(new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL));
	const m = new THREE.Matrix4();
	for (const [material, cells] of byFinish) {
		const walls = new THREE.InstancedMesh(wallBox, material, cells.length);
		cells.forEach((c, i) => {
			m.makeTranslation(
				((c % SIZE) + 0.5) * CELL,
				WALL_HEIGHT / 2,
				(Math.floor(c / SIZE) + 0.5) * CELL
			);
			walls.setMatrixAt(i, m);
		});
		walls.castShadow = true;
		walls.receiveShadow = true;
		root.add(walls);
	}

	if (art) {
		scatterProps(root, map, art);
	}

	// doors, with their price on both faces
	const metal = art ? surfaceMaterial(art.surfaces.rusty_metal, 1.5) : null;
	const doors = map.doors.map((door) => {
		const label = canvasTexture(256, 256, (g) => {
			if (!metal) {
				g.fillStyle = PALETTE.door;
				g.fillRect(0, 0, 256, 256);
			}
			// stencilled on the metal, or printed on the plain door
			g.fillStyle = metal ? DUSK.chalk : '#f5f5f5';
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.font = `${metal ? 700 : 500} 64px ${FONT}`;
			g.fillText(String(door.cost), 128, 118);
			g.font = `${metal ? 700 : 500} 26px ${FONT}`;
			g.fillText('DOOR', 128, 172);
		});
		const plain = metal ?? new THREE.MeshLambertMaterial({ color: PALETTE.door });
		const face = metal ?? new THREE.MeshLambertMaterial({ map: label });
		const depth = 0.4;
		const geometry = metreUVs(
			door.alongX
				? new THREE.BoxGeometry(CELL, WALL_HEIGHT, depth)
				: new THREE.BoxGeometry(depth, WALL_HEIGHT, CELL)
		);
		// box faces: +x, -x, +y, -y, +z, -z
		const materials = door.alongX
			? [plain, plain, plain, plain, face, face]
			: [face, face, plain, plain, plain, plain];
		const mesh = new THREE.Mesh(geometry, materials);
		mesh.position.set(door.x, WALL_HEIGHT / 2, door.z);
		mesh.castShadow = mesh.receiveShadow = true;
		if (metal) {
			// the price on a decal each side, since the metal itself repeats
			const decal = new THREE.MeshBasicMaterial({
				map: label,
				transparent: true,
				depthWrite: false,
				opacity: 0.85
			});
			for (const side of [1, -1]) {
				const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), decal);
				const out = depth / 2 + 0.01;
				plane.position.set(door.alongX ? 0 : side * out, 0.1, door.alongX ? side * out : 0);
				plane.rotation.y = door.alongX ? (side > 0 ? 0 : Math.PI) : (side * Math.PI) / 2;
				mesh.add(plane);
			}
		}
		root.add(mesh);
		return { mesh, opening: -1 };
	});

	// wall guns, drawn in chalk
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
		plane.position.set(wall.x + wall.nx * 0.01, 1.55, wall.z + wall.nz * 0.01);
		plane.lookAt(wall.x + wall.nx, 1.55, wall.z + wall.nz);
		root.add(plane);
	}

	const windows = map.windows.map((w) => buildWindow(root, w, art));
	let box: ReturnType<typeof buildBox> | null = null;
	for (const machine of map.machines) {
		if (machine.kind === 'box') box = buildBox(root, machine, art);
		else buildPerk(root, machine, machine.kind);
	}

	const ambient = art
		? new THREE.HemisphereLight('#9aaacb', '#6a5848', 2.6)
		: new THREE.HemisphereLight('#ffffff', '#9a9a9a', 1.6);
	root.add(ambient);
	const sun = art
		? new THREE.DirectionalLight('#ffb27a', 2.4)
		: new THREE.DirectionalLight('#ffffff', 1.5);
	// with the art, a low sun setting off to one side
	if (art) sun.position.set(WORLD / 2 + 40, 24, WORLD / 2 + 26);
	else sun.position.set(WORLD / 2 + 20, 40, WORLD / 2 + 12);
	sun.target.position.set(WORLD / 2, 0, WORLD / 2);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	const half = WORLD / 2 + 4;
	Object.assign(sun.shadow.camera, {
		left: -half,
		right: half,
		top: half,
		bottom: -half,
		near: 1,
		far: 120
	});
	sun.shadow.bias = -0.0005;
	// the gun in hand is drawn in its own pass and needs the same light
	ambient.layers.enable(VIEW_LAYER);
	sun.layers.enable(VIEW_LAYER);
	sun.shadow.normalBias = 0.02;
	root.add(sun, sun.target);

	return {
		root,
		sky,
		openDoor(index) {
			const door = doors[index];
			if (door && door.opening < 0) door.opening = 0;
		},
		closeDoors() {
			for (const door of doors) {
				door.opening = -1;
				door.mesh.visible = true;
				door.mesh.position.y = WALL_HEIGHT / 2;
			}
		},
		setBoards(index, boards) {
			windows[index]?.setBoards(boards);
		},
		setBox(state) {
			box?.set(state);
		},
		update(dt) {
			for (const w of windows) w.update(dt);
			box?.update(dt);
			for (const door of doors) {
				if (door.opening < 0 || !door.mesh.visible) continue;
				door.opening += dt;
				const t = Math.min(1, door.opening / 0.7);
				door.mesh.position.y = WALL_HEIGHT / 2 - t * t * (WALL_HEIGHT + 0.1);
				if (t >= 1) door.mesh.visible = false;
			}
		}
	};
}

// a flat plane whose UVs are in metres
function metrePlane(width: number, height: number) {
	const geometry = new THREE.PlaneGeometry(width, height);
	const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height);
	return geometry;
}

// what each yard's pillars and fences are made of
const ROOM_FINISH: Record<string, SurfaceName> = {
	Lab: 'wall_plaster',
	Office: 'wall_plaster',
	Spawn: 'wall_concrete',
	Courtyard: 'fence',
	Yard: 'fence',
	Depot: 'fence',
	Garage: 'wall_brick',
	Warehouse: 'wall_brick',
	Power: 'wall_concrete'
};

function wallFinishes(art: Art) {
	return {
		wall_concrete: surfaceMaterial(art.surfaces.wall_concrete, CELL),
		wall_plaster: surfaceMaterial(art.surfaces.wall_plaster, CELL),
		wall_brick: surfaceMaterial(art.surfaces.wall_brick, CELL, '#b8998a'),
		fence: surfaceMaterial(art.surfaces.fence, CELL)
	} as Partial<Record<SurfaceName, THREE.Material>>;
}

// a room's cells plus the wall on one side; three rooms to a side
const SPAN = (SIZE - 1) / 3;

// yards on dirt rather than asphalt
const DIRT = new Set(['Courtyard', 'Yard', 'Depot']);
const ROOM = (SPAN - 1) * CELL;

// Asphalt everywhere, with the dirt yards laid over it.
function buildGround(root: THREE.Object3D, map: GameMap, art: Art) {
	const asphalt = new THREE.Mesh(
		metrePlane(WORLD, WORLD),
		surfaceMaterial(art.surfaces.ground_asphalt, 4, '#c9c3b8')
	);
	asphalt.rotation.x = -Math.PI / 2;
	asphalt.position.set(WORLD / 2, 0, WORLD / 2);
	asphalt.receiveShadow = true;
	root.add(asphalt);
	const dirt = surfaceMaterial(art.surfaces.ground_dirt, 4);
	dirt.polygonOffset = true;
	dirt.polygonOffsetFactor = -1;
	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			const x = (col * SPAN + 1) * CELL + ROOM / 2;
			const z = (row * SPAN + 1) * CELL + ROOM / 2;
			if (!DIRT.has(map.roomName(x, z))) continue;
			const patch = new THREE.Mesh(metrePlane(ROOM, ROOM), dirt);
			patch.rotation.x = -Math.PI / 2;
			patch.position.set(x, 0.002, z);
			patch.receiveShadow = true;
			root.add(patch);
		}
	}
}

// A dusk sky: deep blue overhead, a warm glow low down where the sun set.
function skyDome() {
	const texture = canvasTexture(4, 256, (g) => {
		const sky = g.createLinearGradient(0, 0, 0, 256);
		sky.addColorStop(0, '#141a2b');
		sky.addColorStop(0.42, '#2c3550');
		sky.addColorStop(0.5, '#7a5a55');
		sky.addColorStop(0.53, '#c47e52');
		sky.addColorStop(0.6, '#2a2624');
		sky.addColorStop(1, '#1a1716');
		g.fillStyle = sky;
		g.fillRect(0, 0, 4, 256);
	});
	const dome = new THREE.Mesh(
		new THREE.SphereGeometry(140, 32, 16),
		new THREE.MeshBasicMaterial({
			map: texture,
			side: THREE.BackSide,
			fog: false,
			depthWrite: false
		})
	);
	dome.position.set(WORLD / 2, 0, WORLD / 2);
	dome.renderOrder = -1;
	return dome;
}

// A street lamp's light, painted on the ground under it.
function lampPool() {
	return new THREE.Mesh(
		new THREE.PlaneGeometry(8, 8),
		new THREE.MeshBasicMaterial({
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
	);
}

const ROOM_PROPS: Record<string, PropName[]> = {
	Lab: ['wheelchair_01', 'cardboard_box_01', 'metal_trash_can', 'steel_frame_shelves_02'],
	Courtyard: ['concrete_road_barrier', 'barrel_01', 'old_tyre', 'trashbag'],
	Garage: ['old_tyre', 'barrel_01', 'portable_generator', 'steel_frame_shelves_02', 'power_box_01'],
	Office: ['cardboard_box_01', 'metal_trash_can', 'steel_frame_shelves_02', 'trashbag'],
	Spawn: ['old_military_crate', 'barrel_01', 'cardboard_box_01', 'trashbag'],
	Warehouse: ['steel_frame_shelves_02', 'old_military_crate', 'cardboard_box_01', 'barrel_01'],
	Depot: ['old_military_crate', 'barrel_01', 'concrete_road_barrier', 'cardboard_box_01'],
	Yard: ['concrete_road_barrier', 'old_tyre', 'trashbag', 'barrel_01'],
	Power: ['portable_generator', 'power_box_01', 'barrel_01', 'metal_trash_can']
};
// props hung on the wall rather than stood on the floor, and how high
const ON_WALL: Partial<Record<PropName, number>> = { power_box_01: 1.3 };
// props that come as a pair, of which one is used
const ONE_OF: Partial<Record<PropName, string>> = {
	metal_trash_can: 'metal_trash_can_rust',
	old_military_crate: '_a'
};

// Dresses each room with props stood against its walls, kept clear of
// windows, doors, guns, machines and spawns. They're scenery: nothing bumps
// into them.
function scatterProps(root: THREE.Object3D, map: GameMap, art: Art) {
	const keepClear: [number, number][] = [
		...map.windows.map((w) => [w.x, w.z] as [number, number]),
		...map.doors.map((d) => [d.x, d.z] as [number, number]),
		...map.machines.map((m) => [m.x, m.z] as [number, number]),
		...map.wallBuys.map((w) => [w.x, w.z] as [number, number]),
		...map.spawns.map((s) => [s.x, s.z] as [number, number]),
		...map.playerSpawns.map((s) => [s.x, s.z] as [number, number])
	];
	const shapes = new Map<PropName, { object: THREE.Object3D; size: THREE.Vector3 }>();
	const shape = (name: PropName) => {
		let found = shapes.get(name);
		if (!found) {
			let object = art.props[name];
			const part = ONE_OF[name];
			if (part) {
				// keep the parts of one of the pair, moved to the middle
				const keep = object.clone();
				keep.traverse((o) => {
					if ((o as THREE.Mesh).isMesh && !o.name.includes(part)) o.visible = false;
				});
				keep.updateMatrixWorld(true);
				const box = new THREE.Box3();
				keep.traverse((o) => {
					if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o);
				});
				const centre = box.getCenter(new THREE.Vector3());
				const wrap = new THREE.Group();
				keep.position.set(-centre.x, 0, -centre.z);
				wrap.add(keep);
				object = wrap;
			}
			const box = new THREE.Box3();
			object.updateMatrixWorld(true);
			object.traverse((o) => {
				if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o);
			});
			found = { object, size: box.getSize(new THREE.Vector3()) };
			shapes.set(name, found);
		}
		return found;
	};
	const sides: [number, number][] = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1]
	];
	let seed = 7;
	const random = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	const taken: [number, number][] = [];
	const lit = new Set<string>();
	for (let cy = 0; cy < SIZE; cy++) {
		for (let cx = 0; cx < SIZE; cx++) {
			const c = cy * SIZE + cx;
			if (map.solid[c] || map.doorAt[c] >= 0) continue;
			const x = centerOf(cx);
			const z = centerOf(cy);
			// a wall on one side, into which the prop backs
			const wall = sides.find(
				([dx, dz]) =>
					map.solid[(cy + dz) * SIZE + cx + dx] && map.windowAt[(cy + dz) * SIZE + cx + dx] < 0
			);
			if (!wall) continue;
			if (keepClear.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < CELL * 1.6)) continue;
			if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < CELL * 2)) continue;
			if (random() > 0.55) continue;
			const room = map.roomName(x, z);
			const names = ROOM_PROPS[room];
			if (!names) continue;
			// every yard gets a street lamp first
			if (!lit.has(room)) {
				lit.add(room);
				placeLamp(root, art, x, z, wall);
				taken.push([x, z]);
				continue;
			}
			const name = names[Math.floor(random() * names.length)];
			const { object, size } = shape(name);
			const prop = object.clone();
			// its long side along the wall, its back against it
			const [wx, wz] = wall;
			const across = size.x >= size.z;
			const depth = across ? size.z : size.x;
			const facing = Math.atan2(-wx, -wz) + (across ? 0 : Math.PI / 2);
			const back = CELL / 2 - depth / 2 - 0.04;
			const height = ON_WALL[name] ?? 0;
			prop.position.set(x + wx * back, height, z + wz * back);
			prop.rotation.y = facing + (height ? 0 : (random() - 0.5) * 0.3);
			root.add(prop);
			taken.push([x, z]);
		}
	}
}

// A street lamp against a wall, its arm reaching out over the yard, its bulb
// lit and its light on the ground below.
function placeLamp(
	root: THREE.Object3D,
	art: Art,
	x: number,
	z: number,
	[wx, wz]: [number, number]
) {
	const lamp = art.props.street_lamp_01.clone();
	let bulb: THREE.Object3D | null = null;
	lamp.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		const mat = mesh.material as THREE.MeshStandardMaterial;
		if (/bulb|glass/.test(mat.name)) {
			const lit = mat.clone();
			lit.emissive.set('#ffc98a');
			lit.emissiveIntensity = 3;
			mesh.material = lit;
			if (/bulb/.test(mat.name)) bulb = mesh;
		}
	});
	// which way the arm reaches, from where the bulb sits
	lamp.updateMatrixWorld(true);
	const head = new THREE.Box3().setFromObject(bulb ?? lamp).getCenter(new THREE.Vector3());
	const flip = head.x < 0 ? Math.PI : 0;
	// local +x turned to point out of the wall
	lamp.rotation.y = Math.atan2(wz, -wx) + flip;
	const back = CELL / 2 - 0.25;
	lamp.position.set(x + wx * back, 0, z + wz * back);
	root.add(lamp);
	lamp.updateMatrixWorld(true);
	const at = new THREE.Box3().setFromObject(bulb ?? lamp).getCenter(new THREE.Vector3());
	const pool = lampPool();
	pool.rotation.x = -Math.PI / 2;
	pool.position.set(at.x, 0.02, at.z);
	root.add(pool);
}

const wood = new THREE.MeshLambertMaterial({ color: '#8a6a4a' });
const woodDark = new THREE.MeshLambertMaterial({ color: '#6b4f35' });
const frame = new THREE.MeshLambertMaterial({ color: PALETTE.wall });
const OPENING = 1.2; // wide
const SILL = 0.9;
const LINTEL = 2.1;

// A window: the wall with a hole in it, and boards nailed across the inside
// that zombies pull off and players nail back. Built facing into the room
// (local +z), so the same pieces work in any wall.
export function buildWindow(root: THREE.Object3D, w: Window, art: Art | null = null) {
	const group = new THREE.Group();
	group.position.set(w.x, 0, w.z);
	group.rotation.y = Math.atan2(w.nx, w.nz);
	const post = (CELL - OPENING) / 2;
	const pieces: [number, number, number, number, number][] = [
		// [width, height, x, y]: the sill, the lintel, and a post each side
		[CELL, SILL, 0, SILL / 2, 0],
		[CELL, WALL_HEIGHT - LINTEL, 0, (WALL_HEIGHT + LINTEL) / 2, 0],
		[post, LINTEL - SILL, -(OPENING + post) / 2, (SILL + LINTEL) / 2, 0],
		[post, LINTEL - SILL, (OPENING + post) / 2, (SILL + LINTEL) / 2, 0]
	];
	const wall = art ? surfaceMaterial(art.surfaces.wall_concrete, CELL) : frame;
	const boardFaces = art
		? [
				surfaceMaterial(art.surfaces.planks, 1.2),
				surfaceMaterial(art.surfaces.planks, 1.2, '#b8a48a')
			]
		: [woodDark, wood];
	for (const [width, height, x, y] of pieces) {
		const mesh = new THREE.Mesh(metreUVs(new THREE.BoxGeometry(width, height, CELL)), wall);
		mesh.position.set(x, y, 0);
		mesh.castShadow = mesh.receiveShadow = true;
		group.add(mesh);
	}
	const plank = metreUVs(new THREE.BoxGeometry(OPENING + 0.35, 0.17, 0.06));
	const boards = Array.from({ length: WINDOW_BOARDS }, (_, i) => {
		const mesh = new THREE.Mesh(plank, boardFaces[i % 2]);
		const home = {
			y: SILL + 0.12 + i * ((LINTEL - SILL - 0.24) / (WINDOW_BOARDS - 1)),
			tilt: (i % 2 ? 1 : -1) * (0.12 + ((i * 37) % 5) * 0.03)
		};
		mesh.position.set(0, home.y, CELL / 2 + 0.04);
		mesh.rotation.z = home.tilt;
		mesh.castShadow = true;
		group.add(mesh);
		// falling: seconds since it came off, or -1
		return { mesh, home, falling: -1 };
	});
	root.add(group);
	let shown = WINDOW_BOARDS;
	return {
		setBoards(n: number) {
			// a board pulled off falls out of the frame; one put back pops in
			for (let i = n; i < shown; i++) boards[i].falling = 0;
			for (let i = shown; i < n; i++) {
				const b = boards[i];
				b.falling = -1;
				b.mesh.visible = true;
				b.mesh.position.set(0, b.home.y, CELL / 2 + 0.04);
				b.mesh.rotation.set(0, 0, b.home.tilt);
				b.mesh.scale.setScalar(1.15);
			}
			shown = n;
		},
		update(dt: number) {
			for (const b of boards) {
				b.mesh.scale.lerp(ONE, Math.min(1, dt * 12));
				if (b.falling < 0) continue;
				b.falling += dt;
				const t = b.falling;
				// pulled outward through the window, then dropped
				b.mesh.position.z = CELL / 2 + 0.04 - t * 2.2;
				b.mesh.position.y = b.home.y + t * 0.6 - t * t * 4;
				b.mesh.rotation.x = t * 3;
				if (t > 0.6) {
					b.mesh.visible = false;
					b.falling = -1;
				}
			}
		}
	};
}

const ONE = new THREE.Vector3(1, 1, 1);

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
	group.add(base, hinge, gun, light);
	root.add(group);
	let state: BoxSnap = { state: 'idle', weapon: null, by: null, left: 0 };
	let open = 0;
	let spin = 0;
	const ids = Object.keys(WEAPONS) as WeaponId[];
	const show = (id: WeaponId) => gun.scale.set(WEAPONS[id].length * 1.4 + 0.1, 0.1, 0.08);
	return {
		set(next: BoxSnap) {
			state = next;
		},
		update(dt: number) {
			const opening = state.state !== 'idle';
			open += ((opening ? 1 : 0) - open) * Math.min(1, dt * 6);
			hinge.rotation.x = -open * 1.6;
			light.intensity = open * 4;
			gun.visible = open > 0.3;
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

// A perk machine: a tall cabinet in the perk's colour, its name and price on
// the front, lit from within.
export function buildPerk(root: THREE.Object3D, m: Machine, perk: PerkId) {
	const group = new THREE.Group();
	group.position.set(m.x, 0, m.z);
	group.rotation.y = Math.atan2(m.nx, m.nz);
	const color = PERKS[perk].color;
	const body = new THREE.MeshLambertMaterial({ color });
	const info = PERKS[perk];
	const face = new THREE.MeshLambertMaterial({
		emissive: color,
		emissiveIntensity: 0.35,
		map: canvasTexture(256, 512, (g) => {
			g.fillStyle = color;
			g.fillRect(0, 0, 256, 512);
			g.fillStyle = 'rgba(255,255,255,0.9)';
			g.fillRect(20, 40, 216, 230);
			g.fillStyle = color;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			const words = info.name.toUpperCase().split(' ');
			g.font = `700 ${words.length > 1 ? 44 : 38}px ${FONT}`;
			words.forEach((word, i) => g.fillText(word, 128, 155 + (i - (words.length - 1) / 2) * 52));
			g.fillStyle = '#f5f5f5';
			g.font = `600 48px ${FONT}`;
			g.fillText(String(info.cost), 128, 340);
			g.font = `500 22px ${FONT}`;
			g.fillText(info.what.toUpperCase(), 128, 400, 220);
		})
	});
	face.map!.colorSpace = THREE.SRGBColorSpace;
	const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.9), [
		body,
		body,
		body,
		body,
		face,
		body
	]);
	cabinet.position.set(0, 1.1, -0.3);
	cabinet.castShadow = true;
	const light = new THREE.PointLight(color, 3, 4, 2);
	light.position.set(0, 1.6, 0.6);
	group.add(cabinet, light);
	root.add(group);
}
