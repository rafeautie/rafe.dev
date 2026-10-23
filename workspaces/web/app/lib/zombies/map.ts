import type { WeaponId } from './weapons';

// The map is a grid of square cells, each floor or solid. A 3 by 3 block of
// rooms, with the players starting in the middle one; doors bought with
// points open the rest, a room or two at a time. Walls, pillars and closed
// doors are all solid cells, so collision, sight lines and the zombies' route
// finding all read the same grid.

export const CELL = 2;
export const WALL_HEIGHT = 3.2;

const ROOMS = 3;
const SPAN = 12; // a room's 11 cells plus one wall
export const SIZE = ROOMS * SPAN + 1;
export const WORLD = SIZE * CELL;

type RoomId = `${0 | 1 | 2}${0 | 1 | 2}`; // row then column
type Side = 'n' | 's' | 'e' | 'w';

type RoomSpec = {
	name: string;
	// [x, y, w, h] in the room's own cells, 0 to 10
	pillars: [number, number, number, number][];
	spawns: [number, number][];
};

const ROOM_SPECS: Record<RoomId, RoomSpec> = {
	'00': {
		name: 'lab',
		pillars: [
			[2, 2, 2, 1],
			[7, 2, 2, 1],
			[2, 7, 2, 1],
			[7, 7, 2, 1]
		],
		spawns: [
			[0, 0],
			[10, 0],
			[0, 10]
		]
	},
	'01': {
		name: 'courtyard',
		pillars: [[4, 4, 3, 3]],
		spawns: [
			[0, 0],
			[10, 0],
			[10, 10]
		]
	},
	'02': {
		name: 'garage',
		pillars: [
			[2, 3, 1, 5],
			[8, 3, 1, 5]
		],
		spawns: [
			[10, 0],
			[10, 10],
			[5, 0]
		]
	},
	'10': {
		name: 'office',
		pillars: [
			[3, 2, 1, 3],
			[3, 7, 1, 2],
			[7, 4, 1, 3]
		],
		spawns: [
			[0, 0],
			[0, 10],
			[10, 10]
		]
	},
	'11': {
		name: 'spawn',
		pillars: [
			[2, 2, 1, 1],
			[8, 2, 1, 1],
			[2, 8, 1, 1],
			[8, 8, 1, 1]
		],
		spawns: [
			[0, 0],
			[10, 10],
			[0, 10]
		]
	},
	'12': {
		name: 'warehouse',
		pillars: [
			[2, 2, 3, 2],
			[6, 6, 3, 2],
			[2, 8, 1, 1]
		],
		spawns: [
			[10, 0],
			[10, 10],
			[0, 10]
		]
	},
	'20': {
		name: 'depot',
		pillars: [
			[3, 3, 5, 1],
			[3, 7, 5, 1]
		],
		spawns: [
			[0, 10],
			[0, 0],
			[10, 10]
		]
	},
	'21': {
		name: 'yard',
		pillars: [
			[2, 2, 1, 1],
			[5, 5, 1, 1],
			[8, 2, 1, 1],
			[2, 8, 1, 1],
			[8, 8, 1, 1]
		],
		spawns: [
			[0, 10],
			[5, 10],
			[10, 10]
		]
	},
	'22': {
		name: 'power',
		pillars: [
			[4, 2, 3, 1],
			[4, 8, 3, 1],
			[2, 4, 1, 3],
			[8, 4, 1, 3]
		],
		spawns: [
			[10, 0],
			[10, 10],
			[5, 10]
		]
	}
};

// A door sits in the wall between two neighboring rooms, in the middle cell of
// that wall. A cost of 0 is an open archway, which joins the two rooms into one
// area.
const DOOR_SPECS: { rooms: [RoomId, RoomId]; cost: number }[] = [
	{ rooms: ['11', '01'], cost: 750 },
	{ rooms: ['11', '12'], cost: 750 },
	{ rooms: ['11', '10'], cost: 1000 },
	{ rooms: ['01', '00'], cost: 1000 },
	{ rooms: ['01', '02'], cost: 1250 },
	{ rooms: ['12', '02'], cost: 1000 },
	{ rooms: ['12', '22'], cost: 1250 },
	{ rooms: ['10', '00'], cost: 1000 },
	{ rooms: ['10', '20'], cost: 1250 },
	{ rooms: ['20', '21'], cost: 0 },
	{ rooms: ['21', '22'], cost: 1500 }
];

