import { PolygonShape, World } from 'planck';
import { describe, expect, it } from 'vitest';
import { pitsFor } from './pits';
import { LOAD, createRecovery } from './recovery';
import { TRUCK } from './service';
import { DT, HULL, type Car } from './sim';
import { HALF_CORRIDOR, TRACK_IDS, getTrack, lateral, nearest } from './track';

/** Where on the lap the wrecks lie, as metres on from where the way out of the pits joins the track, and how far across. */
const LYING: [number, number][] = [
	[60, 1.5],
	[100, -1],
	[160, 2],
	[220, -1.5],
	[280, 0.5]
];

describe.each(TRACK_IDS)('the tow trucks on the %s, sent for five wrecks at once', (id) => {
	const track = getTrack(id);
	const { n } = track;
	const lane = pitsFor(track);
	const world = new World();

	// Five wrecks, as much of a car as the trucks need: lying where they
	// stopped, each a little askew, and with nobody to drive them.
	const cars = LYING.map(([far, across], index) => {
		const sample = Math.round(lane.merge + far / track.step) % n;
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
	for (const car of cars) recovery.call(car, 0);

	const seen = {
		/** How many times each truck went out. */
		trips: recovery.trucks.map(() => 0),
		/** The most each truck ever had on its bed at once. */
		most: recovery.trucks.map(() => 0),
		/** Whether the track was ever said to be clear, or every wreck away, while one was not. */
		falseClear: 0,
		falseAway: 0,
		time: 0
	};
	const doing = recovery.trucks.map((truck) => truck.doing);
	const done = () =>
		cars.every(
			(car, index) => Math.hypot(car.x - lane.boxes[index].x, car.y - lane.boxes[index].y) < 1
		) && recovery.trucks.every((truck) => truck.doing === 'parked');
	for (let time = 0; time < 900 && !done(); time += DT) {
		recovery.step(time, DT);
		world.step(DT, 8, 3);
		for (const car of cars) {
			const at = car.body.getPosition();
			car.x = at.x;
			car.y = at.y;
			car.angle = car.body.getAngle();
			car.sample = nearest(track, at.x, at.y, car.sample);
			car.across = lateral(track, at.x, at.y, car.sample);
		}
		recovery.sync();
		recovery.trucks.forEach((truck, index) => {
			if (truck.doing === 'out' && doing[index] !== 'out') seen.trips[index]++;
			doing[index] = truck.doing;
			seen.most[index] = Math.max(seen.most[index], truck.load.filter((car) => car >= 0).length);
		});
		// clear: every wreck is on a truck, and off the track
		if (recovery.clear && cars.some((car) => !car.towed || car.across > -HALF_CORRIDOR))
			seen.falseClear++;
		// away: every wreck is at least off the ground
		if (recovery.away && cars.some((car) => !car.towed)) seen.falseAway++;
		seen.time = time;
	}

	it('take two at a time, and never more than the bed holds', () => {
		expect(LOAD).toBe(TRUCK.bed.length);
		expect(LOAD).toBe(2);
		expect(Math.max(...seen.most)).toBe(LOAD);
	});

	it('come back out for the rest, and leave every one in its own box', () => {
		// five wrecks, two trucks, two to a bed: one of them goes out twice
		expect(seen.trips.reduce((a, b) => a + b)).toBe(3);
		expect(Math.max(...seen.trips)).toBe(2);
		expect(done()).toBe(true);
		cars.forEach((car, index) => {
			const box = lane.boxes[index];
			expect(car.towed).toBe(true);
			expect(Math.abs(Math.sin(car.angle - box.angle))).toBeLessThan(0.2);
		});
		// and do it in less time than a race lasts
		expect(seen.time).toBeLessThan(300);
	});

	it('say the track is clear only once every wreck is off it', () => {
		expect(seen.falseAway).toBe(0);
		expect(seen.falseClear).toBe(0);
		expect(recovery.clear).toBe(true);
	});

	it('are each back on a stand of their own at the end, with nothing on', () => {
		const on = recovery.trucks.map((truck) => {
			expect(truck).toMatchObject({ busy: false, towing: -1, load: [-1, -1] });
			return lane.stands.findIndex(
				(stand) => Math.hypot(truck.x - stand.x, truck.y - stand.y) < 0.6
			);
		});
		expect([...on].sort()).toEqual([0, 1]);
	});
});
