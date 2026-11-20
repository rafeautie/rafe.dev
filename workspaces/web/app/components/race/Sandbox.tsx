import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { createRenderer } from '~/lib/race/render';
import { ROSTER, type Entry } from '~/lib/race/roster';
import { createRace, drawGrid, DT, LAPS, LIGHTS, type Race } from '~/lib/race/sim';

// The race on its own, with nothing networked: pick a seed, watch it run, and
// read what every car is doing. This is the bench the physics, the drivers and
// the drawing are tuned on; the betting game is built round the same race.

type Row = {
	entry: Entry;
	grid: number;
	lap: number;
	gap: string;
	kmh: number;
	damage: number;
	best: number;
	status: string;
};

type View = { time: number; done: boolean; rows: Row[]; log: string[] };

const RATES = [1, 2, 4, 8];

function read(race: Race, log: string[]): View {
	const order = race.order();
	const leader = order[0];
	return {
		time: Math.max(0, race.time - LIGHTS),
		done: race.done,
		log: log.slice(-8),
		rows: order.map((car, place) => ({
			entry: car.entry,
			grid: race.cars.indexOf(car) + 1,
			lap: Math.min(LAPS, Math.max(1, car.laps + 1)),
			gap:
				place === 0
					? ''
					: car.finishTime && leader.finishTime
						? `+${(car.finishTime - leader.finishTime).toFixed(2)} s`
						: `+${Math.max(0, leader.progress - car.progress).toFixed(0)} m`,
			kmh: Math.round(Math.abs(car.speed) * 3.6),
			damage: Math.round(car.damage * 100),
			best: car.bestLap,
			status: car.retired ? 'retired' : car.finishTime ? 'finished' : 'racing'
		}))
	};
}

export default function Sandbox() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [seed, setSeed] = useState(1);
	// bumped to run the same seed again
	const [run, setRun] = useState(0);
	const [paused, setPaused] = useState(false);
	const [rate, setRate] = useState(1);
	const [show, setShow] = useState({ line: false, hulls: false });
	const [view, setView] = useState<View | null>(null);
	// what the running loop reads each frame, so changing a control does not
	// restart the race
	const live = useRef({ paused, rate, show, stepOnce: false });
	useEffect(() => {
		live.current = { ...live.current, paused, rate, show };
	}, [paused, rate, show]);

	useEffect(() => {
		const renderer = createRenderer(canvas.current!);
		const race = createRace(seed, drawGrid(seed, ROSTER));
		const log: string[] = [];
		let last = performance.now();
		let owed = 0;
		let shown = 0;
		let frame = requestAnimationFrame(function tick(now) {
			frame = requestAnimationFrame(tick);
			const elapsed = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (!live.current.paused) owed += elapsed * live.current.rate;
			if (live.current.stepOnce) owed = DT;
			live.current.stepOnce = false;

			let stepped = 0;
			for (; owed >= DT && !race.done; owed -= DT, stepped += DT) {
				race.step();
				for (const event of race.events) {
					const car = race.cars[event.car];
					renderer.event(event, car);
					const at = `${Math.max(0, event.time - LIGHTS).toFixed(1)} s  ${car.entry.name}`;
					if (event.kind === 'hit' && event.force > 4) {
						log.push(`${at} hit at ${(event.force * 3.6).toFixed(0)} km/h`);
					} else if (event.kind === 'retire') {
						log.push(`${at} retired`);
					} else if (event.kind === 'finish') {
						log.push(`${at} finished`);
					}
				}
				race.events.length = 0;
			}
			renderer.draw(race.cars, stepped, live.current.show);
			if (now - shown > 150) {
				shown = now;
				setView(read(race, log));
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [seed, run]);

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4">
			<canvas
				ref={canvas}
				className="aspect-video w-full rounded-lg bg-black [image-rendering:pixelated]"
			/>

			<div className="flex flex-wrap items-center gap-2 text-sm">
				<label className="flex items-center gap-2">
					Seed
					<Input
						type="number"
						className="w-24"
						value={seed}
						onChange={(event) => setSeed(Number(event.target.value) || 0)}
					/>
				</label>
				<Button variant="outline" onClick={() => setSeed(seed + 1)}>
					Next seed
				</Button>
				<Button variant="outline" onClick={() => setRun(run + 1)}>
					Restart
				</Button>
				<Button variant="outline" onClick={() => setPaused(!paused)}>
					{paused ? 'Resume' : 'Pause'}
				</Button>
				<Button
					variant="outline"
					disabled={!paused}
					onClick={() => {
						live.current.stepOnce = true;
					}}
				>
					Step
				</Button>
				<div className="flex items-center gap-1">
					{RATES.map((option) => (
						<Button
							key={option}
							variant={option === rate ? 'default' : 'outline'}
							onClick={() => setRate(option)}
						>
							{option}×
						</Button>
					))}
				</div>
				<label className="flex items-center gap-1.5">
					<input
						type="checkbox"
						checked={show.line}
						onChange={(event) => setShow({ ...show, line: event.target.checked })}
					/>
					Racing line
				</label>
				<label className="flex items-center gap-1.5">
					<input
						type="checkbox"
						checked={show.hulls}
						onChange={(event) => setShow({ ...show, hulls: event.target.checked })}
					/>
					Collision corners
				</label>
				{view && (
					<span className="ml-auto text-foreground/60 tabular-nums">
						{view.time.toFixed(1)} s{view.done ? ' · race over' : ''}
					</span>
				)}
			</div>

			{view && (
				<div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
					<table className="w-full text-left text-sm tabular-nums">
						<thead className="text-foreground/50">
							<tr>
								<th className="py-1 font-normal">Pos</th>
								<th className="font-normal">Car</th>
								<th className="font-normal">Grid</th>
								<th className="font-normal">Lap</th>
								<th className="font-normal">Gap</th>
								<th className="font-normal">km/h</th>
								<th className="font-normal">Damage</th>
								<th className="font-normal">Best lap</th>
								<th className="font-normal">Spd / Grip / Aggr / Rel</th>
								<th className="font-normal">Status</th>
							</tr>
						</thead>
						<tbody>
							{view.rows.map((row, place) => (
								<tr key={row.entry.id} className="border-t border-border">
									<td className="py-1">{place + 1}</td>
									<td>
										<span
											className="mr-2 inline-block size-2.5 rounded-xs"
											style={{ background: row.entry.color }}
										/>
										{row.entry.name}
										<span className="text-foreground/50"> #{row.entry.number}</span>
									</td>
									<td>{row.grid}</td>
									<td>
										{row.lap}/{LAPS}
									</td>
									<td>{row.gap}</td>
									<td>{row.kmh}</td>
									<td>{row.damage}%</td>
									<td>{row.best ? `${row.best.toFixed(2)} s` : ''}</td>
									<td className="text-foreground/60">
										{[row.entry.speed, row.entry.grip, row.entry.aggression, row.entry.reliability]
											.map((stat) => Math.round(stat * 100))
											.join(' / ')}
									</td>
									<td className={row.status === 'retired' ? 'text-destructive' : ''}>
										{row.status}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<div className="text-sm">
						<p className="py-1 text-foreground/50">Incidents</p>
						<ul className="border-t border-border pt-1 font-mono text-xs leading-5">
							{view.log.map((line, index) => (
								<li key={index}>{line}</li>
							))}
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}
