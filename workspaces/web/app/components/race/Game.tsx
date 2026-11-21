import { Volume2Icon, VolumeXIcon } from 'lucide-react';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
	type RefObject
} from 'react';
import { Dialog, DialogTrigger } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { MARKET_NAMES, MARKETS, pays, type Market, type Pools } from '~/lib/race/betting';
import type { Painter } from '~/lib/race/pixels';
import type { Replay } from '~/lib/race/recording';
import type { CarView } from '~/lib/race/render';
import type { Bet, RoomState, Standing, ToRoom } from '~/lib/race/room';
import { CONDITIONS } from '~/lib/race/roster';
import { DEFAULT_SETTINGS } from '~/lib/race/settings';
import { Bar, PAGE, iconButton } from './Bar';
import {
	BOARD_ROWS,
	TICKS,
	LEGEND,
	STAKES,
	createHud,
	layout,
	netOf,
	type Box,
	type Menu,
	type Slip,
	type View
} from './hud';
import { Settings } from './Settings';
import {
	chips,
	entry,
	ghost,
	hit,
	holding,
	label,
	signed,
	useSelection,
	type Running,
	type Tick
} from './shared';

// The game around the race. It is a broadcast: the race fills the window, and
// everything about the game is a graphic on it, drawn in the race's own pixels
// (hud.ts). This file keeps what is being bet, hands the graphics what to
// show, and lays a real, unseen control over each one that can be used, so the
// picture is also a page: every button can be clicked, tabbed to and read out.
//
// Principles it is built to, for this spectator betting game (one shared race
// every ~2 minutes: 45 s betting, ~65 s race, 15 s results). Keep to them when
// changing anything here.
//
//  1. One job per phase. Betting: the slip, over the middle of the track,
//     with the cars and what they pay. Racing: the track and the timing
//     tower. Results: your net, then what settled the bets. Whatever is not
//     that job is quiet, at the edges.
//  2. One primary action, and it is always one button: Place bet. It is the
//     only gold button there is.
//  3. Glanceable in a second during the race. Names not paragraphs, a gap for
//     every car, motion only where something moved (rows slide on a pass).
//  4. Fixed regions. The tower, the leaderboard and everybody's bets are down
//     the left; your chips and your bets down the right; the phase has the
//     middle. Phases change what is inside a region, never where the regions
//     are, so the eye learns where to look and nothing jumps.
//  5. Every action is answered at the place it was made: a bet shows "Placed
//     ..." under the button and a new row in your bets; a refusal shows its
//     reason in the same line, which has room reserved so nothing shifts.
//  6. Every outcome is answered too: balances glide, odds glide, and the
//     result is one signed number, "+111" or "-50", before any detail.
//  7. The countdown is a number and a thin bar. It changes character in the
//     last ten seconds (colour and "last call"), not by flashing or shaking:
//     urgency without anxiety.
//  8. Numbers are grouped and signed, with a real minus sign, and every digit
//     is the same width, so they do not shift as they change.
//  9. Colour is a car's identity, never its only one: each car also has its
//     number on its tile and its name beside it. Good and bad are told by
//     words and signs as well as by colour ("In", "+", "-"). Gold is yours.
// 10. Restraint. One font, one panel colour, a handful of inks. Nothing on
//     the picture competes with the race.
// 11. Keyboard first-class: every control drawn has a real button or input
//     over it with a visible focus ring; the markets take arrow keys; dialogs
//     trap focus. Status and refusals are announced through live regions, and
//     what the picture says is also there as text for a screen reader.
// 12. Respect prefers-reduced-motion: gliding numbers jump and rows stop
//     sliding.

/** Draws the graphics over the race: Live calls it with each frame. */
export type Paint = (painter: Painter, cars: CarView[], replay: Replay | null, dt: number) => void;

type Props = {
	room: RoomState | null;
	left: number;
	pools: Pools | null;
	you: Standing | null;
	bets: Bet[];
	board: Standing[];
	ticker: Tick[];
	problem: string | null;
	running: Running | null;
	sound: boolean;
	setSound: (on: boolean) => void;
	send: (message: ToRoom) => boolean;
	/** The frame the race is drawn in, and the space on the page it is fitted to. */
	view: View;
	stage: RefObject<HTMLDivElement | null>;
	/** Takes the latest way to draw the graphics, for Live to call with each frame. */
	setPaint: (paint: Paint) => void;
	/** The race itself. */
	children: ReactNode;
};

