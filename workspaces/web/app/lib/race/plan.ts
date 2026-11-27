import { curvature, SPAN } from './line';
import type { Track } from './track';

// What a driver plans, a few seconds of road ahead: the path the car is going
// to take, as how far across the road it will be at each track sample, and
// from that the speed it can hold along it. The racing line's own speeds
// (the pace, in sim.ts) are only right on the racing line: a car going round
// the outside of another, or kept to the inside by one alongside, is on a
// different arc through the bend, tighter or wider, and has to slow for the
// one it is on, early enough to be down to it by the time it gets there.

/** The furthest ahead a plan looks, in track samples. */
export const FAR = 200;
/** The path being planned, as points, with SPAN more at either end to tell how it bends there. */
const xs = new Float64Array(FAR + 2 * SPAN + 1);
const ys = new Float64Array(FAR + 2 * SPAN + 1);

/**
 * Works out the speeds (m/s) at which a car at track sample `from`, doing
 * `speed`, can take the path it means to: `across(k)` is where across the
 * road that is, `k` samples on. They are written to `speeds`, one for each
 * sample from here on, as far as the plan goes, which is as far as the car
 * would take to stop and a little more: how many samples that is, is
 * returned. `limit` is the cornering the car has the grip for (m/s²), and
 * `pace` the speed the racing line takes at each sample, which is what the
 * plan comes down to at its far end, times `fade` for a car with less grip
 * than it had new.
 */
export function speedsAlong(
	track: Track,
	from: number,
	speed: number,
	across: (k: number) => number,
	limit: number,
	pace: Float32Array,
	fade: number,
	speeds: Float32Array
) {
	const { n, step, x, y, nx, ny } = track;
	const reach = Math.min((speed * speed) / (1.5 * limit) + 30, FAR * step);
	const far = Math.min(FAR, Math.max(SPAN, Math.ceil(reach / step)));
	for (let k = -SPAN, i = (from - SPAN + n) % n; k <= far + SPAN; k++, i = i + 1 === n ? 0 : i + 1) {
		const a = across(k);
		xs[k + SPAN] = x[i] + nx[i] * a;
		ys[k + SPAN] = y[i] + ny[i] * a;
	}
	// backwards from the far end, as the pace is worked out (paceFor in sim.ts)
	let v = pace[(from + far) % n] * fade;
	speeds[far] = v;
	for (let k = far - 1; k >= 0; k--) {
		const j = k + SPAN;
		const bend = Math.abs(
			curvature(xs[j - SPAN], ys[j - SPAN], xs[j], ys[j], xs[j + SPAN], ys[j + SPAN])
		);
		const braking = 0.9 * Math.sqrt(Math.max(0, limit * limit - (v * v * bend) ** 2));
		v = Math.min(60, Math.sqrt(limit / Math.max(bend, 1e-4)), Math.sqrt(v * v + 2 * braking * step));
		speeds[k] = v;
	}
	return far;
}

// And what a driver in traffic plans beyond that: which way to go. A few
// times a second each one thinks of a handful of ways it could go: on the
// racing line, as it is going, staying where it is, or down one side or the
// other of the car ahead or alongside. For each it runs the next few seconds
// forward: itself, as fast as that path and its engine allow, and the cars
// around it, each along the path it has said it is taking. A car that will
// be ahead of it on the same piece of road is one to drop in behind. One it
// has got alongside, with room between them, has to leave it that room, and
// it has to leave room for one that has got alongside it: whichever of the
// two then moves over on the other is the one that hits it. It takes the way
// that gets it furthest down the road, and past the most cars, without
// that. So it pulls out to pass where the pass is on, on a straight or up
// the inside into a corner; it backs out of one that will not come off; it
// holds its side of the road with a car beside it; and it does not turn in
// on, or pull out in front of, a car that is there.

