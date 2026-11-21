import { useState } from 'react';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { resetRaceSettings, saveRaceSettings } from '~/lib/race/admin';
import { ROSTER } from '~/lib/race/roster';
import { DEFAULT_SETTINGS, LIMITS, STATS, type Settings } from '~/lib/race/settings';
import { cn } from '~/lib/utils';
import { Car, Panel, Table, Heading } from './parts';
import { cell, NUMBER, PERCENT, type Act, type View } from './format';

// The numbers the game runs on, edited here and saved together, from the
// next race on. They come in three kinds: the cars, which decide who wins;
// the money, which decides what winning is worth; and the timing of the loop.
// Each car's record sits beside its stats, since that is what a change to
// them is meant to move. The room checks everything again and says what is
// wrong.

type Key = keyof typeof LIMITS;

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
			['debtCap', 'debt cap']
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

export function Tuning({
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
	const read = (value: string) => (value === '' ? NaN : Number(value));
	const shown = (value: number) => (Number.isNaN(value) ? '' : value);
	return (
		<div className="@container flex flex-col gap-4">
			<Heading>tuning</Heading>
			<Panel title="cars" description="stats from 0 to 1, and how each car has done" flush>
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
}