// Guns drawn on walls. `at` is the cell along that wall, 0 to 10; the middle
// one (5) is where a door would go.
const WALL_BUY_SPECS: { room: RoomId; side: Side; at: number; weapon: WeaponId }[] = [
	{ room: '11', side: 's', at: 3, weapon: 'm14' },
	{ room: '11', side: 's', at: 7, weapon: 'olympia' },
	{ room: '01', side: 'n', at: 5, weapon: 'mp5' },
	{ room: '12', side: 'e', at: 3, weapon: 'ak74u' },
	{ room: '10', side: 'w', at: 5, weapon: 'remington' },
	{ room: '00', side: 'w', at: 7, weapon: 'mp5' },
	{ room: '02', side: 'n', at: 5, weapon: 'galil' },
	{ room: '21', side: 's', at: 3, weapon: 'm14' },
	{ room: '22', side: 'e', at: 5, weapon: 'galil' }
];

export type Door = {
	index: number;
	cell: number;
	cost: number;
	x: number;
	z: number;
	// along x if the wall runs east to west
	alongX: boolean;
	areas: [number, number];
};

export type WallBuy = {
	index: number;
	weapon: WeaponId;
	// the center of the drawing, on the wall's face
	x: number;
	z: number;
	// unit vector out of the wall, toward the room
	nx: number;
	nz: number;
};

export type GameMap = {
	solid: Uint8Array; // walls and pillars, not doors
	doorAt: Int16Array; // door index per cell, or -1
	area: Int16Array; // area per floor cell, or -1; area 0 is where players start
	doors: Door[];
	wallBuys: WallBuy[];
	spawns: { x: number; z: number; area: number }[];
	playerSpawns: { x: number; z: number }[];
	roomName: (x: number, z: number) => string;
};

export const cellIndex = (cx: number, cy: number) => cy * SIZE + cx;
export const cellOf = (v: number) => Math.floor(v / CELL);
export const centerOf = (c: number) => (c + 0.5) * CELL;

function roomOrigin(room: RoomId): [number, number] {
	const row = Number(room[0]);
	const col = Number(room[1]);
	return [col * SPAN + 1, row * SPAN + 1];
}

export function buildMap(): GameMap {
	const solid = new Uint8Array(SIZE * SIZE).fill(1);
	const doorAt = new Int16Array(SIZE * SIZE).fill(-1);

	for (const [id, spec] of Object.entries(ROOM_SPECS) as [RoomId, RoomSpec][]) {
		const [ox, oy] = roomOrigin(id);
		for (let y = 0; y < SPAN - 1; y++)
			for (let x = 0; x < SPAN - 1; x++) solid[cellIndex(ox + x, oy + y)] = 0;
		for (const [px, py, w, h] of spec.pillars)
			for (let y = py; y < py + h; y++)
				for (let x = px; x < px + w; x++) solid[cellIndex(ox + x, oy + y)] = 1;
	}

	const doorCells: { cell: number; cost: number; alongX: boolean }[] = [];
	for (const { rooms, cost } of DOOR_SPECS) {
		const [ax, ay] = roomOrigin(rooms[0]);
		const [bx, by] = roomOrigin(rooms[1]);
		const horizontal = ay === by; // side by side, so the wall runs north to south
		const wallX = horizontal ? Math.max(ax, bx) - 1 : ax + 5;
		const wallY = horizontal ? ay + 5 : Math.max(ay, by) - 1;
		const cells = horizontal
			? [cellIndex(wallX, wallY - 1), cellIndex(wallX, wallY), cellIndex(wallX, wallY + 1)]
			: [cellIndex(wallX - 1, wallY), cellIndex(wallX, wallY), cellIndex(wallX + 1, wallY)];
		if (cost === 0) {
			for (const c of cells) solid[c] = 0;
		} else {
			solid[cells[1]] = 0;
			doorCells.push({ cell: cells[1], cost, alongX: !horizontal });
		}
	}
	doorCells.forEach((d, i) => (doorAt[d.cell] = i));

	// Areas: floor joined up without crossing a door.
	const area = new Int16Array(SIZE * SIZE).fill(-1);
	const [sx, sy] = roomOrigin('11');
	const start = cellIndex(sx + 5, sy + 5);
	const order = [start, ...Array.from({ length: SIZE * SIZE }, (_, i) => i)];
	let areas = 0;
	for (const seed of order) {
		if (solid[seed] || doorAt[seed] >= 0 || area[seed] >= 0) continue;
		const stack = [seed];
		area[seed] = areas;
		while (stack.length) {
			const c = stack.pop()!;
			const cx = c % SIZE;
			const cy = (c / SIZE) | 0;
			for (const [dx, dy] of NEIGHBORS_4) {
				const n = cellIndex(cx + dx, cy + dy);
				if (!solid[n] && doorAt[n] < 0 && area[n] < 0) {
					area[n] = areas;
					stack.push(n);
				}
			}
		}
		areas++;
	}

	const doors: Door[] = doorCells.map((d, index) => {
		const cx = d.cell % SIZE;
		const cy = (d.cell / SIZE) | 0;
		const sides = d.alongX
			? [cellIndex(cx, cy - 1), cellIndex(cx, cy + 1)]
			: [cellIndex(cx - 1, cy), cellIndex(cx + 1, cy)];
		return {
			index,
			cell: d.cell,
			cost: d.cost,
			x: centerOf(cx),
			z: centerOf(cy),
			alongX: d.alongX,
			areas: [area[sides[0]], area[sides[1]]]
		};
	});

	const wallBuys: WallBuy[] = WALL_BUY_SPECS.map((spec, index) => {
		const [ox, oy] = roomOrigin(spec.room);
		// the floor cell in front of the drawing, and the way out of the wall
		const [fx, fy, nx, nz] =
			spec.side === 'n'
				? [ox + spec.at, oy, 0, 1]
				: spec.side === 's'
					? [ox + spec.at, oy + 10, 0, -1]
					: spec.side === 'w'
						? [ox, oy + spec.at, 1, 0]
						: [ox + 10, oy + spec.at, -1, 0];
		return {
			index,
			weapon: spec.weapon,
			x: centerOf(fx) - (nx * CELL) / 2,
			z: centerOf(fy) - (nz * CELL) / 2,
			nx,
			nz
		};
	});

	const spawns: GameMap['spawns'] = [];
	for (const [id, spec] of Object.entries(ROOM_SPECS) as [RoomId, RoomSpec][]) {
		const [ox, oy] = roomOrigin(id);
		for (const [x, y] of spec.spawns) {
			const c = cellIndex(ox + x, oy + y);
			if (solid[c]) throw new Error(`spawn in a wall in room ${id}`);
			spawns.push({ x: centerOf(ox + x), z: centerOf(oy + y), area: area[c] });
		}
	}

	const playerSpawns = [
		[5, 5],
		[4, 5],
		[6, 5],
		[5, 4]
	].map(([x, y]) => ({ x: centerOf(sx + x), z: centerOf(sy + y) }));

	const roomName = (x: number, z: number) => {
		const col = Math.min(ROOMS - 1, Math.max(0, Math.floor(cellOf(x) / SPAN)));
		const row = Math.min(ROOMS - 1, Math.max(0, Math.floor(cellOf(z) / SPAN)));
		return ROOM_SPECS[`${row}${col}` as RoomId].name;
	};

	return { solid, doorAt, area, doors, wallBuys, spawns, playerSpawns, roomName };
}

