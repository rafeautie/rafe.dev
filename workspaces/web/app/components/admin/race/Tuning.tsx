import { memo, useState } from 'react';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { resetRaceSettings, saveRaceSettings } from '~/lib/race/admin';
import { ROSTER } from '~/lib/race/roster';
import { DEFAULT_SETTINGS, LIMITS, STATS, type Settings } from '~/lib/race/settings';
import { getTrack, TRACK_IDS, trackName, WORLD_H, WORLD_W, type TrackId } from '~/lib/race/track';
import { cn } from '~/lib/utils';
import { Panel } from '~/components/admin/cards';
import { Car, Table, Heading } from './parts';
import { NUMBER, PERCENT } from '~/lib/admin/format';
import { cell, type Act, type View } from './format';

// The numbers the game runs on, edited here and saved together, from the
// next race on, and the track it is run on. They come in four kinds: the
// race (how long it is, its pits, and how hard a knock hits); the cars
// (how many race, and how each goes), which decide who wins;
// the money, which decides what winning is worth; and the timing of the loop.
// Each car's record sits beside its stats, since that is what a change to
// them is meant to move. The room checks everything again and says what is
// wrong.

type Key = keyof typeof LIMITS;

/** A number as typed, NaN while the box is empty, and back. */
const read = (value: string) => (value === '' ? NaN : Number(value));
const shown = (value: number) => (Number.isNaN(value) ? '' : value);

/** A track's centre line, as an SVG path in its world's metres. */
function outline(id: TrackId) {
	const { n, x, y } = getTrack(id);
	let path = '';
	for (let i = 0; i < n; i += 3) path += `${i ? 'L' : 'M'}${x[i].toFixed(1)} ${y[i].toFixed(1)}`;
	return `${path}Z`;
}
const OUTLINES = new Map<TrackId, string>();
const outlineOf = (id: TrackId) => {
	if (!OUTLINES.has(id)) OUTLINES.set(id, outline(id));
	return OUTLINES.get(id)!;
};

/** What the pits run on, each a whole number. */
const PITS: [Key, string][] = [
	['tank', 'fuel tank, tenths of a lap'],
	['tyreWear', 'tire wear, % of the usual'],
	['pitMph', 'pit lane limit, mph']
];

const GROUPS: { title: string; description: string; fields: [Key, string][] }[] = [
	{
		title: 'pools',
		description: 'how the house opens each market',
		fields: [
			['seed', 'seed, chips per market'],
			['trials', 'practice runs to set the odds']
		]
	},
	{
		title: 'players’ chips',
		description: 'what a player has to bet with',
		fields: [
			['start', 'starting chips'],
			['debtCap', 're-up limit, most a player may owe (0 is off)']
		]
	},
	{
		title: 'timing',
		description: 'how long each phase lasts',
		fields: [
			['bettingSeconds', 'betting, seconds'],
			['resultsSeconds', 'results, seconds']
		]
	}
];

