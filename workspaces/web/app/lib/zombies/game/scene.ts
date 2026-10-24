import * as THREE from 'three';
import {
	CELL,
	SIZE,
	WALL_HEIGHT,
	WINDOW_BOARDS,
	WORLD,
	type GameMap,
	type Machine,
	type Window
} from '../map';
import type { BoxSnap } from '../protocol';
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

export type World = {
	root: THREE.Group;
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

export function buildWorld(map: GameMap): World {
	const root = new THREE.Group();

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

	// walls and pillars, one box per cell; windows and machines are drawn
	// on their own
	const own = new Set([...map.windows.map((w) => w.cell), ...map.machines.map((m) => m.cell)]);
	const solidCells: number[] = [];
	for (let c = 0; c < SIZE * SIZE; c++) if (map.solid[c] && !own.has(c)) solidCells.push(c);
	const walls = new THREE.InstancedMesh(
		new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL),
		new THREE.MeshLambertMaterial({ color: PALETTE.wall }),
		solidCells.length
	);
	const m = new THREE.Matrix4();
	solidCells.forEach((c, i) => {
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

	// doors, with their price on both faces
	const doors = map.doors.map((door) => {
		const label = canvasTexture(256, 256, (g) => {
			g.fillStyle = PALETTE.door;
			g.fillRect(0, 0, 256, 256);
			g.fillStyle = '#f5f5f5';
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.font = `500 64px ${FONT}`;
			g.fillText(String(door.cost), 128, 118);
			g.font = `500 26px ${FONT}`;
			g.fillText('DOOR', 128, 172);
		});
		const plain = new THREE.MeshLambertMaterial({ color: PALETTE.door });
		const face = new THREE.MeshLambertMaterial({ map: label });
		const depth = 0.4;
		const geometry = door.alongX
			? new THREE.BoxGeometry(CELL, WALL_HEIGHT, depth)
			: new THREE.BoxGeometry(depth, WALL_HEIGHT, CELL);
		// box faces: +x, -x, +y, -y, +z, -z
		const materials = door.alongX
			? [plain, plain, plain, plain, face, face]
			: [face, face, plain, plain, plain, plain];
		const mesh = new THREE.Mesh(geometry, materials);
		mesh.position.set(door.x, WALL_HEIGHT / 2, door.z);
		mesh.castShadow = true;
		root.add(mesh);
		return { mesh, opening: -1 };
	});

	// wall guns, drawn in chalk
	for (const wall of map.wallBuys) {
		const weapon = WEAPONS[wall.weapon];
		const texture = canvasTexture(512, 256, (g) => {
			g.strokeStyle = PALETTE.ink;
			g.fillStyle = PALETTE.ink;
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

	const windows = map.windows.map((w) => buildWindow(root, w));
	let box: ReturnType<typeof buildBox> | null = null;
	for (const machine of map.machines) {
		if (machine.kind === 'box') box = buildBox(root, machine);
		else buildPerk(root, machine, machine.kind);
	}

	const sky = new THREE.HemisphereLight('#ffffff', '#9a9a9a', 1.6);
	root.add(sky);
	const sun = new THREE.DirectionalLight('#ffffff', 1.5);
	sun.position.set(WORLD / 2 + 20, 40, WORLD / 2 + 12);
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
	sky.layers.enable(VIEW_LAYER);
	sun.layers.enable(VIEW_LAYER);
	sun.shadow.normalBias = 0.02;
	root.add(sun, sun.target);

	return {
		root,
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

const wood = new THREE.MeshLambertMaterial({ color: '#8a6a4a' });
const woodDark = new THREE.MeshLambertMaterial({ color: '#6b4f35' });
const frame = new THREE.MeshLambertMaterial({ color: PALETTE.wall });
const OPENING = 1.2; // wide
const SILL = 0.9;
const LINTEL = 2.1;

// A window: the wall with a hole in it, and boards nailed across the inside
// that zombies pull off and players nail back. Built facing into the room
// (local +z), so the same pieces work in any wall.
export function buildWindow(root: THREE.Object3D, w: Window) {
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
	for (const [width, height, x, y] of pieces) {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, CELL), frame);
		mesh.position.set(x, y, 0);
		mesh.castShadow = mesh.receiveShadow = true;
		group.add(mesh);
	}
	const plank = new THREE.BoxGeometry(OPENING + 0.35, 0.17, 0.06);
	const boards = Array.from({ length: WINDOW_BOARDS }, (_, i) => {
		const mesh = new THREE.Mesh(plank, i % 2 ? wood : woodDark);
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
export function buildBox(root: THREE.Object3D, m: Machine) {
	const group = new THREE.Group();
	group.position.set(m.x, 0, m.z);
	group.rotation.y = Math.atan2(m.nx, m.nz);
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
