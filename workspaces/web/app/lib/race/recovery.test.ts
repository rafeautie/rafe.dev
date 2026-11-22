import { PolygonShape, World } from 'planck';
import { describe, expect, it } from 'vitest';
import { pitsFor } from './pits';
import { LOAD, createRecovery, type Truck } from './recovery';
import { TRUCK } from './service';
import { DT, HULL, type Car } from './sim';
import { HALF_CORRIDOR, NOSE, TRACK_IDS, getTrack, lateral, nearest, type TrackId } from './track';

/**
 * Wrecks for the trucks to fetch, as much of a car as the trucks need: lying
 * where they stopped, each a little askew, and with nobody to drive them.
 * Each is placed as metres on from where the way out of the pits joins the
 * track, and how far across, and is called in at a time (0 for at once).
 * The trucks are stepped until every wreck is in its box and both trucks
 * are back in the yard, or `most` seconds.
 */
function fetch(id: TrackId, lying: [number, number, number?][], most = 900) {
	const track = getTrack(id);
	const { n } = track;
	const lane = pitsFor(track);
	const world = new World();
	const cars = lying.map(([far, across], index) => {
		const sample = (((Math.round(lane.merge + far / track.step) % n) + n) % n) as number;
		const angle = Math.atan2(track.ty[sample], track.tx[sample]) + 0.3 * (index - 2);
		const body = world.createBody({
			type: 'dynamic',
			position: {
				x: track.x[sample] + track.nx[sample] * across,
				y: track.y[sample] + track.ny[sample] * across
			},
			angle,
			linearDamping: 3,
			angularDamping: 3,
			userData: index
		});
		body.createFixture({
			shape: new PolygonShape(
				HULL.filter((_, k) => k % 2 === 0).map((x, k) => ({ x, y: HULL[2 * k + 1] }))
			),
			density: 1
		});
		const { x, y } = body.getPosition();
		return {
			body,
			x,
			y,
			angle,
			sample,
			across,
			speed: 0,
			retired: true,
			towed: false,
			lane: 0
		} as unknown as Car;
	});

	const recovery = createRecovery(world, cars, track);
	const seen = {
		/** How many times each truck went out, and the most each ever had on its bed at once. */
		trips: recovery.trucks.map(() => 0),
		most: recovery.trucks.map(() => 0),
		/** How long both trucks were out on the track at once, going for wrecks or at work on them. */
		together: 0,
		/** Whether any truck was ever seen backing up, and how far each truck had driven when it lifted each wreck. */
		reversed: recovery.trucks.map(() => false),
		lifts: [] as { truck: number; car: number; driven: number; time: number }[],
		/** How far each truck had driven when it last held at the end of the lane. */
		held: recovery.trucks.map(() => 0),
		driven: recovery.trucks.map(() => 0),
		/** Whether the track was ever said to be clear, or every wreck away, while one was not. */
		falseClear: 0,
		falseAway: 0,
		/** The nearest the two trucks' bodies ever came to overlapping: how far one's corner got inside the other's outline (m), and where. */
		overlap: 0,
		time: 0
	};
	const doing = recovery.trucks.map((truck) => truck.doing as string);
	const at = recovery.trucks.map((truck) => [truck.x, truck.y]);
	const done = () =>
		cars.every(
			(car, index) => Math.hypot(car.x - lane.boxes[index].x, car.y - lane.boxes[index].y) < 1
		) && recovery.trucks.every((truck) => truck.doing === 'parked');
	const called = new Set<number>();
	for (let time = 0; time < most && !done(); time += DT) {
		lying.forEach(([, , when = 0], index) => {
			if (!called.has(index) && time >= when) {
				called.add(index);
				recovery.call(cars[index], time);
			}
		});
		recovery.step(time, DT);
		world.step(DT, 8, 3);
		for (const car of cars) {
			const where = car.body.getPosition();
			car.x = where.x;
			car.y = where.y;
			car.angle = car.body.getAngle();
			car.sample = nearest(track, where.x, where.y, car.sample);
			car.across = lateral(track, where.x, where.y, car.sample);
		}
		recovery.sync();
		recovery.trucks.forEach((truck, index) => {
			seen.driven[index] += Math.hypot(truck.x - at[index][0], truck.y - at[index][1]);
			at[index] = [truck.x, truck.y];
			if (truck.doing === 'out' && doing[index] !== 'out') seen.trips[index]++;
			if (truck.doing === 'held') seen.held[index] = seen.driven[index];
			if (truck.doing === 'reverse') seen.reversed[index] = true;
			if (truck.doing === 'lift' && doing[index] !== 'lift') {
				seen.lifts.push({ truck: index, car: -1, driven: seen.driven[index], time });
			}
			// (which wreck it was is known once it is on the crane)
			const last = seen.lifts.filter((lift) => lift.truck === index).pop();
			if (last && last.car < 0 && truck.towing >= 0) last.car = truck.towing;
			doing[index] = truck.doing;
			seen.most[index] = Math.max(seen.most[index], truck.load.filter((car) => car >= 0).length);
		});
		const out = recovery.trucks.filter(
			(truck) => truck.fetching && truck.across > -HALF_CORRIDOR
		).length;
		if (out === recovery.trucks.length) seen.together += DT;
		const [a, b] = recovery.trucks;
		seen.overlap = Math.max(seen.overlap, overlap(a, b));
		// clear: every wreck called is on a truck, and off the track
		const waiting = cars.filter((_, index) => called.has(index));
		if (
			called.size === cars.length &&
			recovery.clear &&
			waiting.some((car) => !car.towed || car.across > -HALF_CORRIDOR)
		)
			seen.falseClear++;
		// away: every wreck called is at least off the ground
		if (called.size === cars.length && recovery.away && waiting.some((car) => !car.towed))
			seen.falseAway++;
		seen.time = time;
	}
	return { track, lane, cars, recovery, seen, done };
}

