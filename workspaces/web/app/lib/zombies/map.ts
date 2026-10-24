import { LAYOUT, type DoorKind, type Layout, type MachineKind, type Pt } from './layout';
import type { WeaponId } from './weapons';

export type { MachineKind } from './layout';

// The map's collision and route finding, built from the drawn layout (see
// layout.ts). Walls, fences, buildings and solid props are blockers: line
// segments with a thickness, which movement slides along and bullets and
// sight lines stop at. Over the top lies a grid of 1 m cells for the zombies'
// route finding, each cell either clear or blocked, with the moves between
// neighbouring cells checked against the blockers so a thin fence still
// splits the grid. Doors bought with points block like walls until opened.

export const CELL = 1;
// how high a wall still takes a bullet hole
export const WALL_HEIGHT = 3.2;
export const WINDOW_BOARDS = 6;

export const COLS = LAYOUT.size[0];
export const ROWS = LAYOUT.size[1];

// A segment with a thickness: everything within r of the line from a to b.
export type Blocker = {
	ax: number;
	az: number;
	bx: number;
	bz: number;
	r: number;
	// bullets pass it (windows, chain-link, anything waist high); sight lines
	// for the zombies' route finding don't
	porous: boolean;
	// the door it is, or -1
	door: number;
};

export type Machine = {
	kind: MachineKind;
	cell: number;
	x: number;
	z: number;
	// unit vector out of the wall, the way it faces
	nx: number;
	nz: number;
};

export type Window = {
	index: number;
	cell: number;
	// the window's middle, in the wall
	x: number;
	z: number;
	// unit vector out of the wall, into the area zombies climb into
	nx: number;
	nz: number;
	// how wide it is, along the wall
	width: number;
	// the area on the inside
	area: number;
};

export type Door = {
	index: number;
	cell: number;
	cost: number;
	kind: DoorKind;
	// its middle, and its ends
	x: number;
	z: number;
	a: Pt;
	b: Pt;
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
	layout: Layout;
	blockers: Blocker[];
	solid: Uint8Array; // cells always blocked
	doorAt: Int16Array; // door index per cell, or -1
	// per cell, eight moves (see NEIGHBORS_8): FREE, WALLED, or the index of
	// the door in the way
	moves: Int16Array;
	area: Int16Array; // area per clear cell, or -1; area 0 is where players start
	doors: Door[];
	wallBuys: WallBuy[];
	machines: Machine[];
	windows: Window[];
	spawns: { x: number; z: number; area: number }[];
	playerSpawns: { x: number; z: number }[];
	roomName: (x: number, z: number) => string;
};

export const cellIndex = (cx: number, cy: number) => cy * COLS + cx;
export const cellOf = (v: number) => Math.floor(v / CELL);
export const centerOf = (c: number) => (c + 0.5) * CELL;

const FREE = -1;
const WALLED = -2;
// a mover's size, for which cells and moves the route finding counts as clear
const BODY = 0.3;
// blockers are filed by cell, with everything this near the cell listed
const REACH = 0.6;

// How thick each kind of wall is (half its thickness), and whether bullets
// fly over or through it.
const WALL_KINDS = {
	brick: { r: 0.15, porous: false },
	lowwall: { r: 0.15, porous: true },
	fence: { r: 0.06, porous: false },
	chainlink: { r: 0.04, porous: true },
	hedge: { r: 0.45, porous: false },
	debris: { r: 0.45, porous: true }
} as const;
const ROOM_WALL = 0.15;
const BUILDING_WALL = 0.05;
const DOOR_KINDS: Record<DoorKind, number> = { door: 0.1, gate: 0.06, debris: 0.45 };

