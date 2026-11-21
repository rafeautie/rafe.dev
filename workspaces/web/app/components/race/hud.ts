import { MAX_BETS, MARKETS, pays, type Market, type Pools } from '~/lib/race/betting';
import { ADVANCE, clip, enlarge, hex, measure, wrap, type Painter } from '~/lib/race/pixels';
import type { Replay } from '~/lib/race/recording';
import { HEIGHT, SCALE, WIDTH, type CarView } from '~/lib/race/render';
import type { Bet, RoomState, Standing } from '~/lib/race/room';
import { CONDITIONS, ROSTER, inCondition } from '~/lib/race/roster';
import { STATS } from '~/lib/race/settings';
import { LAPS, LIGHTS, rank, type Flag } from '~/lib/race/sim';
import { ASKS, FLAGS, SHORT, chips, entry, holding, label, signed } from './shared';
import type { Running, Selection, Tick } from './shared';

// The broadcast graphics, drawn into the race's own frame in the race's own
// pixels: the timing tower, the leaderboard and the bets coming in down the
// left, your chips and your bets down the right, and in the middle whatever
// the phase is about (the bet slip while betting is open, your result once
// the race is over, nothing while it runs).
//
// The frame is as large as the window allows and the track sits in the middle
// of it, so there is grass round the track to put all this on. Where each
// piece goes is worked out once per frame size by `layout`. The page reads the
// same layout to lay real buttons, unseen, over the ones drawn here
// (Game.tsx), so what is drawn can be clicked, tabbed to and read out.

/** The smallest frame everything fits in: the track with a column either side. */
export const MIN_W = 920;
export const MIN_H = 400;

/**
 * The frame's size in its own pixels, how many of the screen's pixels each one
 * is shown as, and how many CSS pixels that is. A stacked frame has the rest of
 * the game under the track (a phone held upright) or beside it (on its side)
 * rather than round it.
 */
export type View = {
	width: number;
	height: number;
	zoom: number;
	scale: number;
	stacked: 'under' | 'beside' | null;
};

/**
 * The fewest CSS pixels a frame pixel may be shown as with the columns round
 * the track. Any smaller and the writing cannot be read, so a narrow space (a
 * phone) gets the stacked frame: the track in one place, and the rest in a
 * column under it or beside it, drawn `UNIT` frame pixels to each of the
 * graphics' own so it stays a readable size.
 */
const SMALLEST = 0.9;
const UNIT = 2;

/** The frame for a space on the page, CSS pixels across and down, on a screen with `ratio` pixels to each. */
export function fit(width: number, height: number, ratio: number): View {
	let zoom = Math.min((width * ratio) / MIN_W, (height * ratio) / MIN_H);
	let stacked: View['stacked'] = null;
	if (zoom / ratio < SMALLEST) {
		// Whichever way shows everything biggest: the column under the track
		// or beside it, each with room for the slip and some of the panels,
		// and no bigger than one CSS pixel to each of the frame's.
		const under = Math.min(width / WIDTH, height / (HEIGHT + LEAST * UNIT), 1);
		const beside = Math.min(
			width / (WIDTH + SIDE * UNIT),
			height / Math.max(HEIGHT, LEAST * UNIT),
			1
		);
		stacked = beside > under ? 'beside' : 'under';
		zoom = Math.max(under, beside) * ratio;
	}
	// whole pixels are the sharpest, so when a whole size is nearly as big, take it
	if (zoom >= 1 && zoom - Math.floor(zoom) < 0.15) zoom = Math.floor(zoom);
	return {
		width: Math.floor((width * ratio) / zoom),
		height: Math.floor((height * ratio) / zoom),
		zoom,
		scale: zoom / ratio,
		stacked
	};
}

export type Box = { x: number; y: number; w: number; h: number };
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** How wide the column down the left is. */
const LEFT = 144;
/**
 * How tall a row is: of the tower, of the leaderboard and of your bets, of
 * everybody's bets (two lines each), and of the bet slip's cars.
 */
const ROW = 14;
const LINE = 12;
const TICK = 24;
const CAR = 14;
/** How many players the leaderboard shows at once, and how many of everybody's bets. The rest scroll. */
export const BOARD_ROWS = 6;
export const TICKS = 5;
/** How big the bet slip is, the settings, and what the stat bars mean. */
const SLIP = 300;
const SLIP_H = 218;
const MENU = 232;
const KEY_W = 166;
const KEY_H = 89;
/** How tall the tower is, the leaderboard and everybody's bets. */
const TOWER_H = 35 + ROSTER.length * ROW;
const BOARD_H = 18 + BOARD_ROWS * LINE;
const TICKER_H = 17 + TICKS * TICK;

/**
 * Stacked, in the graphics' pixels: how wide the panels are, and each of their
 * two columns; how wide the column is beside the track; how tall the panels
 * are all told; and the least height the column may have, which is the slip
 * and a little of the panels over it.
 */
const COLUMN = 312;
const HALF = (COLUMN - 4) / 2;
const SIDE = COLUMN + 8;
const PANELS = 4 + TOWER_H + 4 + BOARD_H + 4 + TICKER_H + 4;
const LEAST = 60 + SLIP_H + 8;
/** What the four bars beside each car are, by the letter over them. */
export const LEGEND = [
	['Speed', 'Engine power'],
	['Grip', 'Cornering'],
	['Aggression', 'Pushes harder, errs more'],
	['Reliability', 'Knocks it can take']
];

