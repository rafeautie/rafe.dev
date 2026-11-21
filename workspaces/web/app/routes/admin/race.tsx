import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail, ProblemBadge } from '~/components/admin/AdminHeader';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { NUMBER } from '~/components/admin/stats/format';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { requireAdmin } from '~/lib/admin/guard';
import { timeAgo } from '~/lib/admin/time';
import {
	banRacePlayer,
	getRaceAdmin,
	pauseRace,
	renameRacePlayer,
	resetRacePlayer,
	resetRaceSettings,
	saveRaceSettings,
	voidRace,
	type RaceAdminView
} from '~/lib/race/admin';
import { MARKET_NAMES } from '~/lib/race/betting';
import { CONDITIONS, ROSTER } from '~/lib/race/roster';
import { LIMITS, STATS, type Settings } from '~/lib/race/settings';
import { cn } from '~/lib/utils';

// The race game's back office (lib/race): who plays, the loop of races, the
// numbers it runs on, and the house's books. Everything is the room's word,
// asked for again every few seconds while the page is open.

export const Route = createFileRoute('/admin/race')({
	beforeLoad: requireAdmin,
	loader: () => getRaceAdmin({ data: { search: '' } }),
	component: RacePage
});

const POLL_MS = 3000;

type Player = RaceAdminView['players'][number];

const carName = (id: string) => ROSTER.find((car) => car.id === id)?.name ?? id;
const time = (at: number) => timeAgo(new Date(at).toISOString());

function message(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong';
}

function RacePage() {
	const [view, setView] = useState<RaceAdminView>(Route.useLoaderData());
	// how far the room's clock is ahead of this one, for the time left
	const [skew, setSkew] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [search, setSearch] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [voiding, setVoiding] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const next = await getRaceAdmin({ data: { search } });
			setView(next);
			setSkew(next.loop.now - Date.now());
		} catch (error) {
			setProblem(message(error));
		}
	}, [search]);

	// soon after the search changes, then every few seconds
	useEffect(() => {
		let gone = false;
		let timer = setTimeout(function tick() {
			void refresh().finally(() => {
				if (!gone) timer = setTimeout(tick, POLL_MS);
			});
		}, 250);
		return () => {
			gone = true;
			clearTimeout(timer);
		};
	}, [refresh]);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	async function act(run: () => Promise<unknown>) {
		setProblem(null);
		setBusy(true);
		try {
			await run();
			await refresh();
		} catch (error) {
			setProblem(message(error));
		} finally {
			setBusy(false);
		}
	}

	const { loop } = view;
	const left = Math.max(0, Math.ceil((loop.endsAt - now - skew) / 1000));

	return (
		<div className="mx-auto max-w-4xl">
			<AdminHeader
				path={[
					<Link key="rafe" href="/">
						rafe
					</Link>,
					<Link key="admin" href="/admin">
						admin
					</Link>,
					'race'
				]}
			>
				<Link href="/race">game</Link>
			</AdminHeader>

			<ControlsRail
				status={
					<>
						<span>
							{loop.round ? `race ${loop.round}` : 'no races yet'} · {loop.phase}
							{loop.phase !== 'idle' && <span suppressHydrationWarning> · {left}s left</span>}
						</span>
						{loop.paused && <Badge variant="secondary">Paused</Badge>}
						<ProblemBadge text={problem} onDismiss={() => setProblem(null)} />
					</>
				}
			>
				<Button
					variant="outline"
					disabled={busy}
					onClick={() => act(() => pauseRace({ data: { paused: !loop.paused } }))}
				>
					{loop.paused ? 'Resume' : 'Pause'}
				</Button>
				<Button
					variant="destructive"
					disabled={busy || loop.phase === 'idle' || loop.phase === 'results'}
					onClick={() => setVoiding(true)}
				>
					Void race
				</Button>
			</ControlsRail>
			<ConfirmDialog
				open={voiding}
				onOpenChange={setVoiding}
				title={`Void race ${loop.round}?`}
				description="Every bet on it is handed back and it is marked void. The next race opens, unless the races are paused or nobody is watching."
				confirm="Void race"
				destructive
				onConfirm={() => act(() => voidRace())}
			/>

			<Loop loop={loop} />
			<Players players={view.players} search={search} setSearch={setSearch} busy={busy} act={act} />
			<Tuning key={JSON.stringify(view.settings)} {...view.settings} busy={busy} act={act} />
			<History history={view.history} />
		</div>
	);
}

