import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
	createReplay,
	pack,
	record,
	type RecordedEvent,
	type Recording,
	type Replay
} from '~/lib/race/recording';
import { createRenderer } from '~/lib/race/render';
import { ROSTER, type Entry } from '~/lib/race/roster';
import { DEFAULT_SETTINGS } from '~/lib/race/settings';
import { LANE } from '~/lib/race/pits';
import { CLASSIC, drawGrid, LIGHTS, rank, RULES, type Flag } from '~/lib/race/sim';
import { FLAGS } from './shared';
import { createSound, type Sound } from '~/lib/race/sound';
import { getTrack, trackName, TRACK_IDS, type TrackId } from '~/lib/race/track';

// The race on its own, with nothing networked: pick a seed, and the whole
// race is run and recorded at once, then played back here the way everyone
// watching will see and hear it. This is the bench the physics, the drivers,
// the drawing and the sound are tuned on.

type Row = {
	entry: Entry;
	grid: number;
	lap: number;
	gap: string;
	kmh: number;
	/** How fast the tyres are sliding sideways, m/s. */
	slide: number;
	damage: number;
	best: number;
	/** Fuel as a share of a full tank and tyre wear, both in per cent. */
	fuel: number;
	wear: number;
	status: string;
};

type View = {
	/** Seconds into the recording, and how long it is. */
	time: number;
	duration: number;
	/** The flag flying, once the lights have gone out. */
	flag: Flag | null;
	/** How many laps the race set out to be, and whether its cars pit. */
	laps: number;
	pits: boolean;
	/** The recording's size once packed, in bytes. */
	size: number;
	/** How loud the sound is, in decibels, when it is on. */
	level?: number;
	rows: Row[];
	log: string[];
};

const RATES = [1, 2, 4, 8];

function describe(event: RecordedEvent, replay: Replay) {
	const when = `${Math.max(0, event.time - LIGHTS).toFixed(1)} s `;
	if (event.kind === 'caution') {
		return `${when} caution, ${event.by === 'wreck' ? 'for a wreck' : 'thrown by hand'}`;
	}
	if (event.kind === 'restart') return `${when} going green, lining up two by two`;
	if (event.kind === 'green') return `${when} green flag`;
	if (event.kind === 'again') return `${when} lap ended under caution, to be run again`;
	const at = `${when} ${replay.cars[event.car].entry.name}`;
	if (event.kind === 'hit') return `${at} hit at ${(event.force * 3.6).toFixed(0)} km/h`;
	if (event.kind === 'pit') {
		return `${at} in its box for ${event.service === 'both' ? 'fuel and tyres' : event.service}`;
	}
	if (event.kind === 'away') {
		return `${at} away after ${event.seconds.toFixed(1)} s${event.slow ? ', fumbled' : ''}`;
	}
	if (event.kind === 'dry') return `${at} out of fuel`;
	return `${at} ${event.kind === 'retire' ? 'retired' : 'finished'}`;
}

function read(recording: Recording, replay: Replay, time: number, size: number): View {
	const order = rank(replay.cars);
	const leader = order[0];
	return {
		time,
		duration: replay.duration,
		flag: time < LIGHTS ? null : replay.flag,
		laps: replay.laps,
		pits: replay.pits,
		size,
		log: recording.events
			.filter((event) => event.time <= time && event.kind !== 'lap')
			.slice(-8)
			.map((event) => describe(event, replay)),
		rows: order.map((car, place) => ({
			entry: car.entry,
			grid: replay.cars.indexOf(car) + 1,
			lap: replay.lap(car),
			gap:
				place === 0
					? ''
					: car.finishTime && leader.finishTime
						? `+${(car.finishTime - leader.finishTime).toFixed(2)} s`
						: `+${Math.max(0, leader.progress - car.progress).toFixed(0)} m`,
			kmh: Math.round(Math.abs(car.speed) * 3.6),
			slide: car.slip,
			damage: Math.round(car.damage * 100),
			best: car.bestLap,
			fuel: Math.round(car.fuel * 100),
			wear: Math.round(car.wear * 100),
			status: car.retired
				? 'retired'
				: car.lane === LANE.box && car.stop
					? `${car.stop.service} ${car.stop.seconds.toFixed(1)} s`
					: car.lane >= LANE.in
						? 'pit lane'
						: car.finishTime
							? 'finished'
							: car.lane === LANE.called
								? 'pitting'
								: 'racing'
		}))
	};
}