// Same size, shape and hover as the theme toggle beside it.
function SoundToggle({ sound, setSound }: { sound: boolean; setSound: (on: boolean) => void }) {
	const Icon = sound ? Volume2Icon : VolumeXIcon;
	return (
		<button
			type="button"
			aria-label={sound ? 'Turn sound off' : 'Turn sound on'}
			aria-pressed={sound}
			onClick={() => setSound(!sound)}
			className={iconButton}
		>
			<Icon aria-hidden="true" strokeWidth={2} className="size-[18px]" />
		</button>
	);
}

// A list drawn on the race that is longer than its panel. This is a real
// scrolling box laid over it, empty to the eye and as long inside as the list
// is, so the wheel, a finger and the keyboard all scroll it as they would
// anything; how far it has gone is what the graphics draw from. What the list
// says is inside it as text.
function Scroller({
	label,
	rows,
	visible,
	style,
	onScroll,
	children
}: {
	label: string;
	rows: number;
	visible: number;
	style: CSSProperties;
	/** Told how far down it is, 0 at the top to 1 at the end. */
	onScroll: (by: number) => void;
	children: ReactNode;
}) {
	return (
		<div
			role="region"
			aria-label={label}
			tabIndex={0}
			onScroll={({ currentTarget: box }) => {
				const most = box.scrollHeight - box.clientHeight;
				onScroll(most > 0 ? Math.min(1, box.scrollTop / most) : 0);
			}}
			className="absolute [scrollbar-width:none] overflow-y-auto focus-visible:outline-2 focus-visible:outline-white [&::-webkit-scrollbar]:hidden"
			style={style}
		>
			<div className="sr-only">{children}</div>
			<div style={{ height: `${Math.max(1, rows / visible) * 100}%` }} />
		</div>
	);
}