function Section({
	title,
	aside,
	children
}: {
	title: string;
	aside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="mt-10">
			<div className="flex min-h-10 items-center justify-between gap-4 border-b border-foreground/10 pb-2 text-sm text-foreground/50">
				<h2>{title}</h2>
				{aside}
			</div>
			{children}
		</section>
	);
}

// a table that scrolls sideways on a phone rather than the page
function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm tabular-nums">
				<thead>
					<tr className="text-left text-foreground/50">
						{head.map((cell, i) => (
							<th key={i} className="py-2 pr-4 font-normal whitespace-nowrap">
								{cell}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-foreground/5">{children}</tbody>
			</table>
		</div>
	);
}

const cell = 'py-2 pr-4 whitespace-nowrap';

function Figure({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex flex-col gap-1 py-2.5">
			<span className="text-sm text-foreground/50">{label}</span>
			<span className="text-2xl font-medium tracking-tight tabular-nums">{value}</span>
		</div>
	);
}

function Loop({ loop }: { loop: RaceAdminView['loop'] }) {
	return (
		<Section title="Race loop">
			<div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
				<Figure label="Round" value={loop.round} />
				<Figure label="Phase" value={loop.paused ? `${loop.phase}, paused` : loop.phase} />
				<Figure label="Pages watching" value={loop.viewers} />
				<Figure label="Players watching" value={loop.players} />
			</div>
			{loop.grid.length > 0 && (
				<div className="mt-4 grid gap-x-12 gap-y-6 sm:grid-cols-2">
					<Table
						head={['', 'Car', 'Condition', ...STATS.map((stat) => stat.slice(0, 1).toUpperCase())]}
					>
						{loop.grid.map((car, slot) => (
							<tr key={car.car}>
								<td className={cn(cell, 'text-foreground/50')}>{slot + 1}</td>
								<td className={cell}>{carName(car.car)}</td>
								<td className={cell}>{CONDITIONS[car.condition]?.label ?? car.condition}</td>
								{STATS.map((stat) => (
									<td key={stat} className={cell}>
										{car[stat].toFixed(2)}
									</td>
								))}
							</tr>
						))}
					</Table>
					<Table head={['Market', 'Pool', 'Players staked']}>
						{loop.pools.map((pool) => (
							<tr key={pool.market}>
								<td className={cell}>{MARKET_NAMES[pool.market]}</td>
								<td className={cell}>{NUMBER.format(Math.round(pool.total))}</td>
								<td className={cell}>{NUMBER.format(pool.staked)}</td>
							</tr>
						))}
					</Table>
				</div>
			)}
		</Section>
	);
}

type Act = (run: () => Promise<unknown>) => Promise<void>;

function Players({
	players,
	search,
	setSearch,
	busy,
	act
}: {
	players: Player[];
	search: string;
	setSearch: (search: string) => void;
	busy: boolean;
	act: Act;
}) {
	const [asking, setAsking] = useState<{ kind: 'reset' | 'ban'; player: Player } | null>(null);
	const [renaming, setRenaming] = useState<Player | null>(null);
	const [name, setName] = useState('');
	return (
		<Section
			title="Players"
			aside={
				<Input
					type="search"
					aria-label="Search players by name"
					placeholder="Search names"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="w-48"
				/>
			}
		>
			{players.length ? (
				<Table head={['Name', 'Id', 'Chips', 'Bankrupt', 'Bets', 'Last seen', '']}>
					{players.map((player) => (
						<tr key={player.id} className={cn(player.banned && 'text-foreground/50')}>
							<td className={cell}>
								{player.name}
								{player.banned && (
									<Badge variant="destructive" className="ml-2">
										Banned
									</Badge>
								)}
							</td>
							<td className={cell}>{player.id}</td>
							<td className={cn(cell, player.balance < 0 && 'text-destructive')}>
								{NUMBER.format(player.balance)}
							</td>
							<td className={cell}>{player.bankruptcies}</td>
							<td className={cell}>{NUMBER.format(player.bets)}</td>
							<td className={cell} suppressHydrationWarning>
								{time(player.seen)}
							</td>
							<td className="py-1 text-right whitespace-nowrap">
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => {
										setName(player.name);
										setRenaming(player);
									}}
								>
									Rename
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setAsking({ kind: 'reset', player })}
								>
									Reset chips
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() =>
										player.banned
											? act(() => banRacePlayer({ data: { id: player.id, banned: false } }))
											: setAsking({ kind: 'ban', player })
									}
								>
									{player.banned ? 'Unban' : 'Ban'}
								</Button>
							</td>
						</tr>
					))}
				</Table>
			) : (
				<p className="py-3 text-foreground/50">
					{search ? 'Nobody by that name.' : 'Nobody has played yet.'}
				</p>
			)}

			<ConfirmDialog
				open={asking !== null}
				onOpenChange={(open) => !open && setAsking(null)}
				title={
					asking?.kind === 'ban'
						? `Ban ${asking.player.name}?`
						: `Reset ${asking?.player.name}'s chips?`
				}
				description={
					asking?.kind === 'ban'
						? 'They can still watch, but cannot bet and are left off the leaderboard. Their bets on this race are handed back.'
						: 'Their balance goes back to the starting chips, and the change is recorded.'
				}
				confirm={asking?.kind === 'ban' ? 'Ban' : 'Reset chips'}
				destructive
				onConfirm={() => {
					if (!asking) return;
					const { id } = asking.player;
					void act(() =>
						asking.kind === 'ban'
							? banRacePlayer({ data: { id, banned: true } })
							: resetRacePlayer({ data: { id } })
					);
				}}
			/>
			<Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
				<DialogContent>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							const id = renaming!.id;
							setRenaming(null);
							void act(() => renameRacePlayer({ data: { id, name } }));
						}}
					>
						<DialogHeader>
							<DialogTitle>Rename {renaming?.name}</DialogTitle>
						</DialogHeader>
						<Input
							aria-label="New name"
							value={name}
							maxLength={16}
							onChange={(event) => setName(event.target.value)}
						/>
						<DialogFooter>
							<Button type="submit">Rename</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</Section>
	);
}