/** On each track, two wrecks on a straight, the second some way back from the first, and when it happens. */
const BEHIND: Record<TrackId, [[number, number], [number, number], number]> = {
	circuit: [[305, 2], [272, -1.5], 30],
	oval: [[178, 2], [148, -1.5], 25],
	daytona: [[190, 2], [160, -1.5], 25],
	indianapolis: [[195, 2], [165, -1.5], 25],
	martinsville: [[190, 2], [160, -1.5], 25],
	monza: [[395, 2], [365, -1.5], 25]
};

/** How far a corner of either truck is inside the outline of the other (m), at the most: 0 for not at all. */
function overlap(a: Truck, b: Truck) {
	let most = 0;
	for (const [one, other] of [
		[a, b],
		[b, a]
	]) {
		const [cos, sin] = [Math.cos(one.angle), Math.sin(one.angle)];
		const [oc, os] = [Math.cos(other.angle), Math.sin(other.angle)];
		for (const [fore, side] of [
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1]
		]) {
			const x = one.x + cos * fore * TRUCK.long - sin * side * TRUCK.wide;
			const y = one.y + sin * fore * TRUCK.long + cos * side * TRUCK.wide;
			const [dx, dy] = [x - other.x, y - other.y];
			const along = TRUCK.long - Math.abs(dx * oc + dy * os);
			const across = TRUCK.wide - Math.abs(dy * oc - dx * os);
			if (along > 0 && across > 0) most = Math.max(most, Math.min(along, across));
		}
	}
	return most;
}

describe.each(TRACK_IDS)('the tow trucks on the %s, sent for five wrecks at once', (id) => {
	const { cars, lane, recovery, seen, done } = fetch(id, [
		[60, 1.5],
		[100, -1],
		[160, 2],
		[220, -1.5],
		[280, 0.5]
	]);

	it('take two at a time, and never more than the bed holds', () => {
		expect(LOAD).toBe(TRUCK.bed.length);
		expect(LOAD).toBe(2);
		expect(Math.max(...seen.most)).toBe(LOAD);
	});

	it('go out together, come back out for the rest, and leave every one in its own box', () => {
		// five wrecks, two trucks, two to a bed: both go, and one of them goes out again
		expect(seen.trips.reduce((a, b) => a + b)).toBe(3);
		expect(Math.min(...seen.trips)).toBe(1);
		expect(seen.together).toBeGreaterThan(5);
		expect(done()).toBe(true);
		cars.forEach((car, index) => {
			const box = lane.boxes[index];
			expect(car.towed).toBe(true);
			expect(Math.abs(Math.sin(car.angle - box.angle))).toBeLessThan(0.2);
		});
		// and do it in less time than a race lasts
		expect(seen.time).toBeLessThan(240);
	});

	it('say the track is clear only once every wreck is off it', () => {
		expect(seen.falseAway).toBe(0);
		expect(seen.falseClear).toBe(0);
		expect(recovery.clear).toBe(true);
	});

	it('are each back in the yard at the end, with nothing on, and never one on top of the other', () => {
		expect(seen.overlap).toBe(0);
		const spots = recovery.trucks.map((truck) => {
			expect(truck).toMatchObject({ busy: false, towing: -1, load: [-1, -1] });
			return lane.stands.findIndex(
				(stand) => Math.hypot(truck.x - stand.x, truck.y - stand.y) < 0.6
			);
		});
		// the yard has room for the two of them one behind the other, which is where they end up
		expect([...spots].sort()).toEqual([0, 1]);
	});
});