// Props that block, with the footprint they block: length and width in
// metres, along and across their own x, and whether bullets clear them.
export const SOLID_PROPS: Partial<Record<string, { l: number; w: number; porous: boolean }>> = {
	car: { l: 4.3, w: 1.85, porous: true },
	truck: { l: 6.5, w: 2.4, porous: false },
	dumpster: { l: 1.9, w: 1.1, porous: true },
	barrier: { l: 2, w: 0.6, porous: true },
	tree: { l: 0.5, w: 0.5, porous: false },
	pine: { l: 0.6, w: 0.6, porous: false },
	lamp: { l: 0.3, w: 0.3, porous: false },
	pole: { l: 0.35, w: 0.35, porous: false },
	post: { l: 0.4, w: 0.4, porous: false },
	pump: { l: 1.4, w: 0.7, porous: true },
	pallet_rack: { l: 2.4, w: 0.8, porous: false },
	bench: { l: 1.2, w: 0.55, porous: true },
	counter: { l: 2.4, w: 0.8, porous: true },
	table: { l: 1.2, w: 0.8, porous: true },
	shelf: { l: 2.4, w: 0.8, porous: false },
	crate: { l: 1.2, w: 0.55, porous: true },
	barrel: { l: 0.6, w: 0.6, porous: true },
	fire: { l: 0.6, w: 0.6, porous: true },
	generator: { l: 1, w: 0.7, porous: true },
	hydrant: { l: 0.35, w: 0.35, porous: true },
	utility_box: { l: 1, w: 0.5, porous: true },
	aircon: { l: 1, w: 0.6, porous: true }
};
const MACHINE_SIZE: Record<MachineKind, [number, number]> = {
	box: [1.75, 0.95],
	jugg: [1.15, 0.95],
	speed: [1.15, 0.95],
	tap: [1.15, 0.95],
	revive: [1.15, 0.95]
};