/** What a driver needs to know of a car, its own or another, to plan around it. */
export type Mover = {
	x: number;
	y: number;
	sample: number;
	across: number;
	speed: number;
	damage: number;
	power: number;
	limit: number;
	follow: number;
	/** How far beside the racing line the driver is steering now, where it is making for beside it, and the place across the road it is making for instead, if it is (else NaN). */
	offset: number;
	aim: number;
	spot: number;
	pace: Float32Array;
	/** The share of its pace it has the grip for now. */
	fade: number;
	plan: Float32Array;
	planFrom: number;
	planFar: number;
};

/**
 * What a driver decides: where to make for, beside the line (`aim`) or as a
 * place across the road (`spot`, else NaN); and the car to drop in behind
 * (-1 for none), how far down the road from here that will be (m), and how
 * fast that car will be going by then.
 */
export type Thought = {
	aim: number;
	spot: number;
	leader: number;
	leadSpeed: number;
	leadGap: number;
};

/** How many moments ahead a driver runs things forward, and how far apart they are (s). */
const MOMENTS = 12;
const MOMENT = 0.25;
/** The most cars it keeps track of, and ways to go it weighs up. */
const AROUND = 8;
const WAYS = 8;
/** Nearer than this, front to back, two cars are alongside each other; and nearer than this, side to side, they are on the same piece of road (m, between their middles). */
const LEVEL = 4;
const ABREAST = 2.1;
/** And nearer than this, side to side, two cars alongside each other touch. */
const TOUCH = 1.8;
/** A car's length, and how far clear of the one ahead a car on its way out from behind it keeps (m). */
const LENGTH = 4.2;
const CLEARS = 1;
/**
 * What a way to go is worth, in metres of road: what hitting a car costs,
 * and each metre across the road from the way now taken, and each metre off
 * the racing line; and what a place is worth: being past a car rather than
 * behind it, and half that for being alongside it.
 */
const HIT = 60;
/** What each moment alongside a car costs for each metre nearer it than abreast. */
const SQUEEZE = 8;
const SWITCH = 2;
const OFF = 0.2;
const PLACE = 25;
/** How many seconds more, at the speed a way to go ends up at, it is credited with: a car not held up goes on gaining. */
const AFTER = 2;

const who = new Int32Array(AROUND);
const lead = new Float64Array(AROUND);
const theirWay = new Float64Array(AROUND * MOMENTS);
const theirSide = new Float64Array(AROUND * MOMENTS);
const theirSpeed = new Float64Array(AROUND * MOMENTS);
const ways = new Float64Array(WAYS);
const placed = new Uint8Array(WAYS);
const speeds = new Float32Array(FAR + 1);

const hem = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** How hard a car can accelerate at a speed (m/s²), with `tow` of the air ahead of it already moving (0 to 1). */
function pull(car: Mover, v: number, tow: number) {
	const engine = Math.min(11000, car.power / Math.max(v, 8)) * (1 - 0.35 * car.damage);
	return (engine - (30 + 2.2 * (1 - 0.9 * tow) * v) * v) / 1000;
}

/**
 * Thinks for the driver of `cars[me]`, among those of `cars` that `live`
 * says are racing on the track. `clear` is the room a car leaves another
 * beside it, middle to middle, `most` the furthest from the middle of the
 * road a car goes, and `sidle` how fast one moves over (m/s).
 */
