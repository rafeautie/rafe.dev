import { createPainter, hex, mix, type Painter } from './pixels';
import { standing, type ReplayTruck } from './recording';
import { GARAGE, HALF_LANE, NEARSIDE, RING, SLIP, TRUCK, serviceFor, type Route } from './service';
import { HULL, neutral, type Car, type Flag, type RaceEvent } from './sim';
import {
	HALF_CORRIDOR,
	HALF_ROAD,
	WORLD_H,
	WORLD_W,
	lateral,
	nearest,
	type Track,
	type TrackId
} from './track';

// Draws the race as pixel art. Everything is plotted pixel by pixel into one
// small frame (4 px to the metre) that is scaled up with hard edges; nothing
// is smoothed, so turned and dented cars stay crisp.
//
// The frame is the track's own 160 x 90 m unless `resize` makes it larger.
// Then the track sits somewhere inside it with grass all round, which is where
// the page draws the broadcast graphics (components/race/hud.ts).

export const SCALE = 4;
export const WIDTH = WORLD_W * SCALE;
export const HEIGHT = WORLD_H * SCALE;

/**
 * How fast (m/s) tyres must slide sideways to leave rubber on the road, and
 * to smoke. Tyres near their limit slide a few m/s all the time without
 * either.
 */
const MARKS_FROM = 4;
const SMOKE_FROM = 9;

/** What the renderer needs to know about a car. */
export type CarView = Pick<
	Car,
	'entry' | 'x' | 'y' | 'angle' | 'speed' | 'slip' | 'hull' | 'retired'
>;

/** What the renderer needs to know besides the cars: the trucks, and the flag that is flying. A replay is one. */
export type Service = { trucks: ReplayTruck[]; flag: Flag };

/** Nothing happening on a track: every truck in its garage, no caution. */
const standingBy = (track: Track): Service => ({ trucks: standing(track), flag: 'green' });

/** A caution lamp stands on the wall this far before its gate. */
const LAMP_BEFORE = 6;

/** A pixel of the track's own picture, and the colour something drawn over the ground has there. */
type Dab = { x: number; y: number; colour: number };

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Seconds left, and seconds it started with. */
	life: number;
	span: number;
	colour: number;
	/** Smoke fades out; debris lands and stays on the ground. */
	smoke: boolean;
};

// two mowings of the grass, each with its speckle
const GRASS = [
	[hex('#3a6b35'), hex('#427739')],
	[hex('#376631'), hex('#3e7135')]
];
const VERGE = [hex('#b9a26a'), hex('#ab945c')];
const TARMAC = [hex('#3b3d45'), hex('#40424b')];
const SLOT = hex('#2d2f36');
const PAINT = hex('#e8e6df');
const KERB = hex('#c8382f');
const WALL = hex('#d9d6cc');
const WALL_SHADOW = hex('#6f6c64');
const BLACK = hex('#17181c');
const TYRE = hex('#1b1c20');
const GLASS = hex('#1f2a38');
const GLINT = hex('#4a6282');
const STRIPE = hex('#f2efe6');
const SMOKE = hex('#c9c9cf');
const DUST = hex('#d6c493');
const SOOT = hex('#3a3a3f');
const SPARK = hex('#ffd866');
// the service road is concrete, paler than the track
const CONCRETE = [hex('#85867f'), hex('#8e8f88')];
const BARRIER = [hex('#f0a020'), hex('#f2efe6')];
const ROOF = hex('#586472');
const RIDGE = hex('#7c8896');
const EAVES = hex('#3a434d');
const AMBER = hex('#f2b320');
const AMBER_SHADE = hex('#a8760c');
const STEEL = hex('#4a4e57');
const BOOM = hex('#878d97');
const LAMP = hex('#ffc21a');
const LAMP_OUT = hex('#4d3f1c');
const DEBUG_LINE = hex('#40e0ff');
const DEBUG_HULL = hex('#ff40c0');

/** A fixed speckle, so each surface has some grain. */
function grain(px: number, py: number) {
	const mixed = Math.imul(px * 374761393 + py * 668265263, 1274126177);
	return ((mixed ^ (mixed >>> 13)) >>> 0) % 7 < 2 ? 1 : 0;
}

