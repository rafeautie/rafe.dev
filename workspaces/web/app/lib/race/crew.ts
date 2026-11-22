import type { Stop } from './pits';

// A pit box's crew: who does what at a stop, where each of them is from one
// moment to the next, and what they have in their hands. The crews in
// pits.ts decide what a stop is for and how long it takes; this works out
// the jobs that make up that time, so what is drawn (render.ts) is the stop
// as it is run: the fueller works while fuel is going in, the tyre changers
// while the tyres are being changed, and a fumble is someone visibly in
// trouble for as long as it costs.
//
// Everything here is in metres from the middle of the car standing in its
// box: x forward, the way it faces, and y across, towards the lane.

/** What a stop is made of: the seconds each job takes, the seconds lost to a fumble, and the whole of it. */
export type Plan = {
	service: Stop;
	/** Seconds from the car stopping to the fueller stepping away, or 0 if it takes no fuel. */
	fuel: number;
	/** Seconds from the car stopping to its being let down off the jacks, or 0 if it keeps its tyres. */
	tyres: number;
	/** Seconds lost to a fumble, or 0. It befalls the job that takes longer, and makes it that much longer. */
	fumble: number;
	/** The whole stop: the longer job, and the fumble. */
	seconds: number;
};

/**
 * The plan of a stop, from what is being done and how long each part of it
 * takes. Whichever job takes the longer (the tyres, if neither does) takes
 * the whole stop but the fumble, so it ends exactly when the stop does: the
 * two jobs together take longer than either alone, since the crew get in
 * each other's way.
 */
export function planStop(
	service: Stop,
	fuel: number,
	tyres: number,
	fumble: number,
	seconds: number
): Plan {
	const work = Math.max(0, seconds - fumble);
	if (service === 'fuel') return { service, fuel: work, tyres: 0, fumble, seconds };
	if (service === 'tyres') return { service, fuel: 0, tyres: work, fumble, seconds };
	return fuel > tyres
		? { service, fuel: work, tyres: Math.min(tyres, work), fumble, seconds }
		: { service, fuel: Math.min(fuel, work), tyres: work, fumble, seconds };
}

/** Which job a fumble befalls. */
export const fumbled = (plan: Plan) =>
	plan.fumble <= 0 ? null : plan.fuel > plan.tyres ? 'fuel' : 'tyres';

/** How fast the crew run about (m/s), and the furthest one ever has to, so they are always where they need to be in time. */
const RUN = 5;
/** Seconds the fueller takes to get the nozzle on, and off again, at either end of the fuel job. */
const LATCH = 0.45;
/** Seconds the jacks take to lift the car, and to let it down. */
const LIFT = 0.35;
/** How far off the car's path the crew may wait for it as it comes in (m): from this far away they start to get ready. */
const READY_FROM = 26;
const READY_BY = 6;

/** Where a box's things are, and where its people wait, work, and get ready. */
export const KIT = {
	/** The row the crew wait in, and the row behind them that the kit stands in. */
	wait: -2.55,
	kit: -3.45,
	/** The fuel rig: its middle, and how far it runs along the box either side of that. */
	rig: { x: -2.15, y: -3.45, half: 0.6 },
	/** Where the fuel goes in, on the infield side of the car. */
	inlet: { x: -0.2, y: -1.07 },
	/** Where under its nose and tail the jacks lift the car. */
	pads: [2.35, -2.35]
};

/** The four wheels, as the tyre changers count them: infield rear, lane rear, lane front, infield front. */
export const WHEELS = [
	{ x: -1.3, y: -1 },
	{ x: -1.3, y: 1 },
	{ x: 1.3, y: 1 },
	{ x: 1.3, y: -1 }
];

type Point = { x: number; y: number };

export type Role = 'fueller' | 'tyres' | 'jack';

/** One of a crew as they are at a moment. */
export type Member = {
	role: Role;
	x: number;
	y: number;
	/** Hard at it: the gun on a wheel nut, the jack being pumped, the fuel going in. */
	working: boolean;
	/** In trouble: chasing a tyre that has got away, or with fuel all over the place. */
	fumbling: boolean;
	/** What they have in their hands. */
	holding: 'tyre' | 'jack' | 'nozzle' | null;
};

/** A box's crew and kit as they are at a moment. */
export type Scene = {
	people: Member[];
	/** Tyres lying about: those not in anybody's hands, the new ones racked at the back of the box and the old ones put down. */
	tyres: Point[];
	/** The jacks: where each one's pad is, and its handle's end. */
	jacks: { pad: Point; grip: Point }[];
	/** Where the end of the fuel hose is, which runs from the rig. */
	nozzle: Point;
	/** How much fuel has been spilt, 0 to 1. */
	spill: number;
	/** How far the car is up on its jacks, 0 to 1. */
	lifted: number;
};