/**
 * How far ahead, in metres, a car must get before the tower moves it up a
 * place. Two cars side by side swap the lead many times a second; this waits
 * for one to be clear by about half a car.
 */
const CLEAR = 2;
/** How often, in seconds, the tower reads the gaps again, so the figures can be read. */
const GAPS_EVERY = 0.5;

/** The stakes one click away. The last is everything you may bet. */
export const STAKES = [10, 50, 100, 'Max'] as const;

export type Layout = ReturnType<typeof layout>;

/**
 * Where everything goes in a frame. The columns keep to the edges; the track
 * has the middle. Stacked, the track stays where it is, the slip is kept at the
 * foot of the column while betting is open, and the panels have the rest of
 * the column, the `pane`, which scrolls: they are placed as if it were not
 * scrolled, and are `panels` tall all told. The track is placed in the frame's
 * pixels; everything else is in the graphics' own, `unit` of the frame's each.
 */
export function layout({ width, height, stacked }: View, betting = false) {
	const unit = stacked ? UNIT : 1;
	// the frame in the graphics' pixels
	const [fw, fh] = [Math.floor(width / unit), Math.floor(height / unit)];
	const [tw, th] = [WIDTH / unit, HEIGHT / unit];
	// The track is in the middle of what the columns leave. At the smallest
	// frame its box runs a few pixels under each of them, which costs nothing:
	// the road stops short of the box's edges, and what is under is grass.
	// Stacked, the track and the column are side by side or one on the other,
	// together in the middle.
	const across = stacked === 'beside' ? (fw - tw - SIDE) >> 1 : 0;
	const track = !stacked
		? { x: LEFT - 4 + Math.floor((width - MIN_W) / 2), y: Math.floor((height - HEIGHT) / 2) }
		: stacked === 'beside'
			? { x: across * unit, y: Math.floor((height - HEIGHT) / 2) }
			: { x: Math.floor((width - WIDTH) / 2), y: 0 };
	const [tx, ty] = [track.x / unit, track.y / unit];
	let tower: Box, board: Box, ticker: Box, wallet: Box, bets: Box, key: Box, pane: Box;
	let x: number, y: number;
	if (!stacked) {
		pane = box(0, 0, fw, fh);
		tower = box(4, 4, LEFT, TOWER_H);
		board = box(4, tower.y + tower.h + 4, LEFT, BOARD_H);
		ticker = box(4, board.y + board.h + 4, LEFT, TICKER_H);
		wallet = box(fw - 148, 4, 144, 24);
		bets = box(fw - 148, 32, 144, 0);
		// the slip is in the middle of the track, both ways
		x = tx + (tw - SLIP) / 2;
		y = ty + (th - SLIP_H) / 2;
		// what the stat bars mean goes beside the slip, so it covers none of it
		key = box(x + SLIP + 4, y + 44, KEY_W, KEY_H);
	} else {
		// The column: under the track or beside it, to the frame's edge. The
		// slip is at its foot, and the panels over it: the tower, the
		// leaderboard and everybody's bets down the left, your chips and your
		// bets down the right.
		const column = stacked === 'beside' ? box(across + tw, 0, SIDE, fh) : box(0, th, fw, fh - th);
		x = column.x + ((column.w - SLIP) >> 1);
		y = column.y + column.h - SLIP_H - 4;
		pane = box(column.x, column.y, column.w, (betting ? y - 4 : column.y + column.h) - column.y);
		const left = column.x + ((column.w - COLUMN) >> 1);
		const top = column.y + 4;
		tower = box(left, top, HALF, TOWER_H);
		board = box(left, tower.y + tower.h + 4, HALF, BOARD_H);
		ticker = box(left, board.y + board.h + 4, HALF, TICKER_H);
		wallet = box(left + HALF + 4, top, HALF, 24);
		bets = box(wallet.x, top + 28, HALF, 0);
		// over the panels, above the stat bars it is about
		key = box(x + SLIP - KEY_W, y - KEY_H - 4, KEY_W, KEY_H);
	}
	// the settings open over the middle of everything
	const mx = (fw - MENU) >> 1;
	const my = (fh - 170) >> 1;
	const widths = MARKETS.map((market) => measure(SHORT[market]) + 9);
	return {
		unit,
		key,
		pane,
		panels: stacked ? PANELS : fh,
		menu: {
			panel: box(mx, my, MENU, 0),
			close: box(mx + MENU - 15, my, 15, 15),
			name: box(mx + 6, my + 31, MENU - 56, 15),
			save: box(mx + MENU - 46, my + 31, 40, 15),
			bankrupt: box(mx + 6, my + 138, 124, 15),
			confirm: box(mx + 90, my + 138, 56, 15),
			cancel: box(mx + 150, my + 138, 50, 15)
		},
		track,
		tower,
		board,
		ticker,
		// the lists inside those two, which scroll
		boardList: box(board.x, board.y + 15, board.w, BOARD_ROWS * LINE),
		tickerList: box(ticker.x, ticker.y + 15, ticker.w, TICKS * TICK),
		wallet,
		bets,
		// the middle of the track, like the slip: the race is over, so nothing is hidden by it
		card: box(tx + (tw - 160) / 2, ty + (th - 92) / 2, 160, 92),
		slip: box(x, y, SLIP, SLIP_H),
		tabs: MARKETS.map((_, index) =>
			box(
				x + 6 + widths.slice(0, index).reduce((sum, w) => sum + w + 2, 0),
				y + 19,
				widths[index],
				13
			)
		),
		cars: ROSTER.map((_, row) => box(x + 3, y + 58 + row * CAR, SLIP - 6, CAR - 1)),
		firsts: ROSTER.map((_, row) => box(x + 243, y + 59 + row * CAR, 25, 11)),
		seconds: ROSTER.map((_, row) => box(x + 269, y + 59 + row * CAR, 25, 11)),
		legend: box(x + 210, y + 45, 29, 12),
		clean: [box(x + 6, y + 146, 76, 15), box(x + 84, y + 146, 100, 15)],
		stakes: STAKES.map((_, index) => box(x + 6 + index * 48, y + 165, 46, 15)),
		input: box(x + 198, y + 165, 96, 15),
		place: box(x + 6, y + 184, SLIP - 12, 17)
	};
}