const NUMBERS: [keyof typeof LIMITS, string][] = [
	['seed', 'Pool seed, chips per market'],
	['start', 'Starting chips'],
	['debtCap', 'Debt cap'],
	['bettingSeconds', 'Betting, seconds'],
	['resultsSeconds', 'Results, seconds'],
	['trials', 'Practice runs to seed the pools']
];

// Edited here and saved together; the room checks them again and says what is wrong.
function Tuning({
	settings,
	tuned,
	busy,
	act
}: {
	settings: Settings;
	tuned: boolean;
	busy: boolean;
	act: Act;
}) {
	// a fresh copy whenever the room's change (the key on this), so polling never undoes an edit
	const [draft, setDraft] = useState(settings);
	const [resetting, setResetting] = useState(false);
	const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
	const number = (value: string) => (value === '' ? NaN : Number(value));
	return (
		<Section
			title="Tuning, from the next race"
			aside={tuned ? <Badge variant="secondary">Tuned</Badge> : <span>Code defaults</span>}
		>
			<div className="mt-4 grid gap-x-12 gap-y-6 sm:grid-cols-2">
				<Table head={['Car', ...STATS]}>
					{ROSTER.map((car) => (
						<tr key={car.id}>
							<td className={cell}>{car.name}</td>
							{STATS.map((stat) => (
								<td key={stat} className="py-1 pr-2">
									<Input
										type="number"
										aria-label={`${car.name} ${stat}`}
										min={0}
										max={1}
										step={0.05}
										value={Number.isNaN(draft.cars[car.id][stat]) ? '' : draft.cars[car.id][stat]}
										onChange={(event) =>
											setDraft({
												...draft,
												cars: {
													...draft.cars,
													[car.id]: { ...draft.cars[car.id], [stat]: number(event.target.value) }
												}
											})
										}
										className="w-18"
									/>
								</td>
							))}
						</tr>
					))}
				</Table>
				<div className="flex flex-col gap-3 pt-2">
					{NUMBERS.map(([key, label]) => (
						<label key={key} className="flex items-center justify-between gap-4 text-sm">
							<span>
								{label}
								<span className="text-foreground/50">
									{' '}
									{LIMITS[key][0]}–{NUMBER.format(LIMITS[key][1])}
								</span>
							</span>
							<Input
								type="number"
								min={LIMITS[key][0]}
								max={LIMITS[key][1]}
								step={1}
								value={Number.isNaN(draft[key]) ? '' : draft[key]}
								onChange={(event) => setDraft({ ...draft, [key]: number(event.target.value) })}
								className="w-28"
							/>
						</label>
					))}
				</div>
			</div>
			<div className="mt-6 flex flex-wrap justify-end gap-2">
				<Button variant="outline" disabled={busy || !tuned} onClick={() => setResetting(true)}>
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
			<ConfirmDialog
				open={resetting}
				onOpenChange={setResetting}
				title="Go back to the defaults?"
				description="The numbers in the code apply again from the next race."
				confirm="Reset to defaults"
				onConfirm={() => act(() => resetRaceSettings())}
			/>
		</Section>
	);
}