// memo: the page polls every few seconds; its settings and cars rarely move
export const Tuning = memo(function Tuning({
	settings,
	tuned,
	cars,
	busy,
	act
}: {
	settings: Settings;
	tuned: boolean;
	cars: View['history']['cars'];
	busy: boolean;
	act: Act;
}) {
	// a fresh copy whenever the room's change (the key on this), so polling never undoes an edit
	const [draft, setDraft] = useState(settings);
	const [resetting, setResetting] = useState(false);
	const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
	return (
		<div className="@container flex flex-col gap-4">
			<Heading>tuning</Heading>
			<Panel title="track" description="where the races are run">
				<div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
					{TRACK_IDS.map((id) => {
						const chosen = draft.track === id;
						return (
							<button
								key={id}
								type="button"
								aria-pressed={chosen}
								onClick={() => setDraft({ ...draft, track: id })}
								className={cn(
									'flex flex-col gap-2 rounded-md border p-2 text-left transition-colors',
									chosen
										? 'border-foreground bg-foreground/5'
										: 'border-foreground/15 text-foreground/60 hover:border-foreground/40'
								)}
							>
								<svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} className="w-full" aria-hidden>
									<path
										d={outlineOf(id)}
										fill="none"
										stroke="currentColor"
										strokeWidth={9}
										strokeLinejoin="round"
										opacity={chosen ? 0.9 : 0.5}
									/>
								</svg>
								<span className="flex items-baseline justify-between gap-2">
									<span className={cn(chosen && 'text-foreground')}>{trackName(id)}</span>
									{id === DEFAULT_SETTINGS.track && (
										<span className="text-foreground/50">default</span>
									)}
								</span>
							</button>
						);
					})}
				</div>
			</Panel>
			<Panel title="race" description="how long it is, the pits, and the knocks">
				<div className="flex flex-wrap items-start gap-x-6 gap-y-4">
					<Whole
						name="laps"
						label="laps"
						draft={draft}
						settings={settings}
						onChange={setDraft}
						className="w-40"
					/>
					<label className="flex w-40 flex-col gap-1.5">
						<span>pits</span>
						<span className="flex h-8 items-center gap-2">
							<input
								type="checkbox"
								checked={draft.pits}
								onChange={(event) => setDraft({ ...draft, pits: event.target.checked })}
							/>
							{draft.pits ? 'fuel, tires and stops' : 'off: flat out all the way'}
						</span>
						<span className="text-foreground/50">
							<span className={cn(draft.pits !== DEFAULT_SETTINGS.pits && 'text-foreground')}>
								default {DEFAULT_SETTINGS.pits ? 'on' : 'off'}
							</span>
						</span>
					</label>
					{PITS.map(([name, label]) => (
						<Whole
							key={name}
							name={name}
							label={label}
							draft={draft}
							settings={settings}
							onChange={setDraft}
							disabled={!draft.pits}
							className="w-44"
						/>
					))}
					{/* (knocks do damage whether or not there are pits) */}
					<Whole
						name="damage"
						label="knock damage, % of the original"
						draft={draft}
						settings={settings}
						onChange={setDraft}
						className="w-44"
					/>
				</div>
				<p className="mt-4 max-w-2xl text-foreground/50">
					A lap raced burns about one lap of fuel, so a tank smaller than the race means a stop.
					Each crew&rsquo;s speed is its car&rsquo;s crew stat, below.
				</p>
			</Panel>
			<Panel title="cars" description="stats from 0 to 1, and how each car has done" flush>
				<div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-foreground/10 p-4">
					<Whole
						name="count"
						label="cars per race"
						draft={draft}
						settings={settings}
						onChange={setDraft}
						className="w-40"
					/>
					<p className="max-w-sm pb-1 text-foreground/50">
						Each race draws this many of the {ROSTER.length} cars at random, in a random starting
						order.
					</p>
				</div>
				<Table head={['car', ...STATS, 'wins']}>
					{ROSTER.map((car) => {
						const record = cars.find((row) => row.car === car.id);
						return (
							<tr key={car.id}>
								<td className={cell}>
									<Car id={car.id} />
								</td>
								{STATS.map((stat) => {
									const value = draft.cars[car.id][stat];
									return (
										<td key={stat} className={cn(cell, 'px-1.5 py-1')}>
											<Input
												type="number"
												aria-label={`${car.name} ${stat}`}
												min={0}
												max={1}
												step={0.05}
												value={shown(value)}
												onChange={(event) =>
													setDraft({
														...draft,
														cars: {
															...draft.cars,
															[car.id]: { ...draft.cars[car.id], [stat]: read(event.target.value) }
														}
													})
												}
												className={cn(
													'w-16',
													value !== settings.cars[car.id][stat] && 'border-foreground/50'
												)}
											/>
										</td>
									);
								})}
								<td className={cn(cell, 'text-foreground/50 tabular-nums')}>
									{record ? (
										<>
											<span className="text-foreground">{PERCENT.format(record.winRate)}</span> of{' '}
											{NUMBER.format(record.starts)}
										</>
									) : (
										'–'
									)}
								</td>
							</tr>
						);
					})}
				</Table>
			</Panel>

			<div className="grid gap-4 @2xl:grid-cols-3">
				{GROUPS.map((group) => (
					<Panel key={group.title} title={group.title} description={group.description}>
						<div className="flex flex-col gap-4">
							{group.fields.map(([key, label]) => {
								const [low, high] = LIMITS[key];
								return (
									<label key={key} className="flex flex-col gap-1.5">
										<span>{label}</span>
										<Input
											type="number"
											min={low}
											max={high}
											step={1}
											value={shown(draft[key])}
											onChange={(event) => setDraft({ ...draft, [key]: read(event.target.value) })}
											className={cn(draft[key] !== settings[key] && 'border-foreground/50')}
										/>
										<span className="text-foreground/50 tabular-nums">
											{NUMBER.format(low)}–{NUMBER.format(high)},{' '}
											{/* inked when the number has been moved off it */}
											<span
												className={cn(draft[key] !== DEFAULT_SETTINGS[key] && 'text-foreground')}
											>
												default {NUMBER.format(DEFAULT_SETTINGS[key])}
											</span>
										</span>
									</label>
								);
							})}
						</div>
					</Panel>
				))}
			</div>

			{/* stays in view while anything in the section is, so a change is never far from its save */}
			<Card size="sm" className="sticky bottom-4 z-10 shadow-lg">
				<CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
					<span className="flex items-center gap-2 text-foreground/50">
						{dirty ? (
							<span className="text-foreground">unsaved changes</span>
						) : tuned ? (
							<>
								<Badge variant="secondary">Tuned</Badge> saved, in use from the next race
							</>
						) : (
							'the code’s defaults'
						)}
					</span>
					<div className="flex flex-wrap gap-2">
						<Button variant="ghost" disabled={busy || !tuned} onClick={() => setResetting(true)}>
							Reset to defaults
						</Button>
						<Button variant="outline" disabled={busy || !dirty} onClick={() => setDraft(settings)}>
							Discard
						</Button>
						<Button
							disabled={busy || !dirty}
							onClick={() => act(() => saveRaceSettings({ data: { settings: draft } }))}
						>
							Save
						</Button>
					</div>
				</CardContent>
			</Card>
			<ConfirmDialog
				open={resetting}
				onOpenChange={setResetting}
				title="Go back to the defaults?"
				description="The numbers in the code apply again from the next race."
				confirm="Reset to defaults"
				onConfirm={() => act(() => resetRaceSettings())}
			/>
		</div>
	);
});

/** A whole number on its own, with what it may be and what it is by default, as in the groups. */
function Whole({
	name,
	label,
	draft,
	settings,
	onChange,
	disabled,
	className
}: {
	name: Key;
	label: string;
	draft: Settings;
	settings: Settings;
	onChange: (draft: Settings) => void;
	disabled?: boolean;
	className?: string;
}) {
	const [low, high] = LIMITS[name];
	return (
		<label className={cn('flex flex-col gap-1.5', className)}>
			<span>{label}</span>
			<Input
				type="number"
				min={low}
				max={high}
				step={1}
				disabled={disabled}
				value={shown(draft[name])}
				onChange={(event) => onChange({ ...draft, [name]: read(event.target.value) })}
				className={cn(draft[name] !== settings[name] && 'border-foreground/50')}
			/>
			<span className="text-foreground/50 tabular-nums">
				{NUMBER.format(low)}–{NUMBER.format(high)},{' '}
				{/* inked when the number has been moved off it */}
				<span className={cn(draft[name] !== DEFAULT_SETTINGS[name] && 'text-foreground')}>
					default {NUMBER.format(DEFAULT_SETTINGS[name])}
				</span>
			</span>
		</label>
	);
}
