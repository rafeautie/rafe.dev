import type { Stop } from './pits';
import type { ReplayCar, ReplayTruck } from './recording';
import { pitOf } from './telemetry';

// What each car is doing, as one word the timing tower can show beside it and
// the page can say for it: racing, in the pit lane, standing in its box, out
// of the race (and whether a truck has it), or home.

export type Status = 'racing' | 'pit' | 'box' | 'out' | 'tow' | 'home';

/** Whether car `index` is on a truck: on its crane or on its bed. */
export function towed(index: number, trucks: readonly ReplayTruck[]) {
	return trucks.some((truck) => truck.towing === index || truck.load.includes(index));
}

/** What car `index` of the replay's cars is doing. */
export function statusOf(car: ReplayCar, index: number, trucks: readonly ReplayTruck[]): Status {
	if (car.retired) return towed(index, trucks) ? 'tow' : 'out';
	if (car.finishTime > 0) return 'home';
	const pit = pitOf(car.lane);
	if (pit === 'box' && car.stop) return 'box';
	if (pit !== 'track') return 'pit';
	return 'racing';
}

/** What a stop is for, in words. */
const SERVICE: Record<Stop, string> = { fuel: 'fuel', tyres: 'tires', both: 'fuel and tires' };

const percent = (share: number) => `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;

/** What there is to say about a row of the tower. */
export type Row = {
	name: string;
	place: number;
	status: Status;
	/** Whether it is at the top of the tower. */
	leading: boolean;
	/** Seconds behind the leader, if known. */
	gap: number | null;
	/** Its race time at the flag, and behind the winner by how much, once home. */
	finish: { time: number; behind: number | null } | null;
	stop: { service: Stop; seconds: number } | null;
	/** Shares of a full tank and of new tyres, in a race with pits. */
	supplies: { fuel: number; tyres: number } | null;
};

/** A row of the tower said in words, for a screen reader: everything the row shows. */
export function describeRow(row: Row) {
	const parts = [`${row.name}, place ${row.place}`];
	switch (row.status) {
		case 'out':
			parts.push('retired');
			break;
		case 'tow':
			parts.push('retired, being towed');
			break;
		case 'home': {
			const finish = row.finish;
			if (!finish) parts.push('finished');
			else if (finish.behind === null) parts.push(`finished in ${finish.time.toFixed(2)} s`);
			else parts.push(`finished ${finish.behind.toFixed(2)} s behind the winner`);
			break;
		}
		case 'box':
			parts.push(
				row.stop
					? `in its box: ${SERVICE[row.stop.service]}, ${row.stop.seconds.toFixed(1)} s`
					: 'in its box'
			);
			break;
		case 'pit':
			parts.push('in the pit lane');
			break;
		default:
			if (row.leading) parts.push('leading');
			else if (row.gap !== null) parts.push(`${row.gap.toFixed(1)} s behind the leader`);
	}
	const running = row.status !== 'out' && row.status !== 'tow' && row.status !== 'home';
	if (row.supplies && running) {
		parts.push(`fuel ${percent(row.supplies.fuel)}, tires ${percent(row.supplies.tyres)}`);
	}
	return parts.join(', ');
}