const NEIGHBORS_4 = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1]
] as const;

// What blocks movement and bullets right now: walls, and doors not yet bought.
export class Blocking {
	readonly open: boolean[];

	constructor(readonly map: GameMap) {
		this.open = map.doors.map(() => false);
	}

	isSolid(cx: number, cy: number): boolean {
		if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return true;
		const c = cellIndex(cx, cy);
		if (this.map.solid[c]) return true;
		const door = this.map.doorAt[c];
		return door >= 0 && !this.open[door];
	}

	// Moves a circle by (dx, dz), sliding along whatever it runs into.
	// Returns the new position.
	move(x: number, z: number, dx: number, dz: number, r: number): [number, number] {
		// small steps, so a fast mover cannot pass through a wall
		const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.8)));
		for (let i = 0; i < steps; i++) {
			x += dx / steps;
			z += dz / steps;
			[x, z] = this.pushOut(x, z, r);
		}
		return [x, z];
	}

	pushOut(x: number, z: number, r: number): [number, number] {
		const cx = cellOf(x);
		const cy = cellOf(z);
		for (let iy = cy - 1; iy <= cy + 1; iy++) {
			for (let ix = cx - 1; ix <= cx + 1; ix++) {
				if (!this.isSolid(ix, iy)) continue;
				const minX = ix * CELL;
				const minZ = iy * CELL;
				const nx = Math.max(minX, Math.min(x, minX + CELL));
				const nz = Math.max(minZ, Math.min(z, minZ + CELL));
				const ddx = x - nx;
				const ddz = z - nz;
				const d2 = ddx * ddx + ddz * ddz;
				if (d2 >= r * r) continue;
				if (d2 > 1e-9) {
					const d = Math.sqrt(d2);
					x = nx + (ddx / d) * r;
					z = nz + (ddz / d) * r;
				} else {
					// the center is inside the cell: out through the nearest side
					const left = x - minX;
					const right = minX + CELL - x;
					const top = z - minZ;
					const bottom = minZ + CELL - z;
					const m = Math.min(left, right, top, bottom);
					if (m === left) x = minX - r;
					else if (m === right) x = minX + CELL + r;
					else if (m === top) z = minZ - r;
					else z = minZ + CELL + r;
				}
			}
		}
		return [x, z];
	}

	// Distance along a flat ray (in x and z) to the first solid cell, up to max.
	ray(x: number, z: number, dx: number, dz: number, max: number): number {
		const len = Math.hypot(dx, dz);
		if (len < 1e-9) return max;
		dx /= len;
		dz /= len;
		let cx = cellOf(x);
		let cy = cellOf(z);
		const stepX = dx > 0 ? 1 : -1;
		const stepY = dz > 0 ? 1 : -1;
		const tDeltaX = Math.abs(CELL / dx);
		const tDeltaY = Math.abs(CELL / dz);
		let tMaxX =
			dx === 0 ? Infinity : ((dx > 0 ? (cx + 1) * CELL - x : x - cx * CELL) / CELL) * tDeltaX;
		let tMaxY =
			dz === 0 ? Infinity : ((dz > 0 ? (cy + 1) * CELL - z : z - cy * CELL) / CELL) * tDeltaY;
		let t = 0;
		while (t < max) {
			if (this.isSolid(cx, cy)) return t;
			if (tMaxX < tMaxY) {
				t = tMaxX;
				tMaxX += tDeltaX;
				cx += stepX;
			} else {
				t = tMaxY;
				tMaxY += tDeltaY;
				cy += stepY;
			}
		}
		return max;
	}

	canSee(ax: number, az: number, bx: number, bz: number): boolean {
		const d = Math.hypot(bx - ax, bz - az);
		return this.ray(ax, az, bx - ax, bz - az, d) >= d;
	}

	// Path cost to the nearest source from every cell, moving 8 ways without
	// cutting corners. Unreachable cells are Infinity.
	flowField(sources: number[]): Float64Array {
		const cost = new Float64Array(SIZE * SIZE).fill(Infinity);
		const heap = new MinHeap();
		for (const s of sources) {
			cost[s] = 0;
			heap.push(s, 0);
		}
		while (heap.size) {
			const [c, d] = heap.pop();
			if (d > cost[c]) continue;
			const cx = c % SIZE;
			const cy = (c / SIZE) | 0;
			for (const [dx, dy, step] of NEIGHBORS_8) {
				const nx = cx + dx;
				const ny = cy + dy;
				if (this.isSolid(nx, ny)) continue;
				if (dx && dy && (this.isSolid(cx + dx, cy) || this.isSolid(cx, cy + dy))) continue;
				const n = cellIndex(nx, ny);
				const nd = d + step;
				if (nd < cost[n]) {
					cost[n] = nd;
					heap.push(n, nd);
				}
			}
		}
		return cost;
	}

	// The next cell's center on the way down a flow field, or null if there is
	// no way.
	downhill(field: Float64Array, x: number, z: number): [number, number] | null {
		const cx = cellOf(x);
		const cy = cellOf(z);
		let best = field[cellIndex(cx, cy)] ?? Infinity;
		let bestCell: [number, number] | null = null;
		for (const [dx, dy] of NEIGHBORS_8) {
			const nx = cx + dx;
			const ny = cy + dy;
			if (this.isSolid(nx, ny)) continue;
			if (dx && dy && (this.isSolid(cx + dx, cy) || this.isSolid(cx, cy + dy))) continue;
			const v = field[cellIndex(nx, ny)];
			if (v < best) {
				best = v;
				bestCell = [centerOf(nx), centerOf(ny)];
			}
		}
		return bestCell;
	}
}