describe.each(TRACK_IDS)('the tow trucks on the %s', (id) => {
	it('share wrecks spread round the lap between them, both out at once', () => {
		const { seen, done } = fetch(id, [
			[40, 1.5],
			[70, -1],
			[150, 2],
			[190, -1.5]
		]);
		expect(done()).toBe(true);
		// each goes out once, and they are out on the track together
		expect(seen.trips).toEqual([1, 1]);
		expect(seen.together).toBeGreaterThan(5);
		for (const index of [0, 1]) {
			expect(seen.lifts.filter((lift) => lift.truck === index)).toHaveLength(2);
		}
		expect(seen.time).toBeLessThan(120);
	});

	it('back up to a wreck lying just behind the one it has lifted, rather than go round for it', () => {
		// The second is called once the truck is at the first, and it lies a
		// little way back up the road. Both lie on a straight: round a tight
		// bend, backing up swings the front of the truck out off the tarmac,
		// and it does not.
		const [first, second, when] = BEHIND[id];
		const { track, seen, done } = fetch(id, [first, [...second, when]]);
		expect(done()).toBe(true);
		const [one, two] = seen.lifts;
		expect(one.truck).toBe(two.truck);
		expect(seen.reversed[one.truck]).toBe(true);
		// a few metres, not a lap
		expect(two.driven - one.driven).toBeLessThan(track.length / 8);
	});

	it.each([
		[4, -2],
		[8, 1],
		[15, -1],
		[-15, -1]
	])(
		'get to a wreck lying %s m on from where the way out of the pits joins the track without going round for it',
		(far, across) => {
			const { track, seen, done } = fetch(id, [[far, across]]);
			expect(done()).toBe(true);
			const [lift] = seen.lifts;
			expect(lift.driven - seen.held[lift.truck]).toBeLessThan(track.length / 4);
		}
	);

	it('fit a wreck that happens with them out in with the rest, with no trip more for it', () => {
		const { seen, done } = fetch(id, [
			[50, 1.5],
			[120, 2, 10],
			[170, -1]
		]);
		expect(done()).toBe(true);
		expect(seen.lifts).toHaveLength(3);
		expect(seen.trips.reduce((a, b) => a + b)).toBeLessThanOrEqual(2);
		expect(seen.falseAway).toBe(0);
		expect(seen.falseClear).toBe(0);
	});

	it('stand in the yard wherever there is room: the one left moves up, and the other comes back in behind it', () => {
		const { lane, recovery, seen, done } = fetch(id, [[90, 1]]);
		expect(done()).toBe(true);
		// the front one went, and the one behind it moved up to the front of the yard while it was out
		const [lift] = seen.lifts;
		expect(lift.truck).toBe(0);
		expect(seen.trips).toEqual([1, 0]);
		expect(seen.overlap).toBe(0);
		const [front, back] = lane.stands;
		const [went, stayed] = recovery.trucks;
		expect(Math.hypot(stayed.x - front.x, stayed.y - front.y)).toBeLessThan(0.6);
		expect(Math.hypot(went.x - back.x, went.y - back.y)).toBeLessThan(0.6);
		// and with the front of it taken, the room left is at the back
		expect(recovery.spotFor(0)).toBe(lane.yard.back);
	});
});

describe.each(TRACK_IDS)('a tow truck on the %s', (id) => {
	const track = getTrack(id);
	// the stand behind the other, whose truck has nothing behind it
	const { stands } = pitsFor(track);
	const stand = stands[stands.length - 1];
	const world = new World();
	// a car, as heavy as one, driven straight at the back of the truck on it
	const [cos, sin] = [Math.cos(stand.angle), Math.sin(stand.angle)];
	const start = TRUCK.long + 6;
	const body = world.createBody({
		type: 'dynamic',
		position: { x: stand.x - cos * start, y: stand.y - sin * start },
		angle: stand.angle,
		userData: 0
	});
	body.createFixture({
		shape: new PolygonShape(
			HULL.filter((_, k) => k % 2 === 0).map((x, k) => ({ x, y: HULL[2 * k + 1] }))
		),
		density: 1
	});
	body.setMassData({ mass: 1000, center: { x: 0, y: 0 }, I: 1800 });
	body.setLinearVelocity({ x: cos * 10, y: sin * 10 });
	const car = { body, retired: false, towed: false, lane: 0, speed: 10 } as unknown as Car;
	const recovery = createRecovery(world, [car], track);
	const truck = recovery.trucks[stands.length - 1];

	let knock = 0;
	world.on('post-solve', (contact, impulse) => {
		const points = contact.getManifold().pointCount;
		knock = Math.max(
			knock,
			impulse.normalImpulses.slice(0, points).reduce((a, b) => a + b, 0)
		);
	});
	let shoved = 0;
	let nearest = Infinity;
	for (let time = 0; time < 1.5; time += DT) {
		recovery.step(time, DT);
		world.step(DT, 8, 3);
		recovery.sync();
		shoved = Math.max(shoved, Math.hypot(truck.x - stand.x, truck.y - stand.y));
		const at = body.getPosition();
		nearest = Math.min(nearest, (stand.x - at.x) * cos + (stand.y - at.y) * sin);
	}

	it('is solid: a car that runs into it stops at it, and takes the knock', () => {
		// (its middle no nearer the truck's than the two of them end to end)
		expect(nearest).toBeGreaterThan(TRUCK.long + NOSE - 0.3);
		// a knock of most of the 10 m/s it was doing
		expect(knock / 1000).toBeGreaterThan(8);
		const { x, y } = body.getLinearVelocity();
		expect(x * cos + y * sin).toBeLessThan(1);
	});

	it('is hardly moved by it, and is back where it was the moment after', () => {
		expect(shoved).toBeLessThan(0.05);
		expect(Math.hypot(truck.x - stand.x, truck.y - stand.y)).toBeLessThan(0.005);
		expect(truck.doing).toBe('parked');
	});
});