export function think(
	track: Track,
	cars: Mover[],
	me: number,
	live: (index: number) => boolean,
	clear: number,
	most: number,
	sidle: number,
	out: Thought
) {
	const car = cars[me];
	const { n, step, line } = track;
	/** How far past its track sample a car is (m). */
	const past = (c: Mover) =>
		(c.x - track.x[c.sample]) * track.tx[c.sample] + (c.y - track.y[c.sample]) * track.ty[c.sample];
	const mine = past(car);
	const speed = Math.max(car.speed, 0);
	const sight = 15 + speed;

	// the cars around, and how far ahead each is
	let count = 0;
	let tow = 0;
	let ahead = -1;
	let beside = -1;
	for (let i = 0; i < cars.length && count < AROUND; i++) {
		if (i === me || !live(i)) continue;
		const other = cars[i];
		const gap =
			(((other.sample - car.sample + n * 1.5) % n) - n / 2) * step + past(other) - mine;
		if (gap < -15 || gap > sight) continue;
		who[count] = i;
		lead[count] = gap;
		if (gap >= LEVEL && (ahead < 0 || gap < lead[ahead])) ahead = count;
		if (Math.abs(gap) < LEVEL && (beside < 0 || Math.abs(gap) < Math.abs(lead[beside])))
			beside = count;
		if (gap > 0 && Math.abs(other.across - car.across) < 2.5) tow = Math.max(tow, 1 - gap / 80);
		count++;
	}
	out.leader = -1;
	out.leadSpeed = 0;
	out.leadGap = 0;
	out.spot = NaN;
	if (!count) {
		out.aim = 0;
		return;
	}

	// where each of them will be, taking the path it is on
	for (let c = 0; c < count; c++) {
		const other = cars[who[c]];
		const on = (other.sample - other.planFrom + n) % n;
		let v = Math.max(other.speed, 0);
		let gone = 0;
		for (let m = 0; m < MOMENTS; m++) {
			const k = Math.round(gone / step);
			const may =
				other.planFar && on + k <= other.planFar
					? other.plan[on + k]
					: other.pace[(other.sample + k) % n] * other.fade;
			v =
				v > may
					? Math.max(may, v - 0.9 * other.limit * MOMENT)
					: Math.min(may, v + pull(other, v, 0) * MOMENT);
			gone += v * MOMENT;
			const over = sidle * (m + 1) * MOMENT;
			const at = (other.sample + Math.round(gone / step)) % n;
			theirWay[c * MOMENTS + m] = lead[c] + gone;
			theirSpeed[c * MOMENTS + m] = v;
			theirSide[c * MOMENTS + m] = Number.isNaN(other.spot)
				? hem(line[at] + other.offset + hem(other.aim - other.offset, -over, over), -most, most)
				: other.across + hem(other.spot - other.across, -over, over);
		}
	}

	// The ways it could go. Beside the racing line: on it, or as far off it
	// as it is making for. Or to a place across the road: the one it is
	// making for, the one it is at, either side of the car ahead, and its
	// own side of one alongside.
	const here = line[car.sample];
	const making = Number.isNaN(car.spot) ? here + car.aim : car.spot;
	let options = 0;
	const offer = (way: number, place: number) => {
		if (place && Math.abs(way) > most) return;
		for (let w = 0; w < options; w++) {
			if (placed[w] === place && Math.abs(ways[w] - way) < 0.4) return;
		}
		if (options === WAYS) return;
		ways[options] = way;
		placed[options++] = place;
	};
	if (Number.isNaN(car.spot)) offer(car.aim, 0);
	else offer(car.spot, 1);
	offer(0, 0);
	offer(hem(car.across, -most, most), 1);
	if (ahead >= 0) {
		const other = cars[who[ahead]];
		offer(other.across + clear, 1);
		offer(other.across - clear, 1);
		// (and as far beside the line as that is, where the line is on its way somewhere)
		const beyond = other.across - line[other.sample];
		offer(beyond + clear, 0);
		offer(beyond - clear, 0);
	}
	if (beside >= 0) {
		const other = cars[who[beside]];
		offer(other.across + (car.across >= other.across ? clear : -clear), 1);
	}

	let best = Infinity;
	const on = (car.sample - car.planFrom + n) % n;
	for (let w = 0; w < options; w++) {
		const way = ways[w];
		const place = placed[w] === 1;
		// the speeds that way can be taken at: the pace, on the line; those
		// already planned, the way it is going; or worked out
		const kind =
			!place && Math.abs(way) < 0.05
				? 0
				: car.planFar && Math.abs(way - (place ? car.spot : car.aim)) < 0.05
					? 1
					: 2;
		let far = 0;
		if (kind === 2) {
			const from = car.sample;
			far = speedsAlong(
				track,
				from,
				speed,
				place ? () => way : (k) => hem(line[(from + k + n) % n] + way, -most, most),
				car.limit * car.fade * car.fade,
				car.pace,
				car.fade,
				speeds
			);
		}
		const across = place ? way : here + way;
		let v = speed;
		let gone = 0;
		let cost = SWITCH * Math.abs(across - making) + OFF * Math.abs(across - here);
		let leader = -1;
		let leadSpeed = 0;
		let leadGap = 0;
		/** The cars it has been alongside with room between them, and those it has hit. */
		let level = 0;
		let struck = 0;
		let side = car.across;
		for (let m = 0; m < MOMENTS; m++) {
			const k = Math.round(gone / step);
			const may =
				kind === 2 && k <= far
					? speeds[k]
					: kind === 1 && on + k <= car.planFar
						? car.plan[on + k]
						: car.pace[(car.sample + k) % n] * car.fade;
			v =
				v > may
					? Math.max(may, v - 0.9 * car.limit * MOMENT)
					: Math.min(may, v + pull(car, v, tow) * MOMENT);
			gone += v * MOMENT;
			const over = sidle * (m + 1) * MOMENT;
			const was = side;
			side = place
				? car.across + hem(way - car.across, -over, over)
				: hem(
						line[(car.sample + Math.round(gone / step)) % n] +
							car.offset +
							hem(way - car.offset, -over, over),
						-most,
						most
					);
			for (let c = 0; c < count; c++) {
				const j = c * MOMENTS + m;
				const bit = 1 << c;
				const gap = theirWay[j] - gone;
				const apart = side - theirSide[j];
				if (Math.abs(apart) >= ABREAST) {
					if (Math.abs(gap) < LEVEL) level |= bit;
					continue;
				}
				if (gap >= LEVEL) {
					// one ahead on this piece of road: no nearer it than it is
					// followed, or on its way out from behind it, than clears it
					const keep = Math.abs(apart) < 1.5 ? car.follow : Math.min(car.follow, LENGTH + CLEARS);
					if (gap < keep) {
						gone = theirWay[j] - keep;
						v = Math.min(v, theirSpeed[j]);
						if (leader < 0) {
							leader = who[c];
							leadSpeed = theirSpeed[j];
							leadGap = Math.max(0, gone);
						}
					}
				} else if (gap > -LEVEL) {
					// One alongside on it. If they were alongside with room, the one
					// that has moved over on the other is the one that has to give
					// it back; if that is the other one, it will.
					if (level & bit) {
						const theirs = theirSide[j] - (m ? theirSide[j - 1] : cars[who[c]].across);
						const closer = apart > 0 ? was - side : side - was;
						const closing = apart > 0 ? theirs : -theirs;
						if (closer <= closing + 0.02) continue;
					}
					// Too near it costs something every moment, the nearer the more,
					// so that of two ways the one that opens the gap is the better;
					// and near enough to touch is a hit.
					cost += SQUEEZE * (ABREAST - Math.abs(apart));
					if (Math.abs(apart) >= TOUCH || struck & bit) continue;
					struck |= bit;
					cost += HIT;
					// (and if there is no way round that, it is the one behind that lifts)
					if (lead[c] > 0 && leader < 0) {
						leader = who[c];
						leadSpeed = theirSpeed[j] - 1;
					}
				}
			}
		}
		cost -= gone + v * AFTER;
		// the places it ends up with: past a car, or alongside it, or behind
		for (let c = 0; c < count; c++) {
			if (struck & (1 << c)) continue;
			const gap = theirWay[c * MOMENTS + MOMENTS - 1] - gone;
			cost -= PLACE * hem((LEVEL - gap) / (2 * LEVEL), 0, 1);
		}
		if (cost < best) {
			best = cost;
			out.aim = place ? 0 : way;
			out.spot = place ? way : NaN;
			out.leader = leader;
			out.leadSpeed = leadSpeed;
			out.leadGap = leadGap;
		}
	}
}
