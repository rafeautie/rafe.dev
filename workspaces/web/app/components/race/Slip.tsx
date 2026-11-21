import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { MAX_BETS, MARKETS, pays, type Market, type Pools } from '~/lib/race/betting';
import type { Bet, RoomState, Standing, ToRoom } from '~/lib/race/room';
import { ASKS, Label, Returns, SHORT, Tile, chips, entry, label } from './shared';

// The bet slip: a market, a choice in it, a stake, and one button. What the
// choice is, and which market, are kept by the parent because the board
// beside it picks from the same place.

const STAKES = [10, 50, 100];

/** A row of cars to choose one from, for the exacta. */
function Cars({
	title,
	cars,
	chosen,
	off,
	pick
}: {
	title: string;
	cars: string[];
	chosen: string | undefined;
	off?: string;
	pick: (id: string) => void;
}) {
	return (
		<div className="flex items-center gap-2" role="group" aria-label={title}>
			<span className="w-7 text-sm text-muted-foreground">{title}</span>
			<div className="flex flex-1 gap-2">
				{cars.map((id) => (
					<button
						key={id}
						type="button"
						disabled={id === off}
						aria-pressed={id === chosen}
						aria-label={`${title}: ${entry(id).name}`}
						title={entry(id).name}
						onClick={() => pick(id)}
						className={`flex h-8 flex-1 cursor-pointer items-center justify-center rounded-lg transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent ${id === chosen ? 'bg-muted ring-1 ring-foreground/40' : ''}`}
					>
						<Tile id={id} />
					</button>
				))}
			</div>
		</div>
	);
}