export default function Sandbox() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [seed, setSeed] = useState(1);
	const [trackId, setTrackId] = useState<TrackId>(DEFAULT_SETTINGS.track);
	// the race times at which a caution has been thrown by hand
	const [flags, setFlags] = useState<number[]>([]);
	const [paused, setPaused] = useState(false);
	const [rate, setRate] = useState(1);
	const [show, setShow] = useState({ line: false, hulls: false });
	const [sound, setSound] = useState(false);
	// with the pits off, the race as it was before there were any
	const [pits, setPits] = useState(true);
	const [view, setView] = useState<View | null>(null);
	// What the running loop reads each frame, so changing a control does not
	// start the race again. `seekTo` and `stepOnce` are requests it clears.
	// `time` is where the playback has got to, and `resume` where a race run
	// again with one more caution in it picks up.
	const live = useRef({
		paused,
		rate,
		show,
		seekTo: null as number | null,
		stepOnce: false,
		time: 0,
		resume: 0
	});
	const audio = useRef<Sound | null>(null);
	useEffect(() => {
		live.current = { ...live.current, paused, rate, show };
	}, [paused, rate, show]);

	// made on the click that turns it on, as browsers require
	useEffect(() => {
		if (!sound) return;
		const made = createSound(ROSTER.length);
		audio.current = made;
		return () => {
			audio.current = null;
			made.close();
		};
	}, [sound]);

	useEffect(() => {
		const track = getTrack(trackId);
		const renderer = createRenderer(canvas.current!, track);
		const recording = record(
			seed,
			drawGrid(seed, ROSTER, DEFAULT_SETTINGS.count),
			track,
			flags,
			pits ? RULES : CLASSIC
		);
		const replay = createReplay(recording, ROSTER);
		const size = pack(recording).length;
		let time = Math.min(live.current.resume, replay.duration);
		live.current.resume = 0;
		replay.seek(time);
		let last = performance.now();
		let shown = 0;
		let frame = requestAnimationFrame(function tick(now) {
			frame = requestAnimationFrame(tick);
			const elapsed = Math.min(0.1, (now - last) / 1000);
			last = now;
			const { paused, rate, show, seekTo, stepOnce } = live.current;
			live.current.seekTo = null;
			live.current.stepOnce = false;

			let moved = 0;
			if (seekTo !== null) {
				// a jump: the marks on the track belong to another moment
				renderer.reset();
				time = seekTo;
				replay.seek(time);
			} else {
				moved = stepOnce ? 1 / recording.rate : paused ? 0 : elapsed * rate;
				moved = Math.min(moved, replay.duration - time);
				time += moved;
				for (const event of replay.seek(time)) {
					renderer.event(event, replay.cars[event.car]);
					audio.current?.event(event);
				}
			}
			live.current.time = time;
			renderer.draw(replay.cars, moved, show, replay);
			audio.current?.update(replay.cars, track, moved);
			if (now - shown > 150) {
				shown = now;
				setView({ ...read(recording, replay, time, size), level: audio.current?.level() });
			}
		});
		return () => cancelAnimationFrame(frame);
	}, [seed, trackId, flags, pits]);

	/** Another race altogether, with none of the cautions thrown in this one. */
	const race = (next: number) => {
		setFlags([]);
		setSeed(next);
	};

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4">
			<canvas
				ref={canvas}
				className="aspect-video w-full rounded-lg bg-black [image-rendering:pixelated]"
			/>

			{view && (
				<div className="flex items-center gap-3 text-sm tabular-nums">
					<input
						type="range"
						aria-label="Race time"
						className="grow"
						min={0}
						max={view.duration}
						step={0.05}
						value={view.time}
						onChange={(event) => {
							live.current.seekTo = Number(event.target.value);
						}}
					/>
					<span className="w-40 text-right text-foreground/60">
						{Math.max(0, view.time - LIGHTS).toFixed(1)} s
						{view.flag && ` · ${FLAGS[view.flag].toLowerCase()}`}
						{view.time >= view.duration ? ' · race over' : ''}
					</span>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-2 text-sm">
				<label className="flex items-center gap-2">
					Seed
					<Input
						type="number"
						className="w-24"
						value={seed}
						onChange={(event) => race(Number(event.target.value) || 0)}
					/>
				</label>
				<Button variant="outline" onClick={() => race(seed + 1)}>
					Next seed
				</Button>
				<div className="flex items-center gap-1">
					{TRACK_IDS.map((id) => (
						<Button
							key={id}
							variant={id === trackId ? 'default' : 'outline'}
							onClick={() => {
								// another race altogether, with none of this one's cautions
								setFlags([]);
								setTrackId(id);
							}}
						>
							{trackName(id)}
						</Button>
					))}
				</div>
				<Button
					variant="outline"
					disabled={view?.flag !== 'green'}
					onClick={() => {
						// the race is run again with a caution a moment from now, and picked up where it is
						live.current.resume = live.current.time;
						setFlags([...flags, live.current.time + 0.5]);
					}}
				>
					Throw caution
				</Button>
				<Button
					variant="outline"
					onClick={() => {
						live.current.seekTo = 0;
					}}
				>
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
				<Button variant={sound ? 'default' : 'outline'} onClick={() => setSound(!sound)}>
					{sound ? 'Sound on' : 'Sound off'}
				</Button>
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
				<label className="flex items-center gap-1.5">
					<input
						type="checkbox"
						checked={pits}
						onChange={(event) => {
							// another race altogether
							setFlags([]);
							setPits(event.target.checked);
						}}
					/>
					Pits
				</label>
				{view && (
					<span className="ml-auto text-foreground/60 tabular-nums">
						Recording {(view.size / 1000).toFixed(0)} KB
						{view.level !== undefined && ` · sound ${view.level.toFixed(0)} dB`}
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
								<th className="font-normal">Slide m/s</th>
								<th className="font-normal">Damage</th>
								<th className="font-normal">Best lap</th>
								{view.pits && <th className="font-normal">Fuel</th>}
								{view.pits && <th className="font-normal">Tyre wear</th>}
								<th className="font-normal">Spd / Grip / Aggr / Rel / Crew</th>
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
										{row.lap}/{view.laps}
									</td>
									<td>{row.gap}</td>
									<td>{row.kmh}</td>
									<td>{row.slide.toFixed(1)}</td>
									<td>{row.damage}%</td>
									<td>{row.best ? `${row.best.toFixed(2)} s` : ''}</td>
									{view.pits && <td>{row.fuel}%</td>}
									{view.pits && <td>{row.wear}%</td>}
									<td className="text-foreground/60">
										{[
											row.entry.speed,
											row.entry.grip,
											row.entry.aggression,
											row.entry.reliability,
											row.entry.crew
										]
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
