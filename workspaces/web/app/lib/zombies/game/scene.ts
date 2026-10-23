import * as THREE from 'three';
import { CELL, SIZE, WALL_HEIGHT, WORLD, type GameMap } from '../map';
import { WEAPONS, ammoCost } from '../weapons';

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

	// walls and pillars, one box per cell
	const solidCells: number[] = [];
	for (let c = 0; c < SIZE * SIZE; c++) if (map.solid[c]) solidCells.push(c);
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
			g.fillText('door', 128, 172);
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
			g.fillText(`${weapon.cost} · ammo ${ammoCost(weapon)}`, 256, 236);
		});
		const plane = new THREE.Mesh(
			new THREE.PlaneGeometry(1.8, 0.9),
			new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
		);
		plane.position.set(wall.x + wall.nx * 0.01, 1.55, wall.z + wall.nz * 0.01);
		plane.lookAt(wall.x + wall.nx, 1.55, wall.z + wall.nz);
		root.add(plane);
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
		update(dt) {
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