export function Slip({
	room,
	pools,
	you,
	bets,
	problem,
	market,
	setMarket,
	outcome,
	setOutcome,
	stake,
	setStake,
	send
}: {
	room: RoomState;
	pools: Pools;
	you: Standing | null;
	bets: Bet[];
	problem: string | null;
	market: Market;
	setMarket: (market: Market) => void;
	outcome: string | null;
	setOutcome: (outcome: string | null) => void;
	stake: number;
	setStake: (stake: number) => void;
	send: (message: ToRoom) => boolean;
}) {
	// what was sent and how many bets there were then, so the reply can be told from silence
	const [sent, setSent] = useState<{
		count: number;
		stake: number;
		market: Market;
		outcome: string;
	} | null>(null);
	const [offline, setOffline] = useState(false);
	const max = you ? you.balance + room.settings.debtCap : 0;
	const [first, second] = outcome?.split('>') ?? [];
	const complete = market === 'exacta' ? second !== undefined : outcome !== null;
	const odds = complete && outcome ? pays(pools[market], market, outcome) : 0;
	// a stake over the credit limit is left for the room to refuse, so the reason shows where it was asked
	const valid = Number.isInteger(stake) && stake >= 1;
	const waiting = sent !== null && bets.length === sent.count && !problem;
	const placed = sent !== null && bets.length > sent.count && !problem;

	const choose = (next: string | null) => {
		setOutcome(next);
		setSent(null);
		setOffline(false);
	};
	const stakeTo = (next: number) => {
		setStake(next);
		setSent(null);
		setOffline(false);
	};

	function place() {
		if (!complete || !outcome || !you) return;
		if (send({ type: 'bet', market, outcome, stake })) {
			setSent({ count: bets.length, stake, market, outcome });
			setOffline(false);
		} else {
			setOffline(true);
		}
	}

	const note = problem
		? { key: problem, text: <>{problem}</>, bad: true }
		: offline
			? { key: 'offline', text: <>Not connected. Reconnecting…</>, bad: true }
			: placed
				? {
						key: `placed ${sent.stake} ${sent.outcome}`,
						text: (
							<>
								Placed {chips(sent.stake)} on <Label market={sent.market} outcome={sent.outcome} />
							</>
						),
						bad: false
					}
				: null;

	return (
		<section
			aria-label="Bet slip"
			className="flex flex-col gap-3 rounded-lg bg-foreground/[0.06] p-3"
		>
			<Tabs
				value={market}
				onValueChange={(next) => {
					setMarket(next as Market);
					choose(null);
				}}
			>
				<TabsList className="grid w-full grid-cols-6">
					{MARKETS.map((m) => (
						<TabsTrigger key={m} value={m} className="min-w-0 px-1 text-xs">
							{SHORT[m]}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			<p className="text-sm text-muted-foreground">{ASKS[market]}</p>

			{market === 'exacta' && (
				<div className="flex flex-col gap-2">
					<Cars
						title="1st"
						cars={room.grid}
						chosen={first}
						pick={(id) => choose(id === first ? null : id)}
					/>
					<Cars
						title="2nd"
						cars={room.grid}
						chosen={second}
						off={first}
						pick={(id) => first && choose(second === id ? first : `${first}>${id}`)}
					/>
				</div>
			)}
			{market === 'clean' && (
				<div className="grid grid-cols-2 gap-2">
					{(['yes', 'no'] as const).map((answer) => (
						<Button
							key={answer}
							variant="outline"
							aria-pressed={outcome === answer}
							className={`justify-between ${outcome === answer ? 'bg-muted ring-1 ring-foreground/40' : ''}`}
							onClick={() => choose(answer)}
						>
							{label('clean', answer)}
							<span className="tabular-nums">{pays(pools.clean, 'clean', answer).toFixed(1)}×</span>
						</Button>
					))}
				</div>
			)}

			<div className="grid grid-cols-[repeat(4,minmax(0,1fr))_5rem] gap-2">
				{STAKES.map((value) => (
					<Button
						key={value}
						variant={stake === value ? 'default' : 'outline'}
						aria-pressed={stake === value}
						className="tabular-nums"
						onClick={() => stakeTo(value)}
					>
						{value}
					</Button>
				))}
				<Button
					variant={stake === max ? 'default' : 'outline'}
					aria-pressed={stake === max}
					disabled={max < 1}
					onClick={() => stakeTo(max)}
				>
					Max
				</Button>
				<Input
					aria-label="Stake in chips"
					className="text-right tabular-nums"
					type="number"
					min={1}
					max={max}
					value={Number.isNaN(stake) ? '' : stake}
					onChange={(event) => stakeTo(Math.floor(Number(event.target.value)))}
				/>
			</div>

			<div className="flex items-baseline justify-between text-sm">
				<span className="text-muted-foreground">
					{complete && outcome ? (
						<Label market={market} outcome={outcome} />
					) : market === 'exacta' ? (
						'Pick 1st, then 2nd'
					) : (
						'Pick from the cars'
					)}
				</span>
				<span className="text-base font-medium tabular-nums">
					{chips(stake || 0)}
					<span className="text-muted-foreground">
						<Returns />
					</span>
					{complete ? chips(Math.floor((stake || 0) * odds)) : '–'}
				</span>
			</div>

			<Button
				size="lg"
				className="h-10 text-base"
				disabled={!complete || !valid || waiting || !you}
				onClick={place}
			>
				{waiting ? 'Placing…' : !complete ? 'Pick a bet' : 'Place bet'}
			</Button>
			<p
				className="min-h-5 text-sm"
				role={note?.bad ? 'alert' : 'status'}
				aria-live={note?.bad ? 'assertive' : 'polite'}
			>
				{note ? (
					<span
						key={note.key + bets.length}
						className={`block motion-safe:animate-in motion-safe:fade-in-0 ${note.bad ? 'text-destructive' : ''}`}
					>
						{note.text}
					</span>
				) : (
					<span className="text-muted-foreground tabular-nums">
						{bets.length} of {MAX_BETS} bets · returns at the current odds
					</span>
				)}
			</p>
		</section>
	);
}