// Builds the map from its layout, checking it hangs together: every door
// between two areas, nothing players reach open to the edge, every spawn on
// clear ground. Problems throw, or are listed in `problems` if it's given.
export function buildMap(layout: Layout = LAYOUT, problems?: string[]): GameMap {
	const problem = (what: string) => {
		if (!problems) throw new Error(what);
		problems.push(what);
	};
	const blockers: Blocker[] = [];
	const add = (a: Pt, b: Pt, r: number, porous: boolean, door = -1) =>
		blockers.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r, porous, door });

	// what's cut out of the walls: doors, windows and plain gaps
	const cuts: Pt[][] = [...layout.doors.map((d) => d.at), ...layout.windows, ...layout.openings];
	const wall = (a: Pt, b: Pt, r: number, porous: boolean) => {
		for (const [p, q] of cutAway(a, b, cuts)) add(p, q, r, porous);
	};
	for (const b of layout.buildings)
		edges(b.poly).forEach(([p, q]) => wall(p, q, BUILDING_WALL, false));
	for (const room of layout.rooms)
		edges(room.poly).forEach(([p, q]) => wall(p, q, ROOM_WALL, false));
	for (const w of layout.walls) {
		const kind = WALL_KINDS[w.kind];
		for (let i = 0; i < w.line.length - 1; i++) wall(w.line[i], w.line[i + 1], kind.r, kind.porous);
	}
	// windows stop people, not bullets
	for (const [a, b] of layout.windows) add(a, b, ROOM_WALL, true);
	for (const prop of layout.props) {
		const size = SOLID_PROPS[prop.kind];
		if (size) footprint(prop.at, prop.rot, size.l, size.w, (a, b, r) => add(a, b, r, size.porous));
	}
	const machines: Machine[] = layout.machines.map((m) => {
		const f = (m.face * Math.PI) / 180;
		const nx = round(Math.sin(f));
		const nz = round(Math.cos(f));
		const [l, w] = MACHINE_SIZE[m.kind];
		// its width runs along the wall it backs onto
		footprint(m.at, -m.face, l, w, (a, b, r) => add(a, b, r, false));
		return {
			kind: m.kind,
			cell: cellIndex(cellOf(m.at[0]), cellOf(m.at[1])),
			x: m.at[0],
			z: m.at[1],
			nx,
			nz
		};
	});
	layout.doors.forEach((d, i) => add(d.at[0], d.at[1], DOOR_KINDS[d.kind], false, i));

	// cells: blocked where a body standing in the middle would touch
	// something, or inside a building
	const n = COLS * ROWS;
	const solid = new Uint8Array(n);
	const doorAt = new Int16Array(n).fill(-1);
	const buckets = fileBlockers(blockers);
	for (let cy = 0; cy < ROWS; cy++) {
		for (let cx = 0; cx < COLS; cx++) {
			const c = cellIndex(cx, cy);
			const x = centerOf(cx);
			const z = centerOf(cy);
			if (layout.buildings.some((b) => inside(b.poly, x, z))) {
				solid[c] = 1;
				continue;
			}
			for (const i of buckets[c]) {
				const b = blockers[i];
				if (pointSegment(x, z, b) >= b.r + BODY) continue;
				if (b.door < 0) solid[c] = 1;
				else if (doorAt[c] < 0) doorAt[c] = b.door;
			}
			if (solid[c]) doorAt[c] = -1;
		}
	}

	// moves between neighbouring cells
	const moves = new Int16Array(n * 8).fill(WALLED);
	for (let cy = 0; cy < ROWS; cy++) {
		for (let cx = 0; cx < COLS; cx++) {
			const c = cellIndex(cx, cy);
			if (solid[c]) continue;
			NEIGHBORS_8.forEach(([dx, dy], k) => {
				const nx = cx + dx;
				const ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
				const o = cellIndex(nx, ny);
				if (solid[o]) return;
				// no cutting corners
				if (dx && dy && (solid[cellIndex(cx + dx, cy)] || solid[cellIndex(cx, cy + dy)])) return;
				let move = doorAt[c] >= 0 ? doorAt[c] : doorAt[o] >= 0 ? doorAt[o] : FREE;
				const ax = centerOf(cx);
				const az = centerOf(cy);
				const bx = centerOf(nx);
				const bz = centerOf(ny);
				for (const i of new Set([...buckets[c], ...buckets[o]])) {
					const b = blockers[i];
					if (segmentSegment(ax, az, bx, bz, b) >= b.r + BODY * 0.5) continue;
					if (b.door < 0) {
						move = WALLED;
						break;
					}
					if (move === FREE) move = b.door;
				}
				moves[c * 8 + k] = move;
			});
		}
	}

	// areas: cells joined up without crossing a door
	const area = new Int16Array(n).fill(-1);
	const first = layout.playerSpawns[0];
	const start = cellIndex(cellOf(first[0]), cellOf(first[1]));
	let areas = 0;
	for (const seed of [start, ...Array.from({ length: n }, (_, i) => i)]) {
		if (solid[seed] || doorAt[seed] >= 0 || area[seed] >= 0) continue;
		const stack = [seed];
		area[seed] = areas;
		while (stack.length) {
			const c = stack.pop()!;
			const cx = c % COLS;
			const cy = (c / COLS) | 0;
			for (let k = 0; k < 4; k++) {
				if (moves[c * 8 + k] !== FREE) continue;
				const o = cellIndex(cx + NEIGHBORS_8[k][0], cy + NEIGHBORS_8[k][1]);
				if (doorAt[o] < 0 && area[o] < 0) {
					area[o] = areas;
					stack.push(o);
				}
			}
		}
		areas++;
	}
	const areaNear = (x: number, z: number) => {
		const cx = cellOf(x);
		const cy = cellOf(z);
		if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1;
		return area[cellIndex(cx, cy)];
	};
	// which side of a line a point well off it lands in, trying a little
	// farther out if the first try lands on something
	const sideArea = (a: Pt, b: Pt, sign: number) => {
		const [nx, nz] = normal(a, b);
		const mx = (a[0] + b[0]) / 2;
		const mz = (a[1] + b[1]) / 2;
		for (const d of [0.9, 1.3, 1.8, 2.4]) {
			const found = areaNear(mx + nx * d * sign, mz + nz * d * sign);
			if (found >= 0) return found;
		}
		return -1;
	};

	const doors: Door[] = layout.doors.map((d, index) => {
		const [a, b] = d.at;
		const areas: [number, number] = [sideArea(a, b, 1), sideArea(a, b, -1)];
		if (areas[0] < 0 || areas[1] < 0 || areas[0] === areas[1])
			problem(`door ${index} doesn't join two areas (${areas})`);
		return {
			index,
			cell: cellIndex(cellOf((a[0] + b[0]) / 2), cellOf((a[1] + b[1]) / 2)),
			cost: d.cost,
			kind: d.kind,
			x: (a[0] + b[0]) / 2,
			z: (a[1] + b[1]) / 2,
			a,
			b,
			areas
		};
	});

	// the areas players can reach, once every door is open
	const reachable = new Set([0]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const d of doors) {
			const [p, q] = d.areas;
			if (reachable.has(p) !== reachable.has(q)) {
				reachable.add(p);
				reachable.add(q);
				grew = true;
			}
		}
	}
	// nothing players can reach may touch the edge of the grid
	for (let c = 0; c < n; c++) {
		const cx = c % COLS;
		const cy = (c / COLS) | 0;
		const edge = cx === 0 || cy === 0 || cx === COLS - 1 || cy === ROWS - 1;
		if (edge && reachable.has(area[c])) {
			problem(`the map leaks at cell ${cx}, ${cy}`);
			break;
		}
	}

	// a feature on a wall faces whichever side players can reach
	const facing = (a: Pt, b: Pt, what: string) => {
		const ins = [1, -1].filter((s) => reachable.has(sideArea(a, b, s)));
		if (ins.length !== 1) problem(`${what} has ${ins.length} sides players reach`);
		const [nx, nz] = normal(a, b);
		const s = ins[0] ?? 1;
		return { nx: round(nx * s), nz: round(nz * s), area: sideArea(a, b, s) };
	};

	const windows: Window[] = layout.windows.map(([a, b], index) => {
		const { nx, nz, area } = facing(a, b, `window ${index}`);
		const x = (a[0] + b[0]) / 2;
		const z = (a[1] + b[1]) / 2;
		return {
			index,
			cell: cellIndex(cellOf(x), cellOf(z)),
			x,
			z,
			nx,
			nz,
			width: Math.hypot(b[0] - a[0], b[1] - a[1]),
			area
		};
	});

	const wallBuys: WallBuy[] = layout.wallBuys.map(({ at: [a, b], weapon, toward }, index) => {
		const x = (a[0] + b[0]) / 2;
		const z = (a[1] + b[1]) / 2;
		let { nx, nz } = toward ? { nx: 0, nz: 0 } : facing(a, b, `wall gun ${index}`);
		if (toward) {
			[nx, nz] = normal(a, b);
			if ((toward[0] - x) * nx + (toward[1] - z) * nz < 0) [nx, nz] = [-nx, -nz];
		}
		return { index, weapon, x, z, nx, nz };
	});
	machines.forEach((m) => {
		if (!reachable.has(areaNear(m.x + m.nx * 1.2, m.z + m.nz * 1.2)))
			problem(`the ${m.kind} machine can't be reached`);
	});

	const spawns = layout.spawns.map(([x, z]) => {
		const found = areaNear(x, z);
		if (found < 0) problem(`zombie spawn at ${x}, ${z} is in a wall`);
		return { x, z, area: found };
	});
	const playerSpawns = layout.playerSpawns.map(([x, z]) => {
		if (areaNear(x, z) !== 0) problem(`player spawn at ${x}, ${z} is not in the start`);
		return { x, z };
	});

	// each area's name, from the named points in it
	const names = new Map<number, string>();
	for (const { at, name } of layout.names) {
		const found = areaNear(at[0], at[1]);
		if (found >= 0) names.set(found, name);
	}
	const roomName = (x: number, z: number) => {
		for (const d of [0, 1, 2]) {
			for (const [dx, dz] of [[0, 0], ...NEIGHBORS_8]) {
				const found = names.get(areaNear(x + dx * d, z + dz * d));
				if (found) return found;
			}
		}
		return '';
	};

	return {
		layout,
		blockers,
		solid,
		doorAt,
		moves,
		area,
		doors,
		wallBuys,
		machines,
		windows,
		spawns,
		playerSpawns,
		roomName
	};
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

