import { SPAN } from './line';
import type { Track } from './track';

// What a driver plans, a few seconds of road ahead: the path the car is going
// to take, as how far across the road it will be at each track sample, and
// from that the speed it can hold along it. The racing line's own speeds
// (the pace, in sim.ts) are only right on the racing line: a car going round
// the outside of another, or kept to the inside by one alongside, is on a
// different arc through the bend, tighter or wider, and has to slow for the
// one it is on, early enough to be down to it by the time it gets there.

/** How many samples apart the road can be looked at for a rougher answer sooner: every couple of metres. */
export const roughly = (track: Track) => (track.step < 1.5 ? 2 : 1);

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
 * than it had new. `every` is how many samples apart the path is looked at:
 * 1 for the speeds a car is driven to, or more (a number SPAN is a multiple
 * of) for a rougher answer sooner.
 */
export function speedsAlong(
	track: Track,
	from: number,
	speed: number,
	across: (k: number) => number,
	limit: number,
	pace: Float32Array,
	fade: number,
	speeds: Float32Array,
	every = 1
) {
	const { n, step, x, y, nx, ny } = track;
	const reach = Math.min((speed * speed) / (1.5 * limit) + 30, FAR * step);
	// (a whole number of strides)
	const far = Math.min(FAR, Math.max(SPAN, Math.ceil(reach / step / every) * every));
	for (let k = -SPAN; k <= far + SPAN; k += every) {
		const i = (((from + k) % n) + n) % n;
		const a = across(k);
		xs[k + SPAN] = x[i] + nx[i] * a;
		ys[k + SPAN] = y[i] + ny[i] * a;
	}
	// backwards from the far end, as the pace is worked out (paceFor in sim.ts)
	let v = pace[(from + far) % n] * fade;
	speeds[far] = v;
	const stride = step * every;
	for (let k = far - every; k >= 0; k -= every) {
		const j = k + SPAN;
		// how sharply the circle through the three points bends (as `curvature`
		// in line.ts has it, worked out the quick way: this is done a great deal)
		const ax = xs[j] - xs[j - SPAN];
		const ay = ys[j] - ys[j - SPAN];
		const bx = xs[j + SPAN] - xs[j];
		const by = ys[j + SPAN] - ys[j];
		const cx = ax + bx;
		const cy = ay + by;
		const sides = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by) * (cx * cx + cy * cy));
		const bend = Math.abs(2 * (ax * cy - ay * cx)) / (sides || 1e-9);
		const braking = 0.9 * Math.sqrt(Math.max(0, limit * limit - (v * v * bend) ** 2));
		v = Math.min(60, Math.sqrt(limit / Math.max(bend, 1e-4)), Math.sqrt(v * v + 2 * braking * stride));
		for (let fill = 0; fill < every; fill++) speeds[k + fill] = v;
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
	/**
	 * The driver's nerve: how many moments ahead it runs things forward
	 * before it makes a move (the fewer, the less it sees to put it off), and
	 * how many metres of road it gives to have a go at a car holding it up.
	 */
	foresee: number;
	bold: number;
	/**
	 * The path the driver is taking. Beside the racing line: how far beside
	 * it it is steering now, and how far it is making for. Or to a place
	 * across the road (`spot`, else NaN). Or beside another car (`mate`, an
	 * index into the cars, else -1), on one side of it (`mateSide`, 1 or -1),
	 * wherever that car's own path goes.
	 */
	offset: number;
	aim: number;
	spot: number;
	mate: number;
	mateSide: number;
	pace: Float32Array;
	/** The share of its pace it has the grip for now. */
	fade: number;
	plan: Float32Array;
	planFrom: number;
	planFar: number;
};

/**
 * What a driver decides. Where to make for: beside the line (`aim`), or a
 * place across the road (`spot`, else NaN), or beside a car (`mate`, else
 * -1, and `mateSide`). And the car to drop in behind (-1 for none), how far
 * down the road from here that will be (m), and how fast that car will be
 * going by then.
 */
