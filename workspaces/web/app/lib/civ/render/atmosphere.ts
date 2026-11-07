import type { WeatherKind } from '../types';
import { hash, type DrawState, type View } from './scene';

// Light and weather over the whole scene: a tint for the season and for the
// weather, rain and snow in screen space, storm flashes, and a faint vignette
// up close. Lighting follows season and weather only, never time of day.
// Weather fades in and out instead of switching, and particles are worked out
// from the clock each frame, so there is nothing to allocate.

const MAX_RAIN = 320;
const MAX_SNOW = 220;

// season tints: spring fresh, summer warm, autumn golden, winter cool and pale
const SEASON_TINT = [
	'rgba(170, 225, 130, 0.05)',
	'rgba(255, 205, 110, 0.06)',
	'rgba(235, 155, 55, 0.1)',
	'rgba(205, 225, 248, 0.13)'
];

type Weights = { rain: number; storm: number; snow: number; drought: number; cold: number };
const weights: Weights = { rain: 0, storm: 0, snow: 0, drought: 0, cold: 0 };
let lastNow = -1;

// What each weather is heading toward. Snow and storms are cold or dark too.
export function weatherTarget(kind: WeatherKind, out: Weights): Weights {
	out.rain = kind === 'rain' ? 1 : 0;
	out.storm = kind === 'storm' ? 1 : 0;
	out.snow = kind === 'snow' ? 1 : 0;
	out.drought = kind === 'drought' ? 1 : 0;
	out.cold = kind === 'cold' ? 1 : 0;
	return out;
}

const target: Weights = { rain: 0, storm: 0, snow: 0, drought: 0, cold: 0 };
const KEYS: (keyof Weights)[] = ['rain', 'storm', 'snow', 'drought', 'cold'];

// Ease the weights toward the current weather (about 1.5 s to settle).
export function stepWeights(w: Weights, kind: WeatherKind, dtSec: number): void {
	weatherTarget(kind, target);
	const k = dtSec >= 5 || dtSec < 0 ? 1 : 1 - Math.exp(-dtSec / 1.5);
	for (const key of KEYS) w[key] += (target[key] - w[key]) * k;
}

// Lightning brightness 0..1 at a time (ms): at most one double flash every
// 6.5 s, and not every slot, so it never strobes.
export function lightningAt(nowMs: number): number {
	const slotLen = 6.5;
	const t = nowMs / 1000;
	const slot = Math.floor(t / slotLen);
	if (hash(slot, 91) < 0.35) return 0;
	const into = t - slot * slotLen - hash(slot, 92) * (slotLen - 1);
	if (into < 0 || into > 0.6) return 0;
	const a = Math.exp(-into * 9);
	const b = into > 0.18 ? Math.exp(-(into - 0.18) * 11) * 0.7 : 0;
	return Math.min(1, Math.max(a, b));
}

// fixed random numbers per particle: x, y, speed, phase
const seeds = new Float32Array(Math.max(MAX_RAIN, MAX_SNOW) * 4);
for (let i = 0; i < seeds.length / 4; i++) {
	seeds[i * 4] = hash(i, 1);
	seeds[i * 4 + 1] = hash(i, 2);
	seeds[i * 4 + 2] = hash(i, 3);
	seeds[i * 4 + 3] = hash(i, 4);
}

let vignette: CanvasGradient | null = null;
let vignetteKey = '';
let vignetteCtx: CanvasRenderingContext2D | null = null;