function edges(poly: Pt[]): [Pt, Pt][] {
	return poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
}

// The unit normal of a segment, to its left (for a segment running east,
// south).
function normal(a: Pt, b: Pt): [number, number] {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const l = Math.hypot(dx, dz);
	return [-dz / l, dx / l];
}

// The pieces of a segment left after cutting out every cut lying along it.
function cutAway(a: Pt, b: Pt, cuts: Pt[][]): [Pt, Pt][] {
	const dx = b[0] - a[0];
	const dz = b[1] - a[1];
	const len = Math.hypot(dx, dz);
	if (len < 1e-6) return [];
	const ux = dx / len;
	const uz = dz / len;
	const holes: [number, number][] = [];
	for (const [p, q] of cuts) {
		// both ends on the line, within a hand's width
		const off = (v: Pt) => Math.abs((v[0] - a[0]) * -uz + (v[1] - a[1]) * ux);
		if (off(p) > 0.12 || off(q) > 0.12) continue;
		const s0 = (p[0] - a[0]) * ux + (p[1] - a[1]) * uz;
		const s1 = (q[0] - a[0]) * ux + (q[1] - a[1]) * uz;
		const lo = Math.max(0, Math.min(s0, s1));
		const hi = Math.min(len, Math.max(s0, s1));
		if (hi - lo > 0.05) holes.push([lo, hi]);
	}
	holes.sort((p, q) => p[0] - q[0]);
	const out: [Pt, Pt][] = [];
	let from = 0;
	const at = (s: number): Pt => [a[0] + ux * s, a[1] + uz * s];
	for (const [lo, hi] of holes) {
		if (lo > from + 0.01) out.push([at(from), at(lo)]);
		from = Math.max(from, hi);
	}
	if (len > from + 0.01) out.push([at(from), at(len)]);
	return out;
}

