import type { Car, RaceEvent } from './sim';
import { HULL } from './sim';
import { HALF_CORRIDOR, HALF_ROAD, TRACK, WORLD_H, WORLD_W, lateral, nearest } from './track';

// Draws the race as pixel art. Everything is plotted pixel by pixel into one
// small frame (4 px to the metre) that the page scales up with hard edges;
// nothing is smoothed, so turned and dented cars stay crisp.

export const SCALE = 4;
export const WIDTH = WORLD_W * SCALE;
export const HEIGHT = WORLD_H * SCALE;

/** What the renderer needs to know about a car. */
export type CarView = Pick<
	Car,
	'entry' | 'x' | 'y' | 'angle' | 'speed' | 'slip' | 'hull' | 'retired'
>;

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

// colours are packed the way the canvas stores them: alpha, blue, green, red
function hex(colour: string) {
	const v = parseInt(colour.slice(1), 16);
	return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
}
function mix(a: number, b: number, t: number) {
	const channel = (shift: number) =>
		(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t) << shift;
	return (0xff000000 | channel(16) | channel(8) | channel(0)) >>> 0;
}

const GRASS = [hex('#3a6b35'), hex('#427739')];
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
const DEBUG_LINE = hex('#40e0ff');
const DEBUG_HULL = hex('#ff40c0');

/** The track from above, painted once. */
function paintGround() {
	const { n, step, x, y, tx, ty, bend, length } = TRACK;
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
	for (let py = 0; py < HEIGHT; py++) {
		for (let px = 0; px < WIDTH; px++) {
			const k = py * WIDTH + px;
			// a fixed speckle, so each surface has some grain
			const mixed = Math.imul(px * 374761393 + py * 668265263, 1274126177);
			const grain = ((mixed ^ (mixed >>> 13)) >>> 0) % 7 < 2 ? 1 : 0;
			const i = which[k];
			const wx = (px + 0.5) / SCALE;
			const wy = (py + 0.5) / SCALE;
			const across = near[k] === Infinity ? Infinity : Math.abs(lateral(wx, wy, i));
			if (across > HALF_CORRIDOR + 0.8) {
				ground[k] = GRASS[grain];
			} else if (across > HALF_CORRIDOR + 0.5) {
				ground[k] = WALL_SHADOW;
			} else if (across > HALF_CORRIDOR) {
				ground[k] = WALL;
			} else if (across > HALF_ROAD) {
				ground[k] = VERGE[grain];
			} else {
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
					ground[k] = TARMAC[grain];
				}
			}
		}
	}
	return ground;
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

export function createRenderer(canvas: HTMLCanvasElement) {
	canvas.width = WIDTH;
	canvas.height = HEIGHT;
	const context = canvas.getContext('2d')!;
	const image = context.createImageData(WIDTH, HEIGHT);
	const frame = new Uint32Array(image.data.buffer);
	const clean = paintGround();
	// the ground with this race's tyre marks and litter on it
	const ground = clean.slice();
	const worn = new Uint8Array(WIDTH * HEIGHT);
	let particles: Particle[] = [];

	const pixel = (x: number, y: number) => {
		const px = Math.floor(x * SCALE);
		const py = Math.floor(y * SCALE);
		return px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT ? -1 : py * WIDTH + px;
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
		const cx = Math.floor(car.x * SCALE);
		const cy = Math.floor(car.y * SCALE);
		for (let py = Math.max(0, cy - 12); py < Math.min(HEIGHT, cy + 13); py++) {
			for (let px = Math.max(0, cx - 12); px < Math.min(WIDTH, cx + 13); px++) {
				// this pixel in the car's own metres; the shadow falls a pixel
				// down and to the right
				const wx = (px + (shadow ? -0.5 : 0.5)) / SCALE - car.x;
				const wy = (py + (shadow ? -0.5 : 0.5)) / SCALE - car.y;
				const x = wx * cos + wy * sin;
				const y = wy * cos - wx * sin;
				const k = py * WIDTH + px;
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

	return {
		/** Wipes the marks and litter of the last race. */
		reset() {
			ground.set(clean);
			worn.fill(0);
			particles = [];
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

		/** Draws one frame, `dt` seconds after the last. */
		draw(cars: CarView[], dt: number, show: { line: boolean; hulls: boolean }) {
			for (const car of cars) {
				const cos = Math.cos(car.angle);
				const sin = Math.sin(car.angle);
				const offRoad = Math.abs(lateral(car.x, car.y, nearest(car.x, car.y))) > HALF_ROAD;
				if (car.slip > 0.2 && Math.abs(car.speed) > 3) {
					// rubber laid down by the rear tyres
					for (const side of [-0.8, 0.8]) {
						const k = pixel(car.x - 1.3 * cos - side * sin, car.y - 1.3 * sin + side * cos);
						if (k >= 0 && worn[k] < 3) {
							worn[k]++;
							ground[k] = mix(ground[k], BLACK, 0.3);
						}
					}
					if (Math.random() < car.slip) {
						puff(car.x - 1.3 * cos, car.y - 1.3 * sin, 1.5, 0.5, offRoad ? DUST : SMOKE, true);
					}
				} else if (offRoad && Math.abs(car.speed) > 6 && Math.random() < 0.5) {
					puff(car.x - 1.3 * cos, car.y - 1.3 * sin, 1, 0.4, DUST, true);
				}
				if (car.retired && Math.random() < 0.25) {
					puff(car.x + 1.2 * cos, car.y + 1.2 * sin, 1.2, 0.9, SOOT, true);
				}
			}

			frame.set(ground);
			for (const car of cars) plot(car, true);
			for (const car of cars) plot(car, false);

			for (const p of particles) {
				p.life -= dt;
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				const k = pixel(p.x, p.y);
				if (k < 0) continue;
				if (p.smoke) {
					// thinning out as it fades: fewer pixels drawn, then fainter
					if (p.life / p.span > 0.5 || (k + Math.floor(k / WIDTH)) & 1) {
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
				for (let i = 0; i < TRACK.n; i += 2) {
					const k = pixel(
						TRACK.x[i] + TRACK.nx[i] * TRACK.line[i],
						TRACK.y[i] + TRACK.ny[i] * TRACK.line[i]
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
			context.putImageData(image, 0, 0);
		}
	};
}