/** The bet slip as it stands: what is chosen, and what the page has to say about it. */
export type Slip = {
	market: Market;
	outcome: string | null;
	stake: number;
	/** The most that may be staked. */
	max: number;
	/** Whether the stake is being typed, and where in it the caret is. */
	typing: boolean;
	selection: Selection;
	/** Whether what the stat bars mean is being asked. */
	legend: boolean;
	/** Whether the bet can be placed, and what its button says. */
	ready: boolean;
	action: string;
	/** What came of the last bet, if anything is to be said. */
	note: { text: string; bad: boolean } | null;
};

/** The settings while they are open: your name as typed, and what came of asking. */
export type Menu = {
	name: string;
	typing: boolean;
	selection: Selection;
	/** Whether the name can be saved as it is. */
	fresh: boolean;
	/** What came of saving the name, and of going bankrupt. */
	note: { text: string; bad: boolean } | null;
	refusal: string | null;
	/** Whether bankruptcy has been asked for and is waiting to be confirmed. */
	sure: boolean;
};

export type Scene = {
	room: RoomState | null;
	/** Seconds left in the phase. */
	left: number;
	pools: Pools | null;
	you: Standing | null;
	bets: Bet[];
	board: Standing[];
	ticker: Tick[];
	running: Running | null;
	/** How far down the leaderboard and everybody's bets are scrolled, 0 at the top to 1 at the end. */
	scroll: { board: number; ticker: number };
	/** How far the panels are scrolled up their pane, in the graphics' pixels. */
	pan: number;
	slip: Slip;
	menu: Menu | null;
	/** The cars where they are drawn, and, once there is a race, the replay showing it. */
	cars: CarView[];
	replay: Replay | null;
};

const INK = hex('#0f1115');
const PAPER = hex('#f2efe6');
const DIM = hex('#a3a8b0');
const FAINT = hex('#454a54');
/** Whatever is yours: the cars you backed, your row on the leaderboard. */
const GOLD = hex('#ffd24a');
const GOOD = hex('#6fdc7a');
const BAD = hex('#ff6b61');
const ALARM = hex('#c8382f');
/** The caution flag, and the green one, which is also the colour of going green. */
const FLAG = hex('#f7e135');
const GO = hex('#27a84a');
const BODY = Object.fromEntries(ROSTER.map((car) => [car.id, hex(car.color)]));

const clock = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const times = (odds: number) => `${odds.toFixed(1)}×`;
const single = (market: Market) => market !== 'exacta' && market !== 'clean';

/** What the round has come to for you, once every bet is settled. */
export function netOf(bets: Bet[]) {
	if (bets.length === 0 || bets.some((bet) => bet.payout === null)) return null;
	return bets.reduce((sum, bet) => sum + bet.payout! - bet.stake, 0);
}