export function Game({
	room,
	left,
	pools,
	you,
	bets,
	board,
	ticker,
	problem,
	running,
	sound,
	setSound,
	send,
	view,
	stage,
	setPaint,
	children
}: Props) {
	const [hud] = useState(createHud);
	const [market, setMarket] = useState<Market>('win');
	const [outcome, setOutcome] = useState<string | null>(null);
	const [stake, setStake] = useState(50);
	const [typing, setTyping] = useState(false);
	const [field, selection] = useSelection();
	const [legend, setLegend] = useState(false);
	const [scroll, setScroll] = useState({ board: 0, ticker: 0 });
	// how far the panels are scrolled up their pane, in the graphics' pixels
	const [pan, setPan] = useState(0);
	// what was sent and how many bets there were then, so the reply can be told from silence
	const [sent, setSent] = useState<{
		count: number;
		stake: number;
		market: Market;
		outcome: string;
	} | null>(null);
	const [offline, setOffline] = useState(false);
	// the settings as they stand while they are open, left here by the dialog
	const menu = useRef<Menu | null>(null);
	const showMenu = useCallback((next: Menu | null) => {
		menu.current = next;
	}, []);
	// where the dialog is put, so it lies over the race like the other controls
	const [frame, setFrame] = useState<HTMLDivElement | null>(null);

	const betting = room?.phase === 'betting' && pools !== null;
	const at = useMemo(() => layout(view, betting), [view, betting]);
	const rules = room?.settings ?? DEFAULT_SETTINGS;
	const max = you ? you.balance + rules.debtCap : 0;
	const [first, second] = outcome?.split('>') ?? [];
	const complete = market === 'exacta' ? second !== undefined : outcome !== null;
	// a stake over the credit limit is left for the room to refuse, so the reason shows where it was asked
	const valid = Number.isInteger(stake) && stake >= 1;
	const waiting = sent !== null && bets.length === sent.count && !problem;
	const placed = sent !== null && bets.length > sent.count && !problem;
	const ready = complete && valid && !waiting && you !== null;
	const action = waiting ? 'Placing…' : !complete ? 'Pick a bet' : 'Place bet';
	const note = problem
		? { text: problem, bad: true }
		: offline
			? { text: 'Not connected. Reconnecting…', bad: true }
			: placed
				? {
						text: `Placed ${chips(sent.stake)} on ${label(sent.market, sent.outcome)}`,
						bad: false
					}
				: null;

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
		if (!ready || !outcome) return;
		if (send({ type: 'bet', market, outcome, stake })) {
			setSent({ count: bets.length, stake, market, outcome });
			setOffline(false);
		} else {
			setOffline(true);
		}
	}
	/** Left and right step through a row of buttons, as they would through tabs. */
	function arrows(event: KeyboardEvent<HTMLDivElement>) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		const buttons = [...event.currentTarget.querySelectorAll('button')];
		const from = buttons.indexOf(event.target as HTMLButtonElement);
		if (!step || from < 0) return;
		event.preventDefault();
		const next = buttons[(from + step + buttons.length) % buttons.length];
		next.focus();
		next.click();
	}

	// the graphics are drawn from whatever this last rendered
	const slip: Slip = {
		market,
		outcome,
		stake,
		max,
		typing,
		selection,
		legend,
		ready,
		action,
		note
	};
	useEffect(() => {
		setPaint((painter, cars, replay, dt) =>
			hud.draw(
				painter,
				at,
				{
					room,
					left,
					pools,
					you,
					bets,
					board,
					ticker,
					running,
					scroll,
					pan,
					slip,
					menu: menu.current,
					cars,
					replay
				},
				dt
			)
		);
	});

	/** Where a box of the frame is on the page. */
	const over = ({ x, y, w, h }: Box): CSSProperties => ({
		left: `${((x * at.unit) / view.width) * 100}%`,
		top: `${((y * at.unit) / view.height) * 100}%`,
		width: `${((w * at.unit) / view.width) * 100}%`,
		height: `${((h * at.unit) / view.height) * 100}%`
	});
	/** Where a box of the panels is in their pane on the page, as if it were not scrolled. */
	const css = at.unit * view.scale;
	const within = ({ x, y, w, h }: Box): CSSProperties => ({
		left: (x - at.pane.x) * css,
		top: (y - at.pane.y) * css,
		width: w * css,
		height: h * css
	});
	const net = netOf(bets);

	return (
		<div className={PAGE}>
			<Bar sound={<SoundToggle sound={sound} setSound={setSound} />} />
			{/* the colour of the grass, so a sliver left over at the edge is more grass */}
			<div
				ref={stage}
				className="relative min-h-0 flex-1 touch-manipulation overflow-hidden rounded-lg bg-[#3a6b35]"
			>
				<div
					ref={setFrame}
					className="absolute top-0 left-0"
					style={{ width: view.width * view.scale, height: view.height * view.scale }}
				>
					{children}

					{/* The panels. Stacked, they scroll in the part of the column the
					    track and the slip leave them: this box is what scrolls, and
					    how far it has gone is how far up they are drawn. */}
					<div
						className={cn(
							'absolute',
							view.stacked
								? '[scrollbar-width:none] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden'
								: 'overflow-hidden'
						)}
						style={over(at.pane)}
						onScroll={({ currentTarget }) => setPan(Math.round(currentTarget.scrollTop / css))}
					>
						<div className="relative" style={{ height: at.panels * css }}>
							<Scroller
								label="Leaderboard"
								rows={board.length}
								visible={BOARD_ROWS}
								style={within(at.boardList)}
								onScroll={(by) => setScroll((scroll) => ({ ...scroll, board: by }))}
							>
								<ol>
									{board.map((player) => (
										<li key={player.id}>
											{player.name}, {chips(player.balance)} chips
										</li>
									))}
								</ol>
							</Scroller>
							<Scroller
								label="Recent bets"
								rows={ticker.length}
								visible={TICKS}
								style={within(at.tickerList)}
								onScroll={(by) => setScroll((scroll) => ({ ...scroll, ticker: by }))}
							>
								<ul>
									{ticker.map((tick, index) => (
										<li key={index}>
											{tick.name}: {chips(tick.stake)} on {label(tick.market, tick.outcome)},{' '}
											{MARKET_NAMES[tick.market].toLowerCase()}
										</li>
									))}
								</ul>
							</Scroller>

							{you && (
								<Dialog>
									<DialogTrigger
										render={
											<button
												type="button"
												aria-label={`Your wallet and settings: ${chips(you.balance)} chips, ${you.name}${you.bankruptcies > 0 ? `, bankrupt ${you.bankruptcies} time${you.bankruptcies === 1 ? '' : 's'}` : ''}`}
												className={hit}
												style={within(at.wallet)}
											/>
										}
									/>
									<Settings
										you={you}
										rules={rules}
										problem={problem}
										send={send}
										container={frame}
										at={at.menu}
										over={over}
										show={showMenu}
									/>
								</Dialog>
							)}
						</div>
					</div>

					{betting && (
						<section aria-label="Bet slip">
							<div role="group" aria-label="Market" onKeyDown={arrows}>
								{MARKETS.map((m, index) => (
									<button
										key={m}
										type="button"
										aria-pressed={m === market}
										aria-label={MARKET_NAMES[m]}
										tabIndex={m === market ? 0 : -1}
										onClick={() => {
											setMarket(m);
											choose(null);
										}}
										className={hit}
										style={over(at.tabs[index])}
									/>
								))}
							</div>
							{/* the stat bars' heading says what they are, under the pointer or the keyboard */}
							<button
								type="button"
								aria-label={`The four bars: ${LEGEND.map(([name, meaning]) => `${name}, ${meaning.toLowerCase()}`).join('; ')}`}
								onPointerEnter={(event) => event.pointerType === 'mouse' && setLegend(true)}
								onPointerLeave={(event) => event.pointerType === 'mouse' && setLegend(false)}
								// a finger has no hover, and Safari does not focus what is tapped
								onPointerDown={(event) =>
									event.pointerType !== 'mouse' && setLegend((shown) => !shown)
								}
								onFocus={() => setLegend(true)}
								onBlur={() => setLegend(false)}
								className={`${hit} cursor-help`}
								style={over(at.legend)}
							/>
							{room.grid.map((id, place) => {
								const name = entry(id).name;
								const condition = CONDITIONS[room.conditions[place]].label;
								if (market === 'exacta') {
									return (
										<div key={id} role="group" aria-label={`${name}, ${condition}`}>
											<button
												type="button"
												aria-pressed={first === id}
												aria-label={`1st: ${name}`}
												onClick={() => choose(first === id ? null : id)}
												className={hit}
												style={over(at.firsts[place])}
											/>
											<button
												type="button"
												disabled={!first || first === id}
												aria-pressed={second === id}
												aria-label={`2nd: ${name}`}
												onClick={() => choose(second === id ? first : `${first}>${id}`)}
												className={hit}
												style={over(at.seconds[place])}
											/>
										</div>
									);
								}
								if (market === 'clean') return null;
								return (
									<button
										key={id}
										type="button"
										aria-pressed={outcome === id}
										aria-label={`${name}, ${condition}, pays ${pays(pools[market], market, id).toFixed(1)} times`}
										onClick={() => choose(id)}
										className={hit}
										style={over(at.cars[place])}
									/>
								);
							})}
							{market === 'clean' &&
								(['yes', 'no'] as const).map((answer, index) => (
									<button
										key={answer}
										type="button"
										aria-pressed={outcome === answer}
										aria-label={`${label('clean', answer)}, pays ${pays(pools.clean, 'clean', answer).toFixed(1)} times`}
										onClick={() => choose(answer)}
										className={hit}
										style={over(at.clean[index])}
									/>
								))}
							<div role="group" aria-label="Stake">
								{STAKES.map((value, index) => {
									const chipsOf = value === 'Max' ? max : value;
									return (
										<button
											key={value}
											type="button"
											disabled={chipsOf < 1}
											aria-pressed={stake === chipsOf}
											aria-label={value === 'Max' ? `Everything: ${chips(max)}` : `${value} chips`}
											onClick={() => stakeTo(chipsOf)}
											className={hit}
											style={over(at.stakes[index])}
										/>
									);
								})}
								{/* the figures are drawn under it, so its own are not shown */}
								<input
									ref={field}
									aria-label="Stake in chips"
									inputMode="numeric"
									autoComplete="off"
									value={Number.isNaN(stake) ? '' : stake}
									onChange={(event) =>
										stakeTo(Number(event.target.value.replace(/\D/g, '').slice(0, 7)))
									}
									onKeyDown={(event) => event.key === 'Enter' && place()}
									onFocus={() => setTyping(true)}
									onBlur={() => setTyping(false)}
									className={ghost}
									style={over(at.input)}
								/>
							</div>
							<button
								type="button"
								disabled={!ready}
								aria-label={action}
								onClick={place}
								className={hit}
								style={over(at.place)}
							/>
						</section>
					)}
				</div>
			</div>

			{/* what the picture says, as text */}
			<div className="sr-only">
				<p role={note?.bad ? 'alert' : 'status'} aria-live={note?.bad ? 'assertive' : 'polite'}>
					{note?.text}
				</p>
				{room?.phase === 'results' && (
					<p aria-live="polite">
						{bets.length === 0
							? 'You had no bets on this race.'
							: net !== null && `Your race: ${signed(net)} chips.`}
						{room.result && ` ${room.result.order.map((id) => entry(id).name).join(', ')}.`}
					</p>
				)}
				{room?.phase === 'racing' && running && (
					<section aria-label="Running order">
						<ol>
							{running.order.map((id) => (
								<li key={id}>
									{entry(id).name}
									{running.cars[id].retired ? ', out' : running.cars[id].finished ? ', home' : ''}
								</li>
							))}
						</ol>
					</section>
				)}
				<section aria-label="Your bets">
					<ul>
						{bets.map((bet, index) => {
							const hold = holding(bet, running);
							return (
								<li key={index}>
									{MARKET_NAMES[bet.market]}: {label(bet.market, bet.outcome)}, {chips(bet.stake)}{' '}
									chips
									{bet.payout !== null
										? `, paid ${chips(bet.payout)}`
										: hold !== null && (hold ? ', in the money' : ', out of it')}
								</li>
							);
						})}
					</ul>
				</section>
			</div>
		</div>
	);
}