/** The grass at a pixel, counted from the track's corner: mown in broad diagonal stripes. */
function grass(px: number, py: number) {
	return GRASS[((px + py) >> 5) & 1][grain(px, py)];
}

type Painting = ReturnType<typeof paint>;

const painted = new Map<TrackId, Painting>();

/** A track from above, painted the first time it is shown. */
function paintTrack(track: Track) {
	let painting = painted.get(track.id);
	if (!painting) {
		painting = paint(track);
		painted.set(track.id, painting);
	}
	return painting;
}

/**
 * A track from above, and what is drawn over it each frame:
 * the barrier across each gate while it is shut, the caution lamp beside each
 * gate, and the garages' roofs, which the trucks park under.
 */
function paint(track: Track) {
	const { n, step, x, y, tx, ty, bend, length } = track;
	const { homes, gates, layby, parked, place, route } = serviceFor(track);
	// the nearest centre-line sample to every pixel near the track
	const near = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
	const which = new Int16Array(WIDTH * HEIGHT);
	const reach = Math.ceil((HALF_CORRIDOR + 2) * SCALE);
	for (let i = 0; i < n; i++) {
		const cx = x[i] * SCALE;
		const cy = y[i] * SCALE;
		for (let py = Math.max(0, Math.floor(cy - reach)); py < Math.min(HEIGHT, cy + reach); py++) {
			for (let px = Math.max(0, Math.floor(cx - reach)); px < Math.min(WIDTH, cx + reach); px++) {
				const d = (px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2;
				const k = py * WIDTH + px;
				if (d < near[k]) {
					near[k] = d;
					which[k] = i;
				}
			}
		}
	}

	const ground = new Uint32Array(WIDTH * HEIGHT);
	// what each pixel is, for laying the service road over it: grass, wall, verge or tarmac
	const [GRASS_, WALL_, VERGE_, TARMAC_] = [0, 1, 2, 3];
	const surface = new Uint8Array(WIDTH * HEIGHT);
	for (let py = 0; py < HEIGHT; py++) {
		for (let px = 0; px < WIDTH; px++) {
			const k = py * WIDTH + px;
			const speck = grain(px, py);
			const i = which[k];
			const wx = (px + 0.5) / SCALE;
			const wy = (py + 0.5) / SCALE;
			const across = near[k] === Infinity ? Infinity : Math.abs(lateral(track, wx, wy, i));
			if (across > HALF_CORRIDOR + 0.8) {
				ground[k] = grass(px, py);
				surface[k] = GRASS_;
			} else if (across > HALF_CORRIDOR) {
				ground[k] = across > HALF_CORRIDOR + 0.5 ? WALL_SHADOW : WALL;
				surface[k] = WALL_;
			} else if (across > HALF_ROAD) {
				ground[k] = VERGE[speck];
				surface[k] = VERGE_;
			} else {
				surface[k] = TARMAC_;
				// metres round the lap, for the start line and the kerb stripes
				const along = i * step + (wx - x[i]) * tx[i] + (wy - y[i]) * ty[i];
				const fromLine = Math.min(Math.abs(along), Math.abs(along - length));
				if (fromLine < 0.5) {
					ground[k] = (px + py) & 1 ? PAINT : BLACK;
				} else if (across > HALF_ROAD - 0.5) {
					// kerbs on the bends, a painted line on the straights
					const kerb = bend[i] > 1 / 30 && Math.floor(along / 1.5) & 1;
					ground[k] = kerb ? KERB : PAINT;
				} else if (Math.abs(across - 2) < 0.13) {
					// the two slots a slot car track would have
					ground[k] = SLOT;
				} else {
					ground[k] = TARMAC[speck];
				}
			}
		}
	}

	/**
	 * Lays concrete a lane wide along a way, over grass, and with `through`
	 * over the wall and the verge too. Returns the wall it took out.
	 */
	function pave(way: Route, through = false) {
		const gap: Dab[] = [];
		const half = HALF_LANE * SCALE;
		const reach = Math.ceil(half);
		for (let d = 0; d <= way.length; d += 0.25) {
			let at = 0;
			while (at + 2 < way.count && way.along[at + 1] <= d) at++;
			const t = (d - way.along[at]) / (way.along[at + 1] - way.along[at]);
			const cx = (way.x[at] + (way.x[at + 1] - way.x[at]) * t) * SCALE;
			const cy = (way.y[at] + (way.y[at + 1] - way.y[at]) * t) * SCALE;
			for (let py = Math.floor(cy - reach); py <= cy + reach; py++) {
				for (let px = Math.floor(cx - reach); px <= cx + reach; px++) {
					if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) continue;
					if ((px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 > half ** 2) continue;
					const k = py * WIDTH + px;
					if (surface[k] === TARMAC_ || (surface[k] !== GRASS_ && !through)) continue;
					if (surface[k] === WALL_) {
						gap.push({ x: px, y: py, colour: BARRIER[((px + py) >> 2) & 1] });
						surface[k] = TARMAC_;
					}
					ground[k] = CONCRETE[grain(px, py)];
				}
			}
		}
		return gap;
	}

	// the service road all the way round, and the lay-by through each garage
	pave(
		route([
			[0, -RING],
			[n, -RING]
		])
	);
	for (const home of homes) pave(layby(home));
	// each gate: the way out onto the track and the way back off it, through the wall
	const barriers = gates.map((gate) => [
		...pave(
			route([
				[gate - SLIP, -RING],
				[gate + SLIP, NEARSIDE]
			]),
			true
		),
		...pave(
			route([
				[gate - SLIP, NEARSIDE],
				[gate + SLIP, -RING]
			]),
			true
		)
	]);
	// a lamp on the wall before each gate, two pixels square
	const lamps = gates.flatMap((gate) => {
		const [lx, ly] = place(gate - LAMP_BEFORE, -HALF_CORRIDOR - 0.3).map((at) =>
			Math.floor(at * SCALE)
		);
		return [0, 1, 2, 3].map((corner) => ({ x: lx + (corner & 1), y: ly + (corner >> 1) }));
	});

	// The garages: a roof over the lay-by, lit from the top left like the
	// cars, with its shadow on the ground beside it.
	const roofs: Dab[] = [];
	for (const home of homes) {
		const { x: gx, y: gy, angle } = parked(home);
		const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
		const reach = Math.ceil(Math.hypot(GARAGE.length, GARAGE.width) * 0.5 * SCALE) + 2;
		/** Whether a point is under the roof, and if so how far along and across it. */
		const under = (wx: number, wy: number) => {
			const along = (wx - gx) * cos + (wy - gy) * sin;
			const side = (wy - gy) * cos - (wx - gx) * sin;
			const inside = Math.abs(along) <= GARAGE.length / 2 && Math.abs(side) <= GARAGE.width / 2;
			return inside ? { along, side } : null;
		};
		for (let py = Math.floor(gy * SCALE) - reach; py <= gy * SCALE + reach; py++) {
			for (let px = Math.floor(gx * SCALE) - reach; px <= gx * SCALE + reach; px++) {
				if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) continue;
				const k = py * WIDTH + px;
				const roof = under((px + 0.5) / SCALE, (py + 0.5) / SCALE);
				if (!roof) {
					// the shadow falls down and to the right
					if (under((px - 2.5) / SCALE, (py - 2.5) / SCALE)) ground[k] = mix(ground[k], BLACK, 0.4);
					continue;
				}
				const edge = Math.min(
					GARAGE.length / 2 - Math.abs(roof.along),
					GARAGE.width / 2 - Math.abs(roof.side)
				);
				// corrugated: a rib every half metre, a ridge down the middle
				const rib = Math.floor(roof.along * 2) & 1;
				const colour =
					edge < 0.3 ? EAVES : Math.abs(roof.side) < 0.3 ? RIDGE : mix(ROOF, BLACK, rib * 0.12);
				roofs.push({ x: px, y: py, colour });
			}
		}
	}
	return { ground, barriers, lamps, roofs };
}