const at = (x: number, y: number): Point => ({ x, y });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const far = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Seconds it takes to run a way through some points. */
function running(way: Point[]) {
	let total = 0;
	for (let k = 1; k < way.length; k++) total += far(way[k - 1], way[k]);
	return total / RUN;
}

/** Where someone is `t` seconds after setting off along a way through some points, at a run. */
function along(way: Point[], t: number): Point {
	let left = Math.max(0, t) * RUN;
	for (let k = 1; k < way.length; k++) {
		const leg = far(way[k - 1], way[k]);
		if (left <= leg) {
			const share = leg ? left / leg : 1;
			return at(lerp(way[k - 1].x, way[k].x, share), lerp(way[k - 1].y, way[k].y, share));
		}
		left -= leg;
	}
	return way[way.length - 1];
}

/** Where each of the crew waits between stops, along the back of the box: the rear jack, the fueller, the four tyre changers, the front jack. */
const WAITING = {
	jack: [at(-3, KIT.wait), at(3, KIT.wait)],
	fueller: at(-1.6, KIT.wait),
	tyres: [at(-0.7, KIT.wait), at(0.2, KIT.wait), at(1.1, KIT.wait), at(2, KIT.wait)]
};
/** Where each tyre changer's new tyre is racked, right behind them. */
const RACK = WAITING.tyres.map(({ x }) => at(x, KIT.kit));
/** Where each jack lies, behind the one who works it. */
const JACK_REST = WAITING.jack.map(({ x }) => at(x, KIT.kit));

/**
 * Where each of them stands ready as the car comes in: the jacks either end
 * of where it will stop, the front one square in front of it to show it
 * where, the fueller and the infield tyre changers at the car's flank, and
 * the two who change the lane side's tyres at the front corner of the box,
 * where the car will not run them down.
 */
const READY = {
	jack: [at(-3.15, -1.7), at(3.15, 0)],
	fueller: at(KIT.inlet.x, -2.05),
	tyres: [at(-1.3, -2.05), at(2.75, 1.05), at(2.75, 1.8), at(1.3, -2.05)]
};
/** And where they work: the jacks at the car's ends, the fueller at the inlet, a changer at each wheel. */
const WORK = {
	jack: [at(-3.15, 0), at(3.15, 0)],
	fueller: at(KIT.inlet.x, -1.5),
	tyres: WHEELS.map(({ x, y }) => at(x, y * 1.55))
};
/** How each gets from where they stand ready to where they work: the lane side's changers round the car's nose. */
const OUT = {
	jack: [
		[READY.jack[0], WORK.jack[0]],
		[READY.jack[1], WORK.jack[1]]
	],
	fueller: [READY.fueller, WORK.fueller],
	tyres: [
		[READY.tyres[0], WORK.tyres[0]],
		[READY.tyres[1], at(2.45, 1.6), WORK.tyres[1]],
		[READY.tyres[2], WORK.tyres[2]],
		[READY.tyres[3], WORK.tyres[3]]
	]
};
/** How they get back to where they wait, the lane side's changers round the car's tail or nose, whichever is nearer. */
const BACK = {
	jack: [
		[WORK.jack[0], READY.jack[0], WAITING.jack[0]],
		[WORK.jack[1], at(3.15, -1.7), WAITING.jack[1]]
	],
	fueller: [WORK.fueller, READY.fueller, WAITING.fueller],
	tyres: [
		[WORK.tyres[0], READY.tyres[0], WAITING.tyres[0]],
		[WORK.tyres[1], at(-3.15, 1.6), at(-3.15, -1.7), WAITING.tyres[1]],
		[WORK.tyres[2], at(3, 1.6), at(3, -1.7), WAITING.tyres[2]],
		[WORK.tyres[3], READY.tyres[3], WAITING.tyres[3]]
	]
};

/** Which of the four tyre changers a fumble at the tyres befalls. */
export const unlucky = (plan: Plan) => Math.floor(plan.fumble * 100) % 4;

/**
 * The share of the fuel going in a stop that is in, `t` seconds after the
 * car stopped: none until the nozzle is on, then steadily, but for while it
 * is off again after a fumble, until it all is as the nozzle comes off.
 */
export function fuelled(plan: Plan, t: number) {
	if (!plan.fuel) return 0;
	const lost = fumbled(plan) === 'fuel' ? plan.fumble : 0;
	const flowing = Math.max(1e-6, plan.fuel - 2 * LATCH);
	// the nozzle comes off a third of the way through, and it takes the fumble to get it back on
	const slip = LATCH + flowing / 3;
	let run = t - LATCH;
	if (t > slip) run -= clamp(t - slip, 0, lost);
	return clamp(run / flowing, 0, 1);
}