const NEIGHBORS_8 = [
	[1, 0, 1],
	[-1, 0, 1],
	[0, 1, 1],
	[0, -1, 1],
	[1, 1, Math.SQRT2],
	[1, -1, Math.SQRT2],
	[-1, 1, Math.SQRT2],
	[-1, -1, Math.SQRT2]
] as const;

class MinHeap {
	private items: number[] = [];
	private keys: number[] = [];

	get size() {
		return this.items.length;
	}

	push(item: number, key: number) {
		this.items.push(item);
		this.keys.push(key);
		let i = this.items.length - 1;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (this.keys[p] <= this.keys[i]) break;
			this.swap(i, p);
			i = p;
		}
	}

	pop(): [number, number] {
		const top: [number, number] = [this.items[0], this.keys[0]];
		const lastItem = this.items.pop()!;
		const lastKey = this.keys.pop()!;
		if (this.items.length) {
			this.items[0] = lastItem;
			this.keys[0] = lastKey;
			let i = 0;
			for (;;) {
				const l = i * 2 + 1;
				const r = l + 1;
				let m = i;
				if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
				if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
				if (m === i) break;
				this.swap(i, m);
				i = m;
			}
		}
		return top;
	}

	private swap(a: number, b: number) {
		[this.items[a], this.items[b]] = [this.items[b], this.items[a]];
		[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
	}
}