function History({ history }: { history: RaceAdminView['history'] }) {
	const { totals, cars, races } = history;
	return (
		<>
			<Section title="House ledger">
				<div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
					<Figure label="Races run" value={NUMBER.format(totals.run)} />
					<Figure label="Staked" value={NUMBER.format(totals.staked)} />
					<Figure label="Paid out" value={NUMBER.format(totals.paid)} />
					<Figure label="House net" value={NUMBER.format(totals.net)} />
					<Figure label="Given by bankruptcies" value={NUMBER.format(totals.bankruptcies)} />
					<Figure label="Given by resets" value={NUMBER.format(totals.resets)} />
				</div>
			</Section>

			<Section title="Cars">
				{cars.length ? (
					<Table
						head={[
							'Car',
							'Starts',
							'Wins',
							'Win rate',
							'Podiums',
							'First out',
							'Fastest lap',
							'Avg finish'
						]}
					>
						{cars.map((car) => (
							<tr key={car.car}>
								<td className={cell}>{carName(car.car)}</td>
								<td className={cell}>{car.starts}</td>
								<td className={cell}>{car.wins}</td>
								<td className={cell}>{Math.round(car.winRate * 100)}%</td>
								<td className={cell}>{car.podiums}</td>
								<td className={cell}>{car.firstOuts}</td>
								<td className={cell}>{car.fastestLaps}</td>
								<td className={cell}>{car.averagePlace.toFixed(2)}</td>
							</tr>
						))}
					</Table>
				) : (
					<p className="py-3 text-foreground/50">No races run yet.</p>
				)}
			</Section>

			<Section title="Recent races" aside={<span>last {races.length}</span>}>
				{races.length ? (
					<Table
						head={[
							'Race',
							'Started',
							'Grid',
							'Finish',
							'First out',
							'Fastest lap',
							'Staked',
							'Paid',
							'Net'
						]}
					>
						{races.map((race) => (
							<tr key={race.round} className={cn(race.voided && 'text-foreground/50')}>
								<td className={cell}>
									{race.round}
									{race.voided && (
										<Badge variant="secondary" className="ml-2">
											Void
										</Badge>
									)}
								</td>
								<td className={cell} suppressHydrationWarning>
									{time(race.started)}
								</td>
								<td className={cn(cell, 'whitespace-normal')}>
									{race.grid
										.map(
											({ car, condition }) =>
												`${carName(car)}${condition === 'normal' ? '' : ` (${CONDITIONS[condition]?.label ?? condition})`}`
										)
										.join(', ') || '–'}
								</td>
								<td className={cn(cell, 'whitespace-normal')}>
									{race.order.map(carName).join(', ') || '–'}
								</td>
								<td className={cell}>{race.firstOut ? carName(race.firstOut) : '–'}</td>
								<td className={cell}>{race.fastest ? carName(race.fastest) : '–'}</td>
								<td className={cell}>{NUMBER.format(race.staked)}</td>
								<td className={cell}>{NUMBER.format(race.paid)}</td>
								<td className={cn(cell, race.net < 0 && 'text-destructive')}>
									{NUMBER.format(race.net)}
								</td>
							</tr>
						))}
					</Table>
				) : (
					<p className="py-3 text-foreground/50">No races yet.</p>
				)}
			</Section>
		</>
	);
}