export type Thought = {
	aim: number;
	spot: number;
	mate: number;
	mateSide: number;
	leader: number;
	leadSpeed: number;
	leadGap: number;
};

/** The most moments ahead a driver runs things forward, and how far apart they are (s). */
const MOMENTS = 12;
const MOMENT = 0.25;
/** The most cars it keeps track of, and ways to go it weighs up. */
const AROUND = 8;
const WAYS = 7;
/** Further ahead than this, front to back, a car is one ahead and not one alongside; and nearer than this, side to side, two cars are on the same piece of road (m, between their middles). */
const LEVEL = 4;
const ABREAST = 2.1;
/** And nearer than this, side to side, two cars alongside each other touch. */
const TOUCH = 1.8;
/** A car's length, and how far clear of the one ahead a car on its way out from behind it keeps (m). */
const LENGTH = 4.2;
const CLEARS = 1;
/** Nearer than this, front to back, two cars' bodies overlap. */
const NOSE = LENGTH + 0.2;
/** Further apart than this, front to back, two cars have nothing to do with each other yet. */
const NEAR = 9;
/**
 * A car this near another, front to back, on the road beside it, has a claim
 * to that road: the other may not move over onto it, ahead of it or not.
 * A length and a bit: a nose up to the other's tail is enough.
 */
const CLAIM = 5.5;
/** Nearer than this, side to side, a car is behind the one ahead and not on its way round it (m). */
const TUCK = 1.5;
/**
 * What a way to go is worth, in metres of road. What hitting a car costs,
 * and moving over in front of one with a claim to the road; each moment
 * alongside a car, for each metre nearer it than abreast; each metre across
 * the road from the way now taken, and each metre off the racing line. What
 * a place is worth: being past a car rather than behind it.
 */
const HIT = 60;
const CUT = 30;
const SQUEEZE = 8;
const SWITCH = 2;
const OFF = 0.2;
const PLACE = 25;
/** And each m/s it is going too fast for a way already. */
const RASH = 10;
/** What being alongside a car is worth, as a share of a place: on the inside for the next bend, and on the outside. And how far ahead that bend is looked for (m). */
const INSIDE = 0.6;
const OUTSIDE = 0.15;
const AHEAD = 150;
/** A driver pulls out from behind a car only where the racing line bends less than this, there (1/m). */
const STRAIGHTS = 0.01;
/** How many seconds more, at the speed a way to go ends up at, it is credited with: a car not held up goes on gaining. */
const AFTER = 2;

const who = new Int32Array(AROUND);
const lead = new Float64Array(AROUND);
const theirWay = new Float64Array(AROUND * MOMENTS);
/** How far off its path each of them is now, and where across the road its path was at the place this car had got to a moment before. */
const offs = new Float64Array(AROUND);
const theirs = new Float64Array(AROUND);
const theirSpeed = new Float64Array(AROUND * MOMENTS);
/** Each way to go: what kind it is (0 beside the line, 1 a place across the road, 2 beside a car), how far or where or on which side, and which car. */
const kinds = new Uint8Array(WAYS);
const ways = new Float64Array(WAYS);
const mates = new Int32Array(WAYS);
const speeds = new Float32Array(FAR + 1);

const hem = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** What is left of how far off its path a car is, once it has moved `over` back towards it. */
const left = (off: number, over: number) => (off > 0 ? Math.max(0, off - over) : Math.min(0, off + over));

/** How hard a car can accelerate at a speed (m/s²), with `tow` of the air ahead of it already moving (0 to 1). */
function pull(car: Mover, v: number, tow: number) {
	const engine = Math.min(11000, car.power / Math.max(v, 8)) * (1 - 0.35 * car.damage);
	return (engine - (30 + 2.2 * (1 - 0.9 * tow) * v) * v) / 1000;
}