export function createHud() {
	const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
	// numbers and rows on their way to where they belong, by name
	const shown = new Map<string, number>();
	let round = -1;
	// the tower's running order as it is showing it, each car's gap to the
	// leader as last read, and how many seconds ago that was
	let running: string[] = [];
	const gaps = new Map<string, number | null>();
	let read = Infinity;

	/** A value that glides to its target rather than jumping, so a change is seen as one. */
	function glide(key: string, target: number, dt: number) {
		const from = shown.get(key);
		const next =
			from === undefined || still ? target : from + (target - from) * Math.min(1, dt * 10);
		shown.set(key, Math.abs(target - next) < 0.01 ? target : next);
		return next;
	}

	function panel(p: Painter, { x, y, w, h }: Box) {
		p.fill(x, y, w, h, INK, 0.88);
	}

	/**
	 * The bar across the top of a panel: what it is on the left, a figure on
	 * the right. With `alarm` it is red. With `flying` it starts with that
	 * flag, as a small one: green, yellow, or checked black and white. Under
	 * the yellow one the whole bar is yellow too; going green, the bar is
	 * yellow and the flag green.
	 */
	function head(
		p: Painter,
		{ x, y, w }: Box,
		title: string,
		figure: string,
		alarm = false,
		flying: Flag | null = null
	) {
		const ink = alarm ? PAPER : INK;
		const neutralised = flying === 'yellow' || flying === 'restart';
		p.fill(x, y, w, 15, neutralised ? FLAG : alarm ? ALARM : PAPER);
		if (flying) {
			p.fill(x + 3, y + 3, 14, 8, INK);
			p.fill(
				x + 4,
				y + 4,
				12,
				6,
				flying === 'green' || flying === 'restart' ? GO : flying === 'yellow' ? FLAG : PAPER
			);
			// the checks: every other square of two pixels dark
			for (let square = flying === 'checkered' ? 0 : 18; square < 18; square++) {
				const [column, row] = [square % 6, Math.floor(square / 6)];
				if ((column + row) & 1) p.fill(x + 4 + column * 2, y + 4 + row * 2, 2, 2, INK);
			}
		}
		p.text(x + (flying ? 21 : 4), y + 4, title, ink);
		p.right(x + w - 4, y + 4, figure, ink);
	}

	/** A car: its colour with its number on it. */
	function tile(p: Painter, x: number, y: number, id: string) {
		const number = String(entry(id).number);
		p.fill(x, y, 13, 9, BODY[id]);
		p.text(x + ((13 - measure(number)) >> 1), y + 1, number, INK);
		return x + 16;
	}

	/** A bet's outcome: the cars' tiles, or for a clean race the answer in words. Returns where it ended. */
	function outcome(p: Painter, x: number, y: number, market: Market, picked: string) {
		if (market === 'clean') return p.text(x, y + 1, label(market, picked), PAPER) + 2;
		for (const id of picked.split('>')) x = tile(p, x, y, id);
		return x;
	}

	// The tower: the phase and its clock on top, the cycle as a bar, a line
	// saying what the rows and their figures are, and a row per car in the
	// order they are running. Rows slide to their new place.
	function tower(p: Painter, at: Box, scene: Scene, dt: number) {
		const { room, left, replay, pools, slip } = scene;
		const field = replay?.cars ?? null;
		const { x, y, w } = at;
		panel(p, at);
		const phase = room?.phase;
		const urgent = phase === 'betting' && left <= 10;
		const leader = field ? rank(field)[0] : null;
		const lap = leader && replay ? replay.lap(leader) : 1;
		if (!room) head(p, at, 'Connecting', '');
		else if (phase === 'betting')
			head(p, at, urgent ? 'Last call' : 'Bets open', clock(left), urgent);
		else if (phase === 'racing' && replay && replay.time >= LIGHTS)
			// the flag that is flying, and its name: a caution, and going green
			// after it, turn the whole bar yellow
			head(p, at, FLAGS[replay.flag], `Lap ${lap}/${LAPS}`, false, replay.flag);
		else if (phase === 'racing') head(p, at, 'On the grid', `Race ${room.round}`);
		else if (phase === 'results') head(p, at, 'Result', clock(left), false, 'checkered');
		else head(p, at, 'Waiting', '');

		// bet, race, result: each as long as it lasts, filled as far as it has
		// got; the race, while it is neutralised, in the colour of the flag
		const flying = phase === 'racing' && replay && replay.time >= LIGHTS ? replay.flag : null;
		const racing = flying === 'yellow' ? FLAG : flying === 'restart' ? GO : PAPER;
		const betting = room?.settings.bettingSeconds ?? 45;
		const results = room?.settings.resultsSeconds ?? 15;
		const raced = leader && replay ? replay.raced(leader) : 0;
		const stretches = [
			[
				betting,
				phase === 'betting' ? 1 - left / betting : phase === 'racing' || phase === 'results' ? 1 : 0
			],
			[65, phase === 'racing' ? raced : phase === 'results' ? 1 : 0],
			[results, phase === 'results' ? 1 - left / results : 0]
		];
		const total = betting + 65 + results;
		let sx = x + 4;
		stretches.forEach(([seconds, fill], index) => {
			const width = Math.round(((w - 12) * seconds) / total);
			p.fill(sx, y + 17, width, 3, FAINT);
			const done = Math.round(width * Math.max(0, Math.min(1, fill)));
			p.fill(sx, y + 17, done, 3, index === 0 && urgent ? BAD : index === 1 ? racing : PAPER);
			sx += width + 2;
		});

		// what the rows are and what the figure beside each is, which changes
		// with the phase and, while betting is open, with the market on the slip
		const priced = single(slip.market) ? slip.market : 'win';
		const [rows, figure] = field
			? phase === 'results'
				? ['Finish', 'Time']
				: ['Order', 'Gap']
			: phase === 'betting'
				? ['Grid', `${SHORT[priced]} pays`]
				: ['', ''];
		p.text(x + 5, y + 24, rows, DIM);
		p.right(x + w - 4, y + 24, figure, DIM);

		let order = room?.result?.order ?? room?.grid ?? [];
		if (field) {
			const car = (id: string) => field.find((car) => car.entry.id === id)!;
			// The order is kept from frame to frame, and a car moves up it only
			// once it is clear of the one above (or beat it to the flag), so cars
			// running side by side do not swap places every frame.
			if (running.length !== field.length || running.some((id) => !car(id))) {
				running = rank(field).map((car) => car.entry.id);
			}
			for (let pass = 0; pass < running.length; pass++) {
				for (let place = 0; place + 1 < running.length; place++) {
					const [above, below] = [car(running[place]), car(running[place + 1])];
					const passed =
						above.finishTime || below.finishTime
							? below.finishTime > 0 && (!above.finishTime || below.finishTime < above.finishTime)
							: below.progress - above.progress > CLEAR;
					if (passed) [running[place], running[place + 1]] = [running[place + 1], running[place]];
				}
			}
			order = running;
		}
		// whoever is at the top of the tower, which the gaps are measured to
		const top = field?.find((car) => car.entry.id === order[0]);
		read += dt;
		if (replay && top && read >= GAPS_EVERY) {
			read = 0;
			replay.cars.forEach((car, index) =>
				gaps.set(car.entry.id, replay.gap(index, replay.cars.indexOf(top)))
			);
		}
		const backed = new Set(scene.bets.flatMap((bet) => bet.outcome.split('>')));
		order.forEach((id, place) => {
			const ry = y + 34 + Math.round(glide(`row ${id}`, place * ROW, dt));
			const car = field?.find((car) => car.entry.id === id);
			if (backed.has(id)) p.fill(x, ry, 2, ROW - 1, GOLD);
			p.text(x + 5, ry + 3, String(place + 1), place === 0 ? PAPER : DIM);
			tile(p, x + 14, ry + 2, id);
			p.text(x + 30, ry + 3, entry(id).name, car?.retired ? DIM : PAPER);
			if (car && top) {
				// the gap to the leader in seconds: how long ago the leader was
				// here, and at the flag the difference in their times
				const behind = gaps.get(id) ?? null;
				const [gap, colour] = car.retired
					? ['Out', BAD]
					: car === top
						? car.finishTime
							? [(car.finishTime - LIGHTS).toFixed(2), PAPER]
							: ['Leader', DIM]
						: car.finishTime && top.finishTime
							? [`+${(car.finishTime - top.finishTime).toFixed(2)}`, PAPER]
							: [behind === null ? '' : `+${behind.toFixed(1)}`, DIM];
				p.right(x + w - 4, ry + 3, gap, colour);
			} else if (room && pools && phase === 'betting') {
				// before the race: how each car turned up, and what it pays
				const by = CONDITIONS[room.conditions[place]].by;
				if (by) p.text(x + 62, ry + 3, by > 0 ? '↑' : '↓', by > 0 ? GOOD : BAD);
				const odds = glide(`${priced} ${id}`, pays(pools[priced], priced, id), dt);
				p.right(x + w - 4, ry + 3, times(odds), PAPER);
			}
		});
	}

	/**
	 * A list longer than its panel: which row is at the top for how far it is
	 * scrolled, and where the rows may run to, with a bar down the edge showing
	 * how much there is and where this is in it.
	 */
	function scrolled(p: Painter, at: Box, top: number, rows: number, visible: number, by: number) {
		const { x, y, w, h } = at;
		if (rows <= visible) return { from: 0, edge: x + w - 4 };
		const tall = h - top - 3;
		const thumb = Math.max(4, Math.round((tall * visible) / rows));
		p.fill(x + w - 4, y + top, 2, tall, FAINT);
		p.fill(x + w - 4, y + top + Math.round((tall - thumb) * by), 2, thumb, DIM);
		return { from: Math.round(by * (rows - visible)), edge: x + w - 8 };
	}

	function leaderboard(p: Painter, at: Box, scene: Scene) {
		const { x, y } = at;
		const { board } = scene;
		panel(p, at);
		p.text(x + 4, y + 4, 'Leaderboard', DIM);
		if (board.length === 0) p.text(x + 4, y + 17, 'Nobody is playing', FAINT);
		const { from, edge } = scrolled(p, at, 15, board.length, BOARD_ROWS, scene.scroll.board);
		// room for the longest place number in view
		const name = x + 8 + measure(String(Math.min(board.length, from + BOARD_ROWS)));
		board.slice(from, from + BOARD_ROWS).forEach((player, row) => {
			const ry = y + 17 + row * LINE;
			const colour = player.id === scene.you?.id ? GOLD : PAPER;
			const balance = chips(player.balance);
			p.right(name - 4, ry, String(from + row + 1), DIM);
			p.text(name, ry, clip(player.name, edge - name - 4 - measure(balance)), colour);
			p.right(edge, ry, balance, player.balance < 0 ? BAD : colour);
		});
	}

	// Everybody's bets as they land, newest first: who, then what.
	function ticker(p: Painter, at: Box, scene: Scene) {
		const { x, y } = at;
		panel(p, at);
		p.text(x + 4, y + 4, 'Recent bets', DIM);
		if (scene.ticker.length === 0) p.text(x + 4, y + 17, 'Nobody has bet yet', FAINT);
		const { from, edge } = scrolled(p, at, 15, scene.ticker.length, TICKS, scene.scroll.ticker);
		scene.ticker.slice(from, from + TICKS).forEach((tick, index) => {
			const ry = y + 17 + index * TICK;
			p.text(x + 4, ry, clip(tick.name, edge - x - 4), DIM);
			const after = outcome(p, x + 4, ry + 9, tick.market, tick.outcome);
			if (tick.market !== 'clean') p.text(after, ry + 10, SHORT[tick.market], PAPER);
			p.right(edge, ry + 10, chips(tick.stake), PAPER);
		});
	}

	// What you have. In debt it says how much further you may go; once a race
	// is settled, what it changed by.
	function wallet(p: Painter, at: Box, scene: Scene, dt: number) {
		const { x, y, w } = at;
		const { you, room, bets } = scene;
		panel(p, at);
		if (!you) return;
		const debt = you.balance < 0;
		const balance = chips(glide('balance', you.balance, dt));
		p.text(x + 5, y + 5, balance, debt ? BAD : PAPER, 2);
		const space = w - 15 - measure(balance, 2);
		p.right(x + w - 5, y + 4, clip(you.name, space), GOLD);
		const net = room?.phase === 'results' ? netOf(bets) : null;
		const [line, colour] = net
			? [signed(net), net > 0 ? GOOD : BAD]
			: debt
				? [`${chips(you.balance + (room?.settings.debtCap ?? 0))} left`, BAD]
				: you.bankruptcies > 0
					? [`Bust ×${you.bankruptcies}`, DIM]
					: ['Chips', DIM];
		p.right(x + w - 5, y + 13, clip(line, space), colour);
	}

	// Your bets on this race: what each returns while betting is open, whether
	// it is in the money while the race runs, and what it paid.
	function yours(p: Painter, at: Box, scene: Scene) {
		const { x, y, w } = at;
		const { room, pools, bets, running } = scene;
		panel(p, { ...at, h: 18 + Math.max(1, bets.length) * LINE });
		p.text(x + 4, y + 4, 'Your bets', DIM);
		if (bets.length === 0) {
			const none = room?.phase === 'betting' || !room ? 'No bets yet' : 'No bets on this race';
			p.text(x + 4, y + 17, none, FAINT);
			return;
		}
		const staked = bets.reduce((sum, bet) => sum + bet.stake, 0);
		p.right(x + w - 4, y + 4, `${chips(staked)} staked`, DIM);
		bets.forEach((bet, index) => {
			const ry = y + 16 + index * LINE;
			const hold = holding(bet, running);
			const net = bet.payout === null ? 0 : bet.payout - bet.stake;
			const [status, colour] =
				bet.payout !== null
					? [net === 0 ? 'Back' : signed(net), net > 0 ? GOOD : net < 0 ? BAD : DIM]
					: room?.phase === 'betting' && pools
						? [
								`→${chips(Math.floor(bet.stake * pays(pools[bet.market], bet.market, bet.outcome)))}`,
								DIM
							]
						: hold === null
							? ['Riding', DIM]
							: hold
								? ['● In', GOOD]
								: ['○ Out', DIM];
			p.right(x + w - 4, ry + 1, status, colour);
			const stake = chips(bet.stake);
			p.right(x + w - 50, ry + 1, stake, PAPER);
			const after = outcome(p, x + 4, ry, bet.market, bet.outcome);
			if (bet.market !== 'clean') {
				p.text(after, ry + 1, clip(SHORT[bet.market], x + w - 54 - measure(stake) - after), DIM);
			}
		});
	}

	/** A small arrow over each car you have a bet on, so you can find it in the pack. */
	function markers(p: Painter, at: Layout, scene: Scene) {
		const backed = new Set(scene.bets.flatMap((bet) => bet.outcome.split('>')));
		for (const car of scene.cars) {
			if (!backed.has(car.entry.id)) continue;
			const x = Math.round((at.track.x + car.x * SCALE) / at.unit);
			const y = Math.round((at.track.y + car.y * SCALE) / at.unit) - 15;
			p.fill(x - 4, y - 1, 9, 3, INK);
			p.fill(x - 3, y + 2, 7, 1, INK);
			p.fill(x - 2, y + 3, 5, 1, INK);
			p.fill(x - 1, y + 4, 3, 1, INK);
			p.fill(x - 3, y, 7, 1, GOLD);
			p.fill(x - 2, y + 1, 5, 1, GOLD);
			p.fill(x - 1, y + 2, 3, 1, GOLD);
			p.fill(x, y + 3, 1, 1, GOLD);
		}
	}

	/**
	 * What is in a text field, with its caret or its selection while it is
	 * being typed in: the caret blinks between two letters, and selected
	 * letters are dark on light.
	 */
	function typed(p: Painter, x: number, y: number, text: string, selection: Selection | null) {
		p.text(x, y, text, PAPER);
		if (!selection) return;
		const [from, to] = selection;
		if (from === to) {
			if (Date.now() % 1000 < 500) p.fill(x + from * ADVANCE - 1, y - 1, 1, 9, PAPER);
			return;
		}
		p.fill(x + from * ADVANCE - 1, y - 1, (to - from) * ADVANCE + 1, 9, PAPER);
		p.text(x + from * ADVANCE, y, text.slice(from, to), INK);
	}

	/** A button as it is drawn: filled when it is the one chosen. */
	function button(p: Painter, { x, y, w, h }: Box, text: string, on: boolean, off = false) {
		p.fill(x, y, w, h, on ? PAPER : FAINT, on ? 1 : off ? 0.3 : 0.7);
		p.centre(x + (w >> 1), y + ((h - 7) >> 1), text, on ? INK : off ? FAINT : PAPER);
	}

	// The bet slip, over the middle of the track while betting is open: the
	// markets, the cars with their form and what they pay, the stake, and the
	// one button.
	function slip(p: Painter, at: Layout, scene: Scene, dt: number) {
		const { room, pools, left, bets } = scene;
		if (!room || !pools) return;
		const { market, outcome: picked, stake, max, typing, legend, ready, action, note } = scene.slip;
		const figures = Number.isNaN(stake) ? '' : String(stake);
		const { x, y, w, h } = at.slip;
		const urgent = left <= 10;
		p.fill(x - 1, y - 1, w + 2, h + 2, INK, 0.5);
		p.fill(x, y, w, h, INK, 0.94);
		head(p, at.slip, 'Place your bets', clock(left), urgent);
		MARKETS.forEach((m, index) => button(p, at.tabs[index], SHORT[m], m === market));
		p.text(x + 6, y + 36, ASKS[market], DIM);

		const [first, second] = picked?.split('>') ?? [];
		p.text(x + 6, y + 48, 'Cars', DIM);
		p.text(x + 213, y + 48, 'SGAR', legend ? PAPER : DIM);
		// dotted under, as a word with more to say
		for (let dot = 0; dot < 23; dot += 2) p.fill(x + 213 + dot, y + 56, 1, 1, DIM);
		p.right(x + w - 6, y + 48, market === 'exacta' ? 'Pick' : 'Pays', DIM);
		room.grid.forEach((id, place) => {
			const row = at.cars[place];
			const ry = row.y;
			// the stats are the room's, which /admin/race can tune
			const car = { ...entry(id), ...room.settings.cars[id] };
			const condition = CONDITIONS[room.conditions[place]];
			const today = inCondition(car, room.conditions[place]);
			if (single(market) && picked === id) {
				p.fill(row.x, ry, row.w, row.h, PAPER, 0.12);
				p.outline(row.x, ry, row.w, row.h, GOLD);
			}
			p.text(x + 6, ry + 3, String(place + 1), DIM);
			tile(p, x + 15, ry + 2, id);
			p.text(x + 31, ry + 3, car.name, PAPER);
			if (condition.by) {
				p.text(x + 70, ry + 3, condition.by > 0 ? '↑' : '↓', condition.by > 0 ? GOOD : BAD);
			}
			p.text(x + 77, ry + 3, condition.label, condition.by ? DIM : FAINT);
			STATS.forEach((stat, index) => {
				const touched = stat === condition.stat;
				const tall = Math.round(today[stat] * 9);
				p.fill(x + 213 + index * 6, ry + 2, 5, 9, FAINT);
				p.fill(x + 213 + index * 6, ry + 11 - tall, 5, tall, touched ? PAPER : DIM);
				// where the stat usually is, when today it is not
				if (touched) p.fill(x + 213 + index * 6, ry + 11 - Math.round(car[stat] * 9), 5, 1, INK);
			});
			if (market === 'exacta') {
				button(p, at.firsts[place], '1st', first === id);
				button(p, at.seconds[place], '2nd', second === id, !first || first === id);
			} else if (market === 'clean') {
				// a clean race is not a bet on a car: the cars are there as the
				// form guide, and the column says no car pays anything
				p.right(x + w - 6, ry + 3, '--', FAINT);
			} else {
				const odds = glide(`${market} ${id}`, pays(pools[market], market, id), dt);
				p.right(x + w - 6, ry + 3, times(odds), PAPER);
			}
		});

		// what is picked, and what the stake would return on it
		const complete = market === 'exacta' ? second !== undefined : picked !== null;
		if (market === 'clean') {
			(['yes', 'no'] as const).forEach((answer, index) => {
				const odds = glide(`clean ${answer}`, pays(pools.clean, 'clean', answer), dt);
				button(p, at.clean[index], `${label('clean', answer)} ${times(odds)}`, picked === answer);
			});
		} else if (complete && picked) {
			const after = outcome(p, x + 6, y + 149, market, picked);
			const named = p.text(after + 2, y + 150, label(market, picked), PAPER);
			// a pair has no row to show what it pays, so it is said here
			if (market === 'exacta') {
				const odds = glide(`exacta ${picked}`, pays(pools.exacta, 'exacta', picked), dt);
				p.text(named + 5, y + 150, times(odds), DIM);
			}
		} else {
			p.text(x + 6, y + 150, market === 'exacta' ? 'Pick 1st, then 2nd' : 'Pick a car', DIM);
		}
		const returns =
			complete && picked
				? chips(Math.floor((stake || 0) * pays(pools[market], market, picked)))
				: '-';
		p.right(x + w - 6, y + 150, `${chips(stake || 0)}→${returns}`, PAPER);

		STAKES.forEach((value, index) =>
			button(p, at.stakes[index], String(value), stake === (value === 'Max' ? max : value))
		);
		const field = at.input;
		p.fill(field.x, field.y, field.w, field.h, INK);
		p.outline(field.x, field.y, field.w, field.h, typing ? GOLD : FAINT);
		const fx = field.x + field.w - 6 - measure(figures);
		typed(p, fx, field.y + 4, figures, typing ? scene.slip.selection : null);

		const place = at.place;
		p.fill(place.x, place.y, place.w, place.h, ready ? GOLD : FAINT, ready ? 1 : 0.6);
		p.centre(place.x + (place.w >> 1), place.y + 5, action, ready ? INK : DIM);
		p.text(
			x + 6,
			y + 205,
			clip(
				note?.text ?? `${bets.length} of ${MAX_BETS} bets · returns at the current odds`,
				w - 12
			),
			note ? (note.bad ? BAD : GOOD) : DIM
		);

		// what the four bars are, where the layout leaves room for it
		if (legend) {
			const { x: lx, y: ly, w: lw, h: lh } = at.key;
			p.fill(lx - 1, ly - 1, lw + 2, lh + 2, INK, 0.5);
			p.fill(lx, ly, lw, lh, INK, 0.96);
			LEGEND.forEach(([name, meaning], index) => {
				p.text(lx + 5, ly + 5 + index * 21, name[0], GOLD);
				p.text(lx + 17, ly + 5 + index * 21, name, PAPER);
				p.text(lx + 17, ly + 14 + index * 21, meaning, DIM);
			});
		}
	}

	// The payoff, in the middle of the track: one number for how the race went for you,
	// then what settled the bets.
	function result(p: Painter, at: Box, scene: Scene, dt: number) {
		const { x, y } = at;
		const { room, bets, you } = scene;
		p.fill(x - 1, y - 1, at.w + 2, at.h + 2, INK, 0.5);
		p.fill(x, y, at.w, at.h, INK, 0.94);
		head(p, at, 'Your race', '');
		const net = netOf(bets);
		if (bets.length === 0) p.text(x + 5, y + 20, 'No bets', DIM, 2);
		else if (net === null) p.text(x + 5, y + 20, '…', DIM, 2);
		else p.text(x + 5, y + 20, signed(net), net > 0 ? GOOD : net < 0 ? BAD : PAPER, 2);
		if (you) p.text(x + 5, y + 39, `Balance ${chips(glide('balance', you.balance, dt))}`, DIM);
		p.fill(x + 5, y + 50, at.w - 10, 1, FAINT);
		const facts: [string, string | null | undefined][] = [
			['Winner', room?.result?.order[0]],
			['Fast lap', room?.result?.fastest],
			['First out', room?.result?.firstOut]
		];
		facts.forEach(([name, id], index) => {
			const ry = y + 55 + index * 12;
			p.text(x + 5, ry + 1, name, DIM);
			if (id) p.text(tile(p, x + 68, ry, id), ry + 1, entry(id).name, PAPER);
			else p.text(x + 68, ry + 1, 'Nobody', FAINT);
		});
	}

	// Your name, where you stand, and the way out of debt, over everything
	// else, which goes dark behind it.
	function settings(p: Painter, at: Layout['menu'], scene: Scene, menu: Menu) {
		const { you, room } = scene;
		if (!you) return;
		const debt = you.balance < 0;
		const { x, y, w } = at.panel;
		const h = debt ? 170 : 91;
		p.fill(0, 0, p.width, p.height, INK, 0.55);
		p.fill(x - 1, y - 1, w + 2, h + 2, INK, 0.5);
		p.fill(x, y, w, h, INK, 0.96);
		head(p, at.panel, 'Settings', '×');

		p.text(x + 6, y + 20, 'Name', DIM);
		const field = at.name;
		p.fill(field.x, field.y, field.w, field.h, INK);
		p.outline(field.x, field.y, field.w, field.h, menu.typing ? GOLD : FAINT);
		typed(p, field.x + 5, field.y + 4, menu.name, menu.typing ? menu.selection : null);
		button(p, at.save, 'Save', false, !menu.fresh);
		if (menu.note) p.text(x + 6, y + 50, clip(menu.note.text, w - 12), menu.note.bad ? BAD : GOOD);

		p.fill(x + 6, y + 62, w - 12, 1, FAINT);
		const facts: [string, string, number][] = [['Balance', chips(you.balance), debt ? BAD : PAPER]];
		if (debt) {
			facts.push(['Credit left', chips(you.balance + (room?.settings.debtCap ?? 0)), PAPER]);
		}
		facts.push(['Bankruptcies', String(you.bankruptcies), PAPER]);
		facts.forEach(([name, value, colour], index) => {
			p.text(x + 6, y + 67 + index * 11, name, DIM);
			p.right(x + w - 6, y + 67 + index * 11, value, colour);
		});
		if (!debt) return;

		p.fill(x + 6, y + 102, w - 12, 1, FAINT);
		const start = chips(room?.settings.start ?? 0);
		wrap(
			`Wipes your debt and puts you back to ${start} chips. It is counted on the leaderboard.`,
			w - 12
		).forEach((line, index) => p.text(x + 6, y + 107 + index * 9, line, DIM));
		if (menu.sure) {
			p.text(x + 6, y + 142, 'Are you sure?', PAPER);
			p.fill(at.confirm.x, at.confirm.y, at.confirm.w, at.confirm.h, ALARM);
			p.centre(at.confirm.x + (at.confirm.w >> 1), at.confirm.y + 4, 'Confirm', PAPER);
			button(p, at.cancel, 'Cancel', false);
		} else {
			p.fill(at.bankrupt.x, at.bankrupt.y, at.bankrupt.w, at.bankrupt.h, ALARM);
			p.centre(
				at.bankrupt.x + (at.bankrupt.w >> 1),
				at.bankrupt.y + 4,
				'Declare bankruptcy',
				PAPER
			);
		}
		if (menu.refusal) p.text(x + 6, y + 157, clip(menu.refusal, w - 12), BAD);
	}

	return {
		/** Draws everything over the race, `dt` seconds after the last time. */
		draw(frame: Painter, at: Layout, scene: Scene, dt: number) {
			const p = enlarge(frame, at.unit);
			const { room } = scene;
			// a new race starts from its own numbers, not from the last one's
			if (room && room.round !== round) {
				round = room.round;
				running = [];
				gaps.clear();
				read = Infinity;
				const balance = shown.get('balance');
				shown.clear();
				if (balance !== undefined) shown.set('balance', balance);
			}
			markers(p, at, scene);
			// the panels, as far up their pane as it is scrolled, and only inside it
			const up = (place: Box) => ({ ...place, y: place.y - scene.pan });
			p.clip(at.pane);
			tower(p, up(at.tower), scene, dt);
			leaderboard(p, up(at.board), scene);
			ticker(p, up(at.ticker), scene);
			wallet(p, up(at.wallet), scene, dt);
			yours(p, up(at.bets), scene);
			p.clip(null);
			if (room?.phase === 'betting') slip(p, at, scene, dt);
			else if (room?.phase === 'results') result(p, at.card, scene, dt);
			else if (room?.phase !== 'racing') {
				const card = { ...at.card, y: at.card.y + 32, h: 28 };
				p.fill(card.x, card.y, card.w, card.h, INK, 0.94);
				p.centre(
					card.x + (card.w >> 1),
					card.y + 10,
					room ? 'The next race starts soon' : 'Connecting…',
					PAPER
				);
			}
			if (scene.menu) settings(p, at.menu, scene, scene.menu);
		}
	};
}