/**
 * The jobs of a stop, as seen `t` seconds after the car stopped: each crew
 * member's part of them, from where they start to when they are done.
 */
function jobs(plan: Plan) {
	const wrong = fumbled(plan);
	const lost = (job: 'fuel' | 'tyres') => (wrong === job ? plan.fumble : 0);
	// The tyres: the jacks go under and lift, the four wheels come off and go
	// on, and the car is let down. Each changer runs to a wheel, has the old
	// tyre off halfway through the time there is, and the new one on by the
	// time the car is to come down; one whose tyre gets away chases it, which
	// takes as long as the fumble costs, and the car stays up until that one
	// is on too.
	const late = lost('tyres');
	const up = Math.min(running(OUT.jack[0]) + LIFT, plan.tyres / 3);
	const ready = Math.max(up, plan.tyres - LIFT);
	const drop = ready + late;
	const down = plan.tyres + late;
	const changers = OUT.tyres.map((way, wheel) => {
		const arrive = Math.min(running(way), ready / 3);
		const extra = wheel === unlucky(plan) ? late : 0;
		const off = lerp(Math.max(arrive, up), ready, 0.5);
		return { way, arrive, off, extra, done: ready + extra };
	});
	// The fuel: the fueller steps up to the inlet, gets the nozzle on, and
	// stands there while it goes in, then has it off and steps back; after a
	// fumble, that much later.
	const fuel = {
		done: plan.fuel + lost('fuel'),
		slip: LATCH + Math.max(1e-6, plan.fuel - 2 * LATCH) / 3
	};
	return { up, drop, down, changers, fuel, lost };
}

/**
 * A box's crew and kit: `t` seconds after the car stopped for `plan`, or
 * with `t` negative, `t` seconds before it stops. While it is on its way
 * in, `coming` says how near it is, 0 (still some way off) to 1 (about to
 * stop), and those who will work on it get ready; with no plan, everyone
 * waits.
 */