// A rectangle's blocker: a segment down its long side, as thick as it is wide.
function footprint(
	at: Pt,
	deg: number,
	l: number,
	w: number,
	add: (a: Pt, b: Pt, r: number) => void
) {
	const a = (deg * Math.PI) / 180;
	const long = l >= w;
	const half = (Math.max(l, w) - Math.min(l, w)) / 2;
	const ux = long ? Math.cos(a) : -Math.sin(a);
	const uz = long ? Math.sin(a) : Math.cos(a);
	add(
		[at[0] - ux * half, at[1] - uz * half],
		[at[0] + ux * half, at[1] + uz * half],
		Math.min(l, w) / 2
	);
}

export function inside(poly: Pt[], x: number, z: number): boolean {
	let ins = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, zi] = poly[i];
		const [xj, zj] = poly[j];
		if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
	}
	return ins;
}

// The closest point on a blocker's line to a point, as [x, z, distance].
function closest(x: number, z: number, b: Blocker): [number, number, number] {
	const dx = b.bx - b.ax;
	const dz = b.bz - b.az;
	const l2 = dx * dx + dz * dz;
	const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - b.ax) * dx + (z - b.az) * dz) / l2)) : 0;
	const cx = b.ax + dx * t;
	const cz = b.az + dz * t;
	return [cx, cz, Math.hypot(x - cx, z - cz)];
}

const pointSegment = (x: number, z: number, b: Blocker) => closest(x, z, b)[2];

// How near two segments come.
function segmentSegment(ax: number, az: number, bx: number, bz: number, b: Blocker): number {
	if (segmentsCross(ax, az, bx, bz, b.ax, b.az, b.bx, b.bz)) return 0;
	const other: Blocker = { ...b, ax, az, bx, bz };
	return Math.min(
		pointSegment(ax, az, b),
		pointSegment(bx, bz, b),
		pointSegment(b.ax, b.az, other),
		pointSegment(b.bx, b.bz, other)
	);
}

function segmentsCross(
	ax: number,
	az: number,
	bx: number,
	bz: number,
	cx: number,
	cz: number,
	dx: number,
	dz: number
) {
	const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) =>
		(qx - px) * (rz - pz) - (qz - pz) * (rx - px);
	const d1 = side(cx, cz, dx, dz, ax, az);
	const d2 = side(cx, cz, dx, dz, bx, bz);
	const d3 = side(ax, az, bx, bz, cx, cz);
	const d4 = side(ax, az, bx, bz, dx, dz);
	return d1 * d2 < 0 && d3 * d4 < 0;
}