/**
 * Where across the road a car's path is at a track sample: beside the car
 * it is keeping beside, if it is, `clear` from that one's own path; or at
 * the place it is making for; or beside the racing line. No further from
 * the middle of the road than `most`.
 */
export function pathOf(
	track: Track,
	cars: Mover[],
	car: Mover,
	at: number,
	clear: number,
	most: number,
	deep = 0
): number {
	if (car.mate >= 0 && deep < 2) {
		const beside = pathOf(track, cars, cars[car.mate], at, clear, most, deep + 1);
		return hem(beside + car.mateSide * clear, -most, most);
	}
	if (!Number.isNaN(car.spot)) return hem(car.spot, -most, most);
	return hem(track.line[at] + car.aim, -most, most);
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
	const moments = Math.min(MOMENTS, Math.max(2, Math.round(car.foresee)));

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
		if (Math.abs(gap) < CLAIM && (beside < 0 || Math.abs(gap) < Math.abs(lead[beside])))
			beside = count;
		if (gap > 0 && Math.abs(other.across - car.across) < 2.5) tow = Math.max(tow, 1 - gap / 80);
		count++;
	}
	out.leader = -1;
	out.leadSpeed = 0;
	out.leadGap = 0;
	out.aim = 0;
	out.spot = NaN;
	out.mate = -1;
	out.mateSide = 0;
	if (!count) return;

	// how far down the road each of them will be, and how fast, taking the
	// path it is on; and how far off that path it is now
	for (let c = 0; c < count; c++) {
		const other = cars[who[c]];
		const on = (other.sample - other.planFrom + n) % n;
		offs[c] = other.across - pathOf(track, cars, other, other.sample, clear, most);
		let v = Math.max(other.speed, 0);
		let gone = 0;
		for (let m = 0; m < moments; m++) {
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
			theirWay[c * MOMENTS + m] = lead[c] + gone;
			theirSpeed[c * MOMENTS + m] = v;
		}
	}

	// The ways it could go: as it is going; on the racing line; staying
	// where it is on the road, or as far beside the line as it is, whichever
	// is the quicker there; down either side of the car ahead; and its own
	// side of one alongside. Beside a car is beside it wherever that
	// car's path goes, which is not a place on the road for long.
	const here = line[car.sample];
	/** Where across the road a way to go is, at a track sample. */
	const lane = (kind: number, way: number, mate: number, at: number) =>
		kind === 0
			? hem(line[at] + way, -most, most)
			: kind === 1
				? way
				: hem(pathOf(track, cars, cars[mate], at, clear, most) + way * clear, -most, most);
	let options = 0;
	const offer = (kind: number, way: number, mate: number) => {
		for (let w = 0; w < options; w++) {
			if (kinds[w] === kind && mates[w] === mate && Math.abs(ways[w] - way) < 0.4) return;
		}
		if (options === WAYS) return;
		// (beside a car is no way to go where the road runs out beside it)
		if (kind === 2) {
			const theirs = pathOf(track, cars, cars[mate], cars[mate].sample, clear, most);
			if (Math.abs(theirs + way * clear) > most + 0.4) return;
		}
		kinds[options] = kind;
		ways[options] = way;
		mates[options++] = mate;
	};
	const around = (index: number) => {
		for (let c = 0; c < count; c++) if (who[c] === index) return true;
		return false;
	};
	if (car.mate >= 0 && around(car.mate)) offer(2, car.mateSide, car.mate);
	else if (!Number.isNaN(car.spot)) offer(1, hem(car.spot, -most, most), -1);
	else offer(0, car.aim, -1);
	const mine0 = options;
	offer(0, 0, -1);
	offer(1, hem(car.across, -most, most), -1);
	offer(0, hem(car.across, -most, most) - here, -1);
	/** Which of the ways are ways round the car ahead, and what having a go at it is worth, held up behind it on a straight. */
	const plain = options;
	let go = 0;
	if (ahead >= 0) {
		const other = cars[who[ahead]];
		if (
			Math.abs(car.across - other.across) < 1.5 &&
			lead[ahead] < car.follow + 8 + 1.5 * Math.max(0, speed - other.speed) &&
			track.bend[other.sample] < 0.01
		) {
			go = car.bold;
		}
		// A driver pulls out from behind a car where the road is straight,
		// or all but: in a bend the only quick way through is the one the car
		// ahead is on, and a car that leaves it there only drops back from the
		// one it is after. (One that is out already may stay out: that is the
		// way it is going.)
		if (track.bend[other.sample] < STRAIGHTS) {
			offer(2, 1, who[ahead]);
			offer(2, -1, who[ahead]);
		}
	}
	const round = options;
	if (beside >= 0) {
		const other = cars[who[beside]];
		offer(2, car.across >= other.across ? 1 : -1, who[beside]);
	}

	let best = Infinity;
	// (weighing up a way to go, the road is looked at every couple of metres)
	const rough = roughly(track);
	const on = (car.sample - car.planFrom + n) % n;
	const making = pathOf(track, cars, car, car.sample, clear, most);
	for (let w = 0; w < options; w++) {
		const kind = kinds[w];
		const way = ways[w];
		const mate = mates[w];
		// the speeds that way can be taken at: the pace, on the line; those
		// already planned, the way it is going; or worked out
		const from = car.sample;
		const paced = kind === 0 && Math.abs(way) < 0.05;
		const planned = !paced && w < mine0 && car.planFar > 0;
		let far = 0;
		if (!paced && !planned) {
			far = speedsAlong(
				track,
				from,
				speed,
				(k) => lane(kind, way, mate, (from + k + n) % n),
				car.limit * car.fade * car.fade,
				car.pace,
				car.fade,
				speeds,
				rough
			);
		}
		const across = lane(kind, way, mate, from);
		const off = car.across - across;
		let v = speed;
		let gone = 0;
		let cost = SWITCH * Math.abs(across - making) + OFF * Math.abs(across - here);
		if (w >= plain && w < round) cost -= go;
		// (a way it is going too fast for already is one it would run wide on)
		const first = paced
			? car.pace[from] * car.fade
			: planned
				? car.plan[Math.min(on, car.planFar)]
				: speeds[0];
		if (speed > first + 1.5) cost += RASH * (speed - first - 1.5);
		let leader = -1;
		let leadSpeed = 0;
		let leadGap = 0;
		/** The cars it has been alongside with room between them, those it has hit, and those it has cut in on. */
		let level = 0;
		let struck = 0;
		let cut = 0;
		let side = car.across;
		/** Which way the road next bends from where this way ends up (as `turn` is counted), or 0 if it does not for a while, or 2 until that is looked for. */
		let bends = 2;
		for (let c = 0; c < count; c++) {
			theirs[c] = pathOf(track, cars, cars[who[c]], from, clear, most) + offs[c];
		}
		for (let m = 0; m < moments; m++) {
			const k = Math.round(gone / step);
			const may = paced
				? car.pace[(from + k) % n] * car.fade
				: planned
					? on + k <= car.planFar
						? car.plan[on + k]
						: car.pace[(from + k) % n] * car.fade
					: k <= far
						? speeds[k]
						: car.pace[(from + k) % n] * car.fade;
			v =
				v > may
					? Math.max(may, v - 0.9 * car.limit * MOMENT)
					: Math.min(may, v + pull(car, v, tow) * MOMENT);
			gone += v * MOMENT;
			const was = side;
			side =
				lane(kind, way, mate, (from + Math.round(gone / step)) % n) +
				left(off, sidle * (m + 1) * MOMENT);
			const at = (from + Math.round(gone / step)) % n;
			const over = sidle * (m + 1) * MOMENT;
			for (let c = 0; c < count; c++) {
				const j = c * MOMENTS + m;
				const bit = 1 << c;
				const gap = theirWay[j] - gone;
				// Where across the road the other one's path is, here: two cars a
				// few metres apart down a road the racing line is swinging across
				// are not side by side for being at different places across it.
				const before = theirs[c];
				const beside = pathOf(track, cars, cars[who[c]], at, clear, most) + left(offs[c], over);
				theirs[c] = beside;
				if (gap > NEAR || gap < -NEAR) continue;
				const apart = side - beside;
				if (Math.abs(apart) >= ABREAST) {
					if (Math.abs(gap) < CLAIM) level |= bit;
					continue;
				}
				// On the same piece of road. If the two of them were alongside
				// with room between them, or near enough alongside, the one that
				// has moved over on the other is the one that has to give the room
				// back; if that is the other one, it will.
				if (level & bit) {
					const closer = apart > 0 ? was - side : side - was;
					const closing = apart > 0 ? beside - before : before - beside;
					if (closer <= closing + 0.02) continue;
				}
				if (gap >= NOSE) {
					// One ahead on it: no nearer it than it is followed, or on its
					// way out from behind it, than clears it. (Most of the way out
					// from behind it, it goes for the gap.)
					if (Math.abs(apart) >= TUCK) continue;
					const keep =
						Math.abs(apart) < 1.5 ? car.follow : Math.min(car.follow, LENGTH + CLEARS);
					if (gap < keep) {
						gone = theirWay[j] - keep;
						v = Math.min(v, theirSpeed[j]);
						if (leader < 0) {
							leader = who[c];
							leadSpeed = theirSpeed[j];
							leadGap = Math.max(0, gone);
						}
					}
				} else if (gap > -NOSE) {
					// One alongside on it. Too near it costs something every moment,
					// the nearer the more, so that of two ways the one that opens
					// the gap is the better; and near enough to touch is a hit.
					cost += SQUEEZE * (ABREAST - Math.abs(apart));
					if (Math.abs(apart) >= TOUCH || struck & bit) continue;
					struck |= bit;
					cost += HIT;
					// (and if there is no way round that, it is the one behind that lifts)
					if (lead[c] > 0 && leader < 0) {
						leader = who[c];
						leadSpeed = theirSpeed[j] - 1;
					}
				} else if (level & bit && !(cut & bit)) {
					// one it has moved over in front of, that had its nose alongside
					cut |= bit;
					cost += CUT;
				}
			}
		}
		cost -= gone + v * AFTER;
		// The places it ends up with. Past a car is a place gained. Alongside
		// one is most of the way to it on the inside for the next bend, since
		// that is the car that comes out of it ahead, and not much on the
		// outside. Behind one is nothing, however near.
		for (let c = 0; c < count; c++) {
			if (struck & (1 << c)) continue;
			const gap = theirWay[c * MOMENTS + moments - 1] - gone;
			if (gap >= NOSE) continue;
			if (gap <= -NOSE) {
				cost -= PLACE;
				continue;
			}
			if (bends === 2) {
				// which way the road next bends, from where it has got to
				bends = 0;
				const end = (from + Math.round(gone / step)) % n;
				for (let k = 0; k < AHEAD; k += 4) {
					const i = (end + Math.round(k / step)) % n;
					if (track.bend[i] > 0.02) {
						bends = track.turn[i];
						break;
					}
				}
			}
			const inside = (side - theirs[c]) * bends;
			cost -= PLACE * (inside > 0 ? INSIDE : inside < 0 ? OUTSIDE : (INSIDE + OUTSIDE) / 2);
		}
		if (cost < best) {
			best = cost;
			out.aim = kind === 0 ? way : 0;
			out.spot = kind === 1 ? way : NaN;
			out.mate = kind === 2 ? mate : -1;
			out.mateSide = kind === 2 ? way : 0;
			out.leader = leader;
			out.leadSpeed = leadSpeed;
			out.leadGap = leadGap;
		}
	}
}