/** Whether a point (in the car's own metres) is inside its outline. */
function inside(hull: Float32Array, x: number, y: number) {
	let within = false;
	for (let a = 0, b = hull.length - 2; a < hull.length; b = a, a += 2) {
		if (
			hull[a + 1] > y !== hull[b + 1] > y &&
			x < ((hull[b] - hull[a]) * (y - hull[a + 1])) / (hull[b + 1] - hull[a + 1]) + hull[a]
		) {
			within = !within;
		}
	}
	return within;
}

/** How far a point inside the outline is from its nearest edge. */
function edge(hull: Float32Array, x: number, y: number) {
	let least = Infinity;
	for (let a = 0, b = hull.length - 2; a < hull.length; b = a, a += 2) {
		const ex = hull[a] - hull[b];
		const ey = hull[a + 1] - hull[b + 1];
		const t = Math.max(
			0,
			Math.min(1, ((x - hull[b]) * ex + (y - hull[b + 1]) * ey) / (ex * ex + ey * ey))
		);
		least = Math.min(least, Math.hypot(x - hull[b] - ex * t, y - hull[b + 1] - ey * t));
	}
	return least;
}

/** Draws on `canvas`, starting with `track`; `setTrack` changes it. */
export function createRenderer(canvas: HTMLCanvasElement, initial: Track) {
	const context = canvas.getContext('2d')!;
	let track = initial;
	let painting = paintTrack(track);
	let idle = standingBy(track);
	// the frame's size, and where in it the track's corner is
	let width = 0;
	let height = 0;
	let ox = 0;
	let oy = 0;
	// how many of the screen's pixels each of the frame's is shown as, or 0 to
	// leave the scaling to the page
	let zoom = 0;
	let image: ImageData;
	let frame: Uint32Array;
	let painter: Painter;
	let clean: Uint32Array;
	// the ground with this race's tyre marks and litter on it
	let ground = new Uint32Array(0);
	let worn = new Uint8Array(0);
	let particles: Particle[] = [];
	// the frame at its own size, and at the next whole size up, on the way to the screen
	const small = document.createElement('canvas');
	const large = document.createElement('canvas');

	function resize(w: number, h: number, x: number, y: number, scale: number) {
		const before = { width, ox, oy, ground, worn };
		[width, height, ox, oy, zoom] = [w, h, x, y, scale];
		image = new ImageData(width, height);
		frame = new Uint32Array(image.data.buffer);
		painter = createPainter(frame, width, height);
		clean = new Uint32Array(width * height);
		worn = new Uint8Array(width * height);
		for (let py = 0; py < height; py++) {
			for (let px = 0; px < width; px++) {
				const tx = px - ox;
				const ty = py - oy;
				const on = tx >= 0 && ty >= 0 && tx < WIDTH && ty < HEIGHT;
				clean[py * width + px] = on ? painting.ground[ty * WIDTH + tx] : grass(tx, ty);
			}
		}
		ground = clean.slice();
		// the marks already on the track stay on it, wherever it now is
		for (let ty = 0; ty < HEIGHT; ty++) {
			for (let tx = 0; tx < WIDTH; tx++) {
				const from = (ty + before.oy) * before.width + tx + before.ox;
				const to = (ty + oy) * width + tx + ox;
				if (from < before.ground.length && to < ground.length) {
					ground[to] = before.ground[from];
					worn[to] = before.worn[from];
				}
			}
		}
		canvas.width = small.width = width;
		canvas.height = small.height = height;
		if (zoom) {
			canvas.width = Math.round(width * zoom);
			canvas.height = Math.round(height * zoom);
			large.width = width * Math.ceil(zoom);
			large.height = height * Math.ceil(zoom);
		}
	}
	resize(WIDTH, HEIGHT, 0, 0, 0);

	function reset() {
		ground.set(clean);
		worn.fill(0);
		particles = [];
	}

	/** Puts the finished frame on the screen. */
	function present() {
		if (!zoom) return context.putImageData(image, 0, 0);
		small.getContext('2d')!.putImageData(image, 0, 0);
		let from = small;
		if (!Number.isInteger(zoom)) {
			// Between whole sizes, hard pixels would come out uneven widths and
			// make the lettering wobble. So it is scaled up hard to the next
			// whole size and brought down smoothly from there: every pixel the
			// same size, with edges a shade soft.
			const up = large.getContext('2d')!;
			up.imageSmoothingEnabled = false;
			up.drawImage(small, 0, 0, large.width, large.height);
			from = large;
		}
		context.imageSmoothingEnabled = from === large;
		context.drawImage(from, 0, 0, canvas.width, canvas.height);
	}

	const pixel = (x: number, y: number) => {
		const px = Math.floor(x * SCALE) + ox;
		const py = Math.floor(y * SCALE) + oy;
		return px < 0 || py < 0 || px >= width || py >= height ? -1 : py * width + px;
	};

	function puff(x: number, y: number, speed: number, span: number, colour: number, smoke: boolean) {
		const angle = Math.random() * Math.PI * 2;
		const v = speed * (0.3 + Math.random() * 0.7);
		particles.push({
			x,
			y,
			vx: Math.cos(angle) * v,
			vy: Math.sin(angle) * v,
			life: span,
			span,
			colour,
			smoke
		});
	}

	/** Plots one car, or with `shadow` just darkens the ground beside it. */
	function plot(car: CarView, shadow: boolean) {
		const cos = Math.cos(car.angle);
		const sin = Math.sin(car.angle);
		const body = hex(car.entry.color);
		const shade = hex(car.entry.shade);
		const cx = Math.floor(car.x * SCALE) + ox;
		const cy = Math.floor(car.y * SCALE) + oy;
		for (let py = Math.max(0, cy - 12); py < Math.min(height, cy + 13); py++) {
			for (let px = Math.max(0, cx - 12); px < Math.min(width, cx + 13); px++) {
				// this pixel in the car's own metres; the shadow falls a pixel
				// down and to the right
				const wx = (px - ox + (shadow ? -0.5 : 0.5)) / SCALE - car.x;
				const wy = (py - oy + (shadow ? -0.5 : 0.5)) / SCALE - car.y;
				const x = wx * cos + wy * sin;
				const y = wy * cos - wx * sin;
				const k = py * width + px;
				const wheel = Math.abs(Math.abs(y) - 0.85) < 0.22 && Math.abs(Math.abs(x) - 1.3) < 0.5;
				if (!inside(car.hull, x, y)) {
					if (wheel) frame[k] = shadow ? mix(frame[k], BLACK, 0.4) : TYRE;
					continue;
				}
				if (shadow) {
					frame[k] = mix(frame[k], BLACK, 0.4);
					continue;
				}
				let colour = body;
				if (edge(car.hull, x, y) < 0.2) colour = shade;
				else if (x > -0.9 && x < 0.6 && Math.abs(y) < 0.6) colour = x > 0.25 ? GLINT : GLASS;
				else if (Math.abs(y) < 0.14) colour = STRIPE;
				// crumpled metal goes dark around each pushed-in corner
				for (let v = 0; v < HULL.length; v += 2) {
					const moved = Math.hypot(car.hull[v] - HULL[v], car.hull[v + 1] - HULL[v + 1]);
					if (moved > 0.08 && Math.hypot(x - car.hull[v], y - car.hull[v + 1]) < 0.3 + moved) {
						colour = mix(colour, BLACK, Math.min(0.7, moved * 1.6));
					}
				}
				frame[k] = car.retired ? mix(colour, SOOT, 0.5) : colour;
			}
		}
	}

	/** Puts a pixel of the track's own picture on the frame, wherever the track is in it. */
	function dab({ x, y, colour }: Dab) {
		const px = x + ox;
		const py = y + oy;
		if (px >= 0 && py >= 0 && px < width && py < height) frame[py * width + px] = colour;
	}

	/** Plots one truck, or with `shadow` just darkens the ground beside it. */
	function haul(truck: ReplayTruck, shadow: boolean) {
		const cos = Math.cos(truck.angle);
		const sin = Math.sin(truck.angle);
		const cx = Math.floor(truck.x * SCALE) + ox;
		const cy = Math.floor(truck.y * SCALE) + oy;
		// its two lamps flash turn about while it is out
		const flash = truck.busy ? 1 + (Math.floor(performance.now() / 180) & 1) : 0;
		for (let py = Math.max(0, cy - 15); py < Math.min(height, cy + 16); py++) {
			for (let px = Math.max(0, cx - 15); px < Math.min(width, cx + 16); px++) {
				const wx = (px - ox + (shadow ? -0.5 : 0.5)) / SCALE - truck.x;
				const wy = (py - oy + (shadow ? -0.5 : 0.5)) / SCALE - truck.y;
				const x = wx * cos + wy * sin;
				const y = wy * cos - wx * sin;
				const k = py * width + px;
				const [fore, side] = [Math.abs(x), Math.abs(y)];
				if (fore > TRUCK.long || side > TRUCK.wide) {
					const wheel = Math.abs(side - TRUCK.wide) < 0.22 && Math.abs(fore - 1.9) < 0.55;
					if (wheel) frame[k] = shadow ? mix(frame[k], BLACK, 0.4) : TYRE;
					continue;
				}
				if (shadow) {
					frame[k] = mix(frame[k], BLACK, 0.4);
					continue;
				}
				let colour = AMBER;
				if (x > 1) {
					// the cab: a windscreen, and the lamp bar on its roof
					if (x > 2.85 || side > 1) colour = AMBER_SHADE;
					else if (x > 2 && x < 2.6) colour = y > 0.4 ? GLINT : GLASS;
					else if (x > 1.25 && x < 1.7 && side < 0.9) {
						colour = flash === (y > 0 ? 1 : 2) ? LAMP : flash ? AMBER_SHADE : LAMP_OUT;
					}
				} else if (x < -2.55) {
					// the tail board, striped
					colour = Math.floor((y + 3) * 2) & 1 ? AMBER : BLACK;
				} else if (side > 0.95) {
					colour = AMBER_SHADE;
				} else {
					// the bed, with the boom lying down the middle of it
					colour = side < 0.25 && x < 0.3 ? BOOM : STEEL;
				}
				frame[k] = colour;
			}
		}
	}

	/** The cable from a truck's hook to the end of the car on it, whichever end that is. */
	function cable(truck: ReplayTruck, car: CarView) {
		const hx = truck.x - Math.cos(truck.angle) * TRUCK.hook;
		const hy = truck.y - Math.sin(truck.angle) * TRUCK.hook;
		// the bodywork ends about two metres out from the car's middle
		const [ex, ey] = [-1, 1]
			.map((end) => [car.x + Math.cos(car.angle) * 2 * end, car.y + Math.sin(car.angle) * 2 * end])
			.sort((a, b) => Math.hypot(a[0] - hx, a[1] - hy) - Math.hypot(b[0] - hx, b[1] - hy))[0];
		const run = Math.hypot(ex - hx, ey - hy) || 1;
		for (let d = 0; d <= run; d += 0.2) {
			const k = pixel(hx + ((ex - hx) * d) / run, hy + ((ey - hy) * d) / run);
			if (k >= 0) frame[k] = BLACK;
		}
	}

	return {
		/**
		 * Makes the frame `w` by `h` pixels with the track's corner at x, y, each
		 * pixel shown as `scale` of the screen's.
		 */
		resize,

		/** Wipes the marks and litter of the last race. */
		reset,

		/** Shows another track, clean. */
		setTrack(next: Track) {
			if (next === track) return;
			track = next;
			painting = paintTrack(track);
			idle = standingBy(track);
			resize(width, height, ox, oy, zoom);
			reset();
		},

		/** Shows something that happened: a knock throws sparks and bits of car. */
		event(event: RaceEvent, car: CarView) {
			if (event.kind !== 'hit') return;
			const bits = Math.min(16, Math.round(event.force * 1.2));
			for (let b = 0; b < bits; b++) {
				const colour = b % 3 === 0 ? SPARK : b % 3 === 1 ? hex(car.entry.color) : BLACK;
				puff(event.x, event.y, 3 + event.force * 0.6, 0.25 + Math.random() * 0.5, colour, false);
			}
		},

		/**
		 * Draws one frame, `dt` seconds after the last, with the recovery crews
		 * as `service` has them. `over` is handed the frame once the race is on
		 * it, to draw what goes on top.
		 */
		draw(
			cars: CarView[],
			dt: number,
			show: { line: boolean; hulls: boolean },
			service: Service = idle,
			over?: (painter: Painter) => void
		) {
			// nothing new is thrown up while the race is paused
			for (const car of dt > 0 ? cars : []) {
				const cos = Math.cos(car.angle);
				const sin = Math.sin(car.angle);
				const offRoad =
					Math.abs(lateral(track, car.x, car.y, nearest(track, car.x, car.y))) > HALF_ROAD;
				// where the two rear tyres meet the road
				const rear = [-0.85, 0.85].map((side) => ({
					x: car.x - 1.3 * cos - side * sin,
					y: car.y - 1.3 * sin + side * cos
				}));
				if (car.slip > MARKS_FROM) {
					// rubber laid down by them, and smoke off each once they
					// slide fast enough to burn; on the verge, dust
					const thick = offRoad ? 0.5 : Math.min(1, (car.slip - SMOKE_FROM) / 8 + 0.25) * 0.6;
					for (const tyre of rear) {
						const k = pixel(tyre.x, tyre.y);
						if (k >= 0 && worn[k] < 3) {
							worn[k]++;
							ground[k] = mix(ground[k], BLACK, 0.3);
						}
						if ((offRoad || car.slip > SMOKE_FROM) && Math.random() < thick) {
							puff(tyre.x, tyre.y, 1.5, 0.5, offRoad ? DUST : SMOKE, true);
						}
					}
				} else if (offRoad && Math.abs(car.speed) > 6) {
					for (const tyre of rear) {
						if (Math.random() < 0.5) puff(tyre.x, tyre.y, 1, 0.4, DUST, true);
					}
				}
				if (car.retired && Math.random() < 0.25) {
					puff(car.x + 1.2 * cos, car.y + 1.2 * sin, 1.2, 0.9, SOOT, true);
				}
			}

			frame.set(ground);
			// A gate is shut, its barrier across it, unless it has been opened
			// for a truck to go through. Under caution, and until the green, the lamps flash.
			painting.barriers.forEach((barrier, index) => {
				if (!service.trucks.some((truck) => truck.gate === index)) barrier.forEach(dab);
			});
			const lit = neutral(service.flag) && Math.floor(performance.now() / 300) & 1;
			for (const lamp of painting.lamps) dab({ ...lamp, colour: lit ? LAMP : LAMP_OUT });
			// a truck in its garage is under the roof, and need not be drawn at all
			const trucks = service.trucks.filter((truck) => truck.busy);
			for (const truck of trucks) haul(truck, true);
			for (const car of cars) plot(car, true);
			for (const truck of trucks) haul(truck, false);
			for (const car of cars) plot(car, false);
			for (const truck of trucks) if (cars[truck.towing]) cable(truck, cars[truck.towing]);
			painting.roofs.forEach(dab);

			for (const p of particles) {
				p.life -= dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				const k = pixel(p.x, p.y);
				if (k < 0) continue;
				if (p.smoke) {
					// thinning out as it fades: fewer pixels drawn, then fainter
					if (p.life / p.span > 0.5 || (k + Math.floor(k / width)) & 1) {
						frame[k] = mix(frame[k], p.colour, 0.7);
					}
				} else if (p.life <= 0) {
					ground[k] = p.colour === SPARK ? ground[k] : p.colour;
				} else {
					frame[k] = p.colour;
				}
			}
			particles = particles.filter((p) => p.life > 0);

			if (show.line) {
				for (let i = 0; i < track.n; i += 2) {
					const k = pixel(
						track.x[i] + track.nx[i] * track.line[i],
						track.y[i] + track.ny[i] * track.line[i]
					);
					if (k >= 0) frame[k] = DEBUG_LINE;
				}
			}
			if (show.hulls) {
				for (const car of cars) {
					const cos = Math.cos(car.angle);
					const sin = Math.sin(car.angle);
					for (let v = 0; v < car.hull.length; v += 2) {
						const k = pixel(
							car.x + car.hull[v] * cos - car.hull[v + 1] * sin,
							car.y + car.hull[v] * sin + car.hull[v + 1] * cos
						);
						if (k >= 0) frame[k] = DEBUG_HULL;
					}
				}
			}
			over?.(painter);
			present();
		}
	};
}