export function crewAt(plan: Plan | null, t: number, coming = 0): Scene {
	const people: Member[] = [];
	const tyres: Point[] = [];
	const jacks: Scene['jacks'] = [];
	let nozzle = at(KIT.rig.x + KIT.rig.half, KIT.rig.y);
	let spill = 0;
	let lifted = 0;
	const fuelling = !!plan && plan.fuel > 0;
	const changing = !!plan && plan.tyres > 0;
	/** How far to where they stand ready someone has got, as the car comes in. */
	const readiness = t < 0 ? clamp(coming, 0, 1) : 1;
	const toward = (from: Point, to: Point) =>
		at(lerp(from.x, to.x, readiness), lerp(from.y, to.y, readiness));
	const person = (role: Role, where: Point, more: Partial<Member> = {}) =>
		people.push({ role, ...where, working: false, fumbling: false, holding: null, ...more });

	const job = plan ? jobs(plan) : null;

	// the jacks
	[0, 1].forEach((end) => {
		const rest = JACK_REST[end];
		const pad = at(KIT.pads[end], 0);
		if (!changing || !job) {
			person('jack', WAITING.jack[end]);
			jacks.push({ pad: at(rest.x - 0.3, rest.y), grip: at(rest.x + 0.3, rest.y) });
			return;
		}
		const grip = (where: Point) => at(where.x + (end ? -0.25 : 0.25), where.y);
		if (t < 0) {
			const where = toward(WAITING.jack[end], READY.jack[end]);
			person('jack', where, { holding: 'jack' });
			jacks.push({ pad: at(where.x + (end ? -0.7 : 0.7), where.y), grip: grip(where) });
			return;
		}
		const out = OUT.jack[end];
		const there = running(out);
		if (t < job.down) {
			const where = along(out, t);
			const placed = t >= there;
			person('jack', where, { holding: 'jack', working: placed && (t < job.up || t >= job.drop) });
			jacks.push({
				pad: placed ? pad : at(where.x + (end ? -0.7 : 0.7), where.y),
				grip: grip(where)
			});
			return;
		}
		const back = BACK.jack[end];
		const where = along(back, t - job.down);
		person('jack', where, { holding: t - job.down < running(back) ? 'jack' : null });
		jacks.push(
			t - job.down < running(back)
				? { pad: at(where.x + (end ? -0.7 : 0.7), where.y), grip: grip(where) }
				: { pad: at(rest.x - 0.3, rest.y), grip: at(rest.x + 0.3, rest.y) }
		);
	});
	if (changing && job && t >= 0) {
		// up on the jacks once they are under it, until the last tyre is on
		if (t < job.up) lifted = clamp((t - (job.up - LIFT)) / LIFT, 0, 1);
		else if (t < job.drop) lifted = 1;
		else if (t < job.down) lifted = clamp(1 - (t - job.drop) / LIFT, 0, 1);
	}

	// the fuel
	if (!fuelling || !job) {
		person('fueller', WAITING.fueller);
	} else if (t < 0) {
		const where = toward(WAITING.fueller, READY.fueller);
		person('fueller', where, { holding: 'nozzle' });
		nozzle = where;
	} else if (t < job.fuel.done) {
		const where = along(OUT.fueller, t);
		const wrong = job.lost('fuel');
		const fumbling = wrong > 0 && t >= job.fuel.slip && t < job.fuel.slip + wrong;
		if (fumbling) {
			// the nozzle has come off, and it is everywhere: the fueller wrestles it back
			const wobble = Math.sin((t - job.fuel.slip) * 14) * 0.25;
			const back = at(where.x + wobble, where.y - 0.3);
			person('fueller', back, { holding: 'nozzle', fumbling: true });
			nozzle = at(back.x, back.y + 0.2);
		} else {
			person('fueller', where, {
				holding: 'nozzle',
				working: t >= running(OUT.fueller)
			});
			nozzle = t >= running(OUT.fueller) ? KIT.inlet : where;
		}
		if (wrong > 0 && t >= job.fuel.slip)
			spill = clamp((t - job.fuel.slip) / Math.min(1, wrong), 0, 1);
	} else {
		const back = BACK.fueller;
		const where = along(back, t - job.fuel.done);
		const home = t - job.fuel.done >= running(back);
		person('fueller', where, { holding: home ? null : 'nozzle' });
		if (!home) nozzle = where;
		if (job.lost('fuel') > 0) spill = 1;
	}

	// the tyres
	for (let wheel = 0; wheel < 4; wheel++) {
		const rack = RACK[wheel];
		if (!changing || !job) {
			person('tyres', WAITING.tyres[wheel]);
			tyres.push(rack);
			continue;
		}
		if (t < 0) {
			person('tyres', toward(WAITING.tyres[wheel], READY.tyres[wheel]), { holding: 'tyre' });
			continue;
		}
		const { way, arrive, off, extra, done } = job.changers[wheel];
		const spot = WORK.tyres[wheel];
		/** Beside the changer, where a tyre is put down: along the car, away from its middle. */
		const beside = at(spot.x + Math.sign(spot.x) * 0.75, spot.y);
		if (t < arrive) {
			person('tyres', along(way, t), { holding: 'tyre' });
		} else if (t < off) {
			// the old one coming off: the new one put down beside
			person('tyres', spot, { working: true });
			tyres.push(beside);
		} else if (t < off + extra) {
			// the new tyre has got away, rolling off down the box, and the changer goes after it
			const s = (t - off) / extra;
			const loose = at(
				spot.x + Math.sign(spot.x) * lerp(0.75, 2.4, Math.min(1, s * 2.2)),
				spot.y + Math.sign(spot.y) * lerp(0, 0.35, Math.min(1, s * 2.2))
			);
			const chase = s < 0.75 ? Math.min(1, s / 0.6) : 1 - (s - 0.75) / 0.25;
			const where = at(lerp(spot.x, loose.x, chase), lerp(spot.y, loose.y, chase));
			person('tyres', where, { fumbling: true, holding: s >= 0.75 ? 'tyre' : null });
			if (s < 0.75) tyres.push(loose);
			// and the old one where it was put down
			tyres.push(at(spot.x - Math.sign(spot.x) * 0.1, spot.y + Math.sign(spot.y) * 0.75));
		} else if (t < done) {
			// the new one going on, the old one lying beside
			person('tyres', spot, { working: true });
			tyres.push(beside);
		} else {
			const back = BACK.tyres[wheel];
			const home = t - done >= running(back);
			person('tyres', along(back, t - done), { holding: home ? null : 'tyre' });
			if (home) tyres.push(rack);
		}
	}
	return { people, tyres, jacks, nozzle, spill, lifted };
}

/** How near a car on its way to its box is to stopping, 0 to 1, from how far off it is (m). */
export const nearing = (distance: number) =>
	clamp((READY_FROM - distance) / (READY_FROM - READY_BY), 0, 1);

/** The longest anyone takes to get back to where they wait once their job is done. */
export const HOMEWARD = Math.max(
	...[...BACK.jack, BACK.fueller, ...BACK.tyres].map((way) => running(way))
);