// Lists, for every cell, the blockers within reach of it.
function fileBlockers(blockers: Blocker[]): number[][] {
	const buckets: number[][] = Array.from({ length: COLS * ROWS }, () => []);
	blockers.forEach((b, i) => {
		const pad = b.r + REACH;
		const x0 = Math.max(0, cellOf(Math.min(b.ax, b.bx) - pad));
		const x1 = Math.min(COLS - 1, cellOf(Math.max(b.ax, b.bx) + pad));
		const z0 = Math.max(0, cellOf(Math.min(b.az, b.bz) - pad));
		const z1 = Math.min(ROWS - 1, cellOf(Math.max(b.az, b.bz) + pad));
		for (let cz = z0; cz <= z1; cz++) {
			for (let cx = x0; cx <= x1; cx++) {
				// the distance from the cell's middle, less half its diagonal
				if (pointSegment(centerOf(cx), centerOf(cz), b) - 0.71 * CELL < pad)
					buckets[cellIndex(cx, cz)].push(i);
			}
		}
	});
	return buckets;
}

// Where a ray first meets a blocker, as the distance along it, or Infinity.
// The ray's direction is a unit vector.
function rayBlocker(ox: number, oz: number, dx: number, dz: number, b: Blocker): number {
	const ex = b.bx - b.ax;
	const ez = b.bz - b.az;
	const len = Math.hypot(ex, ez);
	let best = Infinity;
	// the round ends
	for (const [cx, cz] of [
		[b.ax, b.az],
		[b.bx, b.bz]
	]) {
		const fx = ox - cx;
		const fz = oz - cz;
		const p = fx * dx + fz * dz;
		const q = fx * fx + fz * fz - b.r * b.r;
		const disc = p * p - q;
		if (disc < 0) continue;
		const t = -p - Math.sqrt(disc);
		if (t >= 0 && t < best) best = t;
		else if (q < 0) return 0;
	}
	if (len < 1e-9) return best;
	// the long sides
	const ux = ex / len;
	const uz = ez / len;
	const px = (ox - b.ax) * ux + (oz - b.az) * uz;
	const pn = (ox - b.ax) * -uz + (oz - b.az) * ux;
	const qx = dx * ux + dz * uz;
	const qn = dx * -uz + dz * ux;
	if (Math.abs(pn) < b.r && px >= 0 && px <= len) return 0;
	if (Math.abs(qn) > 1e-9) {
		for (const side of [b.r, -b.r]) {
			const t = (side - pn) / qn;
			if (t < 0 || t >= best) continue;
			const along = px + qx * t;
			if (along >= 0 && along <= len) best = t;
		}
	}
	return best;
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

// What blocks movement and bullets right now: walls, and doors not yet bought.
export class Blocking {
	readonly open: boolean[];
	private buckets: number[][];

	constructor(readonly map: GameMap) {
		this.open = map.doors.map(() => false);
		this.buckets = fileBlockers(map.blockers);
	}

	isSolid(cx: number, cy: number): boolean {
		if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
		const c = cellIndex(cx, cy);
		if (this.map.solid[c]) return true;
		const door = this.map.doorAt[c];
		return door >= 0 && !this.open[door];
	}

	// whether a move from a cell to its k-th neighbour is clear now
	private canMove(c: number, k: number): boolean {
		const m = this.map.moves[c * 8 + k];
		return m === FREE || (m >= 0 && this.open[m]);
	}

	private blocks(b: Blocker) {
		return b.door < 0 || !this.open[b.door];
	}

	// Moves a circle by (dx, dz), sliding along whatever it runs into.
	// Returns the new position.
	move(x: number, z: number, dx: number, dz: number, r: number): [number, number] {
		// small steps, so a fast mover cannot pass through a wall
		const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
		for (let i = 0; i < steps; i++) {
			x += dx / steps;
			z += dz / steps;
			[x, z] = this.pushOut(x, z, r);
		}
		return [x, z];
	}

	pushOut(x: number, z: number, r: number): [number, number] {
		// twice, for corners where two walls push at once
		for (let pass = 0; pass < 2; pass++) {
			const cx = cellOf(x);
			const cy = cellOf(z);
			if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return [x, z];
			for (const i of this.buckets[cellIndex(cx, cy)]) {
				const b = this.map.blockers[i];
				if (!this.blocks(b)) continue;
				const [px, pz, d] = closest(x, z, b);
				const min = b.r + r;
				if (d >= min) continue;
				if (d > 1e-9) {
					x = px + ((x - px) / d) * min;
					z = pz + ((z - pz) / d) * min;
				} else {
					// right on the line: out to its left
					const l = Math.hypot(b.bx - b.ax, b.bz - b.az) || 1;
					x = px - ((b.bz - b.az) / l) * min;
					z = pz + ((b.bx - b.ax) / l) * min;
				}
			}
		}
		return [x, z];
	}

	// The first blocker along a flat ray (in x and z), up to max: how far,
	// which way the surface faces, and whether it's a door. Bullets pass
	// windows, chain-link and anything waist high; sight lines for the
	// zombies' route finding don't.
	hit(x: number, z: number, dx: number, dz: number, max: number, bullets = false) {
		const none = { t: max, nx: 0, nz: 0, door: false };
		const len = Math.hypot(dx, dz);
		if (len < 1e-9) return none;
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
		let best = max;
		let found: Blocker | null = null;
		const seen = new Set<number>();
		let t = 0;
		while (t < best) {
			if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) break;
			for (const i of this.buckets[cellIndex(cx, cy)]) {
				if (seen.has(i)) continue;
				seen.add(i);
				const b = this.map.blockers[i];
				if (!this.blocks(b) || (bullets && b.porous)) continue;
				const hit = rayBlocker(x, z, dx, dz, b);
				if (hit < best) {
					best = hit;
					found = b;
				}
			}
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
		if (!found) return none;
		const [px, pz, d] = closest(x + dx * best, z + dz * best, found);
		let nx = d > 1e-6 ? (x + dx * best - px) / d : -dx;
		let nz = d > 1e-6 ? (z + dz * best - pz) / d : -dz;
		// a hit square on a thin wall's face points straight out of it
		if (nx * dx + nz * dz > 0) {
			nx = -nx;
			nz = -nz;
		}
		return { t: best, nx, nz, door: found.door >= 0 };
	}

	ray(x: number, z: number, dx: number, dz: number, max: number, bullets = false): number {
		return this.hit(x, z, dx, dz, max, bullets).t;
	}

	canSee(ax: number, az: number, bx: number, bz: number): boolean {
		const d = Math.hypot(bx - ax, bz - az);
		return this.ray(ax, az, bx - ax, bz - az, d) >= d;
	}

	// Path cost to the nearest source from every cell, moving 8 ways. Cells
	// with no way there are Infinity.
	flowField(sources: number[]): Float64Array {
		const cost = new Float64Array(COLS * ROWS).fill(Infinity);
		const heap = new MinHeap();
		for (const s of sources) {
			if (s < 0 || s >= cost.length) continue;
			cost[s] = 0;
			heap.push(s, 0);
		}
		while (heap.size) {
			const [c, d] = heap.pop();
			if (d > cost[c]) continue;
			const cx = c % COLS;
			const cy = (c / COLS) | 0;
			for (let k = 0; k < 8; k++) {
				const [dx, dy, step] = NEIGHBORS_8[k];
				const o = cellIndex(cx + dx, cy + dy);
				// moves are the same both ways, so a move out of o toward c
				// is checked as the move out of c toward o
				if (!this.canMove(c, k) || this.isSolid(cx + dx, cy + dy)) continue;
				const nd = d + step;
				if (nd < cost[o]) {
					cost[o] = nd;
					heap.push(o, nd);
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
		if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return null;
		const c = cellIndex(cx, cy);
		let best = field[c] ?? Infinity;
		let bestCell: [number, number] | null = null;
		for (let k = 0; k < 8; k++) {
			const [dx, dy] = NEIGHBORS_8[k];
			if (!this.canMove(c, k) || this.isSolid(cx + dx, cy + dy)) continue;
			const v = field[cellIndex(cx + dx, cy + dy)];
			if (v < best) {
				best = v;
				bestCell = [centerOf(cx + dx), centerOf(cy + dy)];
			}
		}
		return bestCell;
	}
}

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