export function drawAtmosphere(ctx: CanvasRenderingContext2D, state: DrawState, view: View): void {
	const { camera, now } = state;
	const w = camera.width;
	const h = camera.height;
	const detail = view.detail;

	const dt = lastNow < 0 ? 99 : (now - lastNow) / 1000;
	if (now !== lastNow) {
		stepWeights(weights, state.weather, dt);
		lastNow = now;
	}

	// season: stronger up close, where the ground has less of the tint itself
	const tint = SEASON_TINT[((state.season % 4) + 4) % 4];
	ctx.globalAlpha = 0.6 + 0.4 * detail;
	ctx.fillStyle = tint;
	ctx.fillRect(0, 0, w, h);
	ctx.globalAlpha = 1;

	wash(ctx, w, h, 'rgba(38, 58, 88, 0.2)', weights.rain);
	wash(ctx, w, h, 'rgba(14, 24, 44, 0.34)', weights.storm);
	wash(ctx, w, h, 'rgba(236, 244, 252, 0.17)', weights.snow);
	wash(ctx, w, h, 'rgba(255, 224, 168, 0.16)', weights.drought);
	wash(ctx, w, h, 'rgba(255, 250, 236, 0.09)', weights.drought);
	wash(ctx, w, h, 'rgba(110, 155, 230, 0.15)', weights.cold);

	const density = 0.35 + 0.65 * detail;
	const rainAmount = Math.max(weights.rain * 0.7, weights.storm);
	if (rainAmount > 0.02) drawRain(ctx, w, h, now / 1000, rainAmount, density, weights.storm);
	if (weights.snow > 0.02) drawSnow(ctx, w, h, now / 1000, weights.snow, density, detail);

	if (weights.storm > 0.02) {
		const f = lightningAt(now) * weights.storm;
		if (f > 0.01) wash(ctx, w, h, 'rgba(235, 240, 255, 0.22)', f);
	}

	if (detail > 0.02) drawVignette(ctx, w, h, detail);
}

function wash(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, amount: number) {
	if (amount < 0.01) return;
	ctx.globalAlpha = Math.min(1, amount);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, w, h);
	ctx.globalAlpha = 1;
}

function drawRain(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	t: number,
	amount: number,
	density: number,
	storm: number
): void {
	const count = Math.floor((120 + 200 * storm) * density);
	const wind = 0.22 + storm * 0.2;
	ctx.strokeStyle = 'rgba(200, 218, 240, 0.55)';
	ctx.globalAlpha = Math.min(1, amount);
	ctx.lineWidth = 1;
	ctx.lineCap = 'round';
	ctx.beginPath();
	for (let i = 0; i < count; i++) {
		const sx = seeds[i * 4];
		const sy = seeds[i * 4 + 1];
		const sp = 0.75 + seeds[i * 4 + 2] * 0.5;
		const fall = frac1(sy + t * 1.5 * sp);
		const len = 12 + seeds[i * 4 + 3] * 12;
		const x = frac1(sx - fall * wind * 0.4) * (w + 40) - 20;
		const y = fall * (h + 40) - 20;
		ctx.moveTo(x, y);
		ctx.lineTo(x - len * wind, y + len);
	}
	ctx.stroke();
	ctx.globalAlpha = 1;
}

function drawSnow(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	t: number,
	amount: number,
	density: number,
	detail: number
): void {
	const count = Math.floor(MAX_SNOW * density);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
	ctx.globalAlpha = Math.min(1, amount);
	ctx.beginPath();
	for (let i = 0; i < count; i++) {
		const sp = 0.6 + seeds[i * 4 + 2] * 0.8;
		const size = 1.2 + seeds[i * 4 + 3] * (1.2 + detail * 1.2);
		const y = frac1(seeds[i * 4 + 1] + t * 0.07 * sp) * (h + 20) - 10;
		const x =
			frac1(seeds[i * 4]) * w + Math.sin(t * 0.9 * sp + seeds[i * 4 + 3] * 6.28) * (10 + size * 5);
		ctx.rect(x, y, size, size);
	}
	ctx.fill();
	ctx.globalAlpha = 1;
}

const frac1 = (v: number) => v - Math.floor(v);

// A very soft darkening toward the corners, only when close up. The gradient
// is made once per screen size.
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, detail: number): void {
	const key = `${w}x${h}`;
	if (!vignette || key !== vignetteKey || ctx !== vignetteCtx) {
		const r = Math.hypot(w, h) / 2;
		vignette = ctx.createRadialGradient(w / 2, h / 2, r * 0.55, w / 2, h / 2, r);
		vignette.addColorStop(0, 'rgba(10, 14, 20, 0)');
		vignette.addColorStop(1, 'rgba(10, 14, 20, 1)');
		vignetteKey = key;
		vignetteCtx = ctx;
	}
	ctx.globalAlpha = 0.22 * detail;
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, w, h);
	ctx.globalAlpha = 1;
}
