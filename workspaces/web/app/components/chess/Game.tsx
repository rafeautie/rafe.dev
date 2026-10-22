import { Chess, type Color, type Move, type Square } from 'chess.js';
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	FlagIcon,
	HandshakeIcon,
	InfoIcon,
	TriangleAlertIcon,
	TrophyIcon
} from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Board } from '~/components/chess/Board';
import { MarksKey } from '~/components/chess/Key';
import { Picker } from '~/components/chess/Picker';
import {
	ACCENT_BUTTON,
	Generation,
	MoveList,
	Pulse,
	Section,
	Switch
} from '~/components/chess/Rail';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Spinner } from '~/components/ui/spinner';
import { findFacts, safeMoves } from '~/lib/chess/facts';
import { findConsidered, mentionKey, type Mention } from '~/lib/chess/mentions';
import { FADE_MS, type Highlight, type Promotion } from '~/components/chess/Board';
import {
	defaultModel,
	findCached,
	findModel,
	readDevice,
	type ChessModel,
	type DeviceInfo
} from '~/lib/chess/models';
import { drawBoard, findMove, splitReply, type PromptInput } from '~/lib/chess/prompt';
import {
	loadGame,
	loadSettings,
	saveGame,
	saveSettings,
	type Entry,
	type SavedGame,
	type Speed,
	type Settings
} from '~/lib/chess/storage';
import { useOpponent } from '~/lib/chess/use-opponent';
import { cn } from '~/lib/utils';

// A game of chess against a small language model running in the browser. The
// board sits in the middle with a rail beside it: the opponent picker before a
// game, and during one the model's status, its thinking as it streams, the two
// switches and the moves. chess.js keeps the rules; the model only suggests.

type Phase = 'setup' | 'playing' | 'over';

// the player is always white, the model always black
const YOU: Color = 'w';

// a board highlight stays this long after the model last writes, and fades
// out over the last FADE_MS of that
const MARK_MS = 2500;

// The model's turn as it happens: reading the prompt before its first word,
// thinking, then writing its move. `retry` is the answer it gave before that
// wasn't a legal move, when it is being asked again.
type Live = {
	text: string;
	started: number;
	stage: 'reading' | 'thinking' | 'answering';
	retry?: string;
};

function promptInput(chess: Chess, think: boolean, retry?: string): PromptInput {
	return {
		color: chess.turn() === 'w' ? 'white' : 'black',
		board: drawBoard(chess.board()),
		history: chess.history(),
		legal: chess.moves({ verbose: true }).map((move) => ({ san: move.san, uci: move.lan })),
		facts: findFacts(chess),
		candidates: safeMoves(chess),
		think,
		retry
	};
}

// What a row of the move list looks like when pointed at: the position after
// it, its last move, and the model's turn in it with the moves it considered
// drawn on the board
function previewOf(row: number | undefined, history: Move[], entries: Entry[]) {
	if (row === undefined || row * 2 >= history.length) return undefined;
	const lastPly = Math.min(row * 2 + 1, history.length - 1);
	const ply = row * 2 + 1;
	const entry = entries[ply];
	const ai = entry?.by === 'ai' && history[ply] ? { entry, move: history[ply] } : undefined;
	const marks: Highlight[] = ai?.entry.thinking
		? findConsidered(`${ai.entry.thinking}\n`, new Chess(ai.move.before)).map(
				({ mention, threat }) => ({ ...mention, fading: false, threat })
			)
		: [];
	// what it weighed points from where the pieces stood before its move, so
	// with its thinking the board shows that position, after your move
	if (marks.length && ai) return { fen: ai.move.before, last: history[ply - 1], ai, marks };
	return { fen: history[lastPly].after, last: history[lastPly], ai, marks };
}

function outcome(chess: Chess, model: ChessModel): string | undefined {
	if (chess.isCheckmate()) {
		return chess.turn() === YOU ? `${model.name} wins by checkmate` : 'You win by checkmate';
	}
	if (chess.isStalemate()) return 'Draw by stalemate';
	if (chess.isInsufficientMaterial()) return 'Draw, as neither side can mate';
	if (chess.isThreefoldRepetition()) return 'Draw by threefold repetition';
	if (chess.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule';
	return undefined;
}

// The game left from last time, if its model is still on the list
function restoreGame(chess: Chess): (SavedGame & { opponent: ChessModel }) | undefined {
	const game = loadGame();
	const opponent = findModel(game?.model);
	if (!game || !opponent) return undefined;
	try {
		chess.loadPgn(game.pgn);
		return { ...game, opponent };
	} catch {
		chess.reset();
		return undefined;
	}
}

export default function Game() {
	const [chess] = useState(() => new Chess());
	// read once; the game only renders in the browser, where storage is
	const [saved] = useState(() => restoreGame(chess));
	const [fen, setFen] = useState(() => chess.fen());
	const [entries, setEntries] = useState<Entry[]>(saved?.entries ?? []);
	const [phase, setPhase] = useState<Phase>(saved ? (saved.result ? 'over' : 'playing') : 'setup');
	const [result, setResult] = useState(saved?.result);
	const [settings, setSettings] = useState(loadSettings);
	const [model, setModel] = useState(() => saved?.opponent ?? findModel(settings.model));
	const [device, setDevice] = useState<DeviceInfo>();
	const [cached, setCached] = useState(new Set<string>());
	// the model's turn in progress: what it has thought so far, and since when
	const [live, setLive] = useState<Live>();
	const [now, setNow] = useState(() => Date.now());
	// what its thinking points at on the board right now
	const [mentions, setMentions] = useState<Highlight[]>([]);
	// the row of the move list being pointed at, shown on the board and rail
	const [preview, setPreview] = useState<number>();
	const { state: opponent, load, ask, stop } = useOpponent();

	const marks = useRef(new Map<string, { mention: Mention; at: number; threat?: boolean }>());

	// What this device can run, and the model for a game left from last time
	useEffect(() => {
		void findCached().then(setCached);
		void readDevice().then((info) => {
			setDevice(info);
			setModel((chosen) => chosen ?? defaultModel(info));
			if (saved && !saved.result) load(saved.opponent, info);
		});
	}, [saved, load]);

	useEffect(() => {
		saveSettings({ ...settings, model: model?.id });
	}, [settings, model]);

	useEffect(() => {
		if (!model) return;
		saveGame(
			phase === 'setup' ? undefined : { pgn: chess.pgn(), model: model.id, entries, result }
		);
	}, [phase, chess, model, entries, result]);

	function play(
		move: string | { from: Square; to: Square; promotion: Promotion },
		entry: Omit<Entry, 'san'>
	) {
		const made = chess.move(move);
		setFen(chess.fen());
		setEntries((previous) => [...previous, { ...entry, san: made.san }]);
		const end = model && outcome(chess, model);
		if (end) {
			setResult(end);
			setPhase('over');
		}
	}

	function onMove(from: Square, to: Square, promotion: Promotion = 'q'): boolean {
		if (phase !== 'playing' || chess.turn() !== YOU) return false;
		try {
			play({ from, to, promotion }, { by: 'you' });
			return true;
		} catch {
			return false;
		}
	}

	// the marks still showing, each as strong as its age allows
	function showMarks(time = Date.now()) {
		const shown: Highlight[] = [];
		for (const [key, { mention, at, threat }] of marks.current) {
			const left = MARK_MS - (time - at);
			if (left <= 0) marks.current.delete(key);
			else shown.push({ ...mention, fading: left <= FADE_MS, threat });
		}
		setMentions(shown);
	}

	const aiTurn = phase === 'playing' && chess.turn() !== YOU && !chess.isGameOver();
	const ready = opponent.status === 'ready';

	// The model's turn: ask, check the answer, ask once more naming the
	// mistake, and after a second miss play a random legal move, flagged.
	// Returns what cancels it.
	const takeTurn = useEffectEvent(() => {
		if (!model) return;
		const { think, showThinking } = settings;
		let cancelled = false;
		const started = Date.now();
		const thoughts: string[] = [];
		const missed: string[] = [];
		marks.current.clear();

		const notice = (text: string, stage: Live['stage']) => {
			setLive({ text, started, stage, retry: missed.at(-1) });
			if (!showThinking) return;
			// Each candidate and the threat, once its line is written, stays
			// until the move is played.
			const at = Date.now();
			for (const { mention, threat } of findConsidered(text, chess))
				marks.current.set(mentionKey(mention), { mention, at, threat });
			showMarks();
		};

		let speed: Speed | undefined;
		const finish = (san: string, random = false) => {
			if (cancelled) return;
			marks.current.clear();
			setMentions([]);
			setLive(undefined);
			play(san, {
				by: 'ai',
				thinking: thoughts.join('\n\n') || undefined,
				seconds: (Date.now() - started) / 1000,
				random: random || undefined,
				missed: missed.length ? missed : undefined,
				speed
			});
		};

		void (async () => {
			for (let attempt = 0; attempt < 2; attempt++) {
				const input = promptInput(chess, think, missed.at(-1));
				const before = thoughts.join('\n\n');
				setLive({ text: before, started, stage: 'reading', retry: missed.at(-1) });
				// what it has thought so far, kept if the turn fails partway
				let partial = '';
				try {
					const reply = await ask(input, (sofar) => {
						if (cancelled) return;
						const { thinking, answer, closed } = splitReply(sofar.text, sofar.opened);
						partial = thinking;
						const writing = !think || closed || answer !== '';
						notice(
							before && thinking ? `${before}\n\n${thinking}` : before || thinking,
							writing ? 'answering' : 'thinking'
						);
					});
					if (cancelled) return;
					const { thinking, answer } = splitReply(reply.text, reply.opened);
					if (thinking) thoughts.push(thinking);
					speed = reply.speed;
					const { move, candidate } = findMove(answer || reply.text, input.legal);
					if (move) return finish(move);
					missed.push(candidate ?? 'nothing');
				} catch (error) {
					if (cancelled) return;
					if (partial) thoughts.push(partial);
					missed.push(`an error: ${error instanceof Error ? error.message : error}`);
					break;
				}
			}
			const moves = chess.moves();
			finish(moves[Math.floor(Math.random() * moves.length)], true);
		})();

		return () => {
			cancelled = true;
			stop();
		};
	});

	useEffect(() => {
		if (aiTurn && ready) return takeTurn();
	}, [aiTurn, ready, fen]);

	// The thinking timer, and fading the board highlights. It keys on whether
	// the model is working, not on `live` itself, which changes with every
	// streamed word and would restart the timer before it ever fired.
	const working = live !== undefined;
	useEffect(() => {
		if (!working) return;
		const timer = setInterval(() => {
			const time = Date.now();
			showMarks(time);
			setNow(time);
		}, 100);
		return () => clearInterval(timer);
	}, [working]);

	function reset(next: Phase) {
		stop();
		chess.reset();
		setFen(chess.fen());
		setEntries([]);
		setResult(undefined);
		setLive(undefined);
		setMentions([]);
		setPreview(undefined);
		setPhase(next);
	}

	function start() {
		if (!model || !device) return;
		reset('playing');
		if (opponent.status === 'idle' || opponent.status === 'error' || opponent.model !== model) {
			load(model, device);
		}
	}

	function resign() {
		if (!model) return;
		stop();
		setLive(undefined);
		setMentions([]);
		setResult('You resigned');
		setPhase('over');
	}

	// The game with its tags filled in: who played, where, when, and how it
	// ended ("*" while it's still going). The saved game keeps the bare moves.
	function pgnToShare() {
		const copy = new Chess();
		copy.loadPgn(chess.pgn());
		const now = new Date();
		const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
			.map((part) => String(part).padStart(2, '0'))
			.join('.');
		const outcome = chess.isCheckmate()
			? chess.turn() === 'w'
				? '0-1'
				: '1-0'
			: chess.isGameOver()
				? '1/2-1/2'
				: phase === 'over'
					? // you resigned, and you play white
						'0-1'
					: '*';
		const tags: [string, string][] = [
			['Event', 'Casual game'],
			['Site', 'rafe.dev/chess'],
			['Date', date],
			['Round', '-'],
			['White', 'You'],
			['Black', model?.name ?? '?'],
			['Result', outcome]
		];
		for (const [key, value] of tags) copy.setHeader(key, value);
		return copy.pgn();
	}

	async function copyPgn() {
		try {
			await navigator.clipboard.writeText(pgnToShare());
			toast('Game copied as PGN');
		} catch {
			toast('Couldn’t copy the game');
		}
	}

	const update = (change: Partial<Settings>) => setSettings({ ...settings, ...change });
	const history = chess.history({ verbose: true });
	const last = history.at(-1);
	const showThinking = settings.showThinking;
	const shown = previewOf(preview, history, entries);
	// the model's turn the rail shows: the row pointed at, or else the one in
	// progress, or else its last
	let lastAi = entries.length - 1;
	while (lastAi >= 0 && entries[lastAi].by !== 'ai') lastAi--;
	const turnShown = shown
		? shown.ai
		: live
			? undefined
			: lastAi >= 0
				? { entry: entries[lastAi], move: history[lastAi] }
				: undefined;
	const statusOf = {
		phase,
		state: opponent,
		aiTurn,
		live,
		now,
		result,
		moves: Math.ceil(history.length / 2),
		gpu: device?.webgpu ?? false,
		onPickAnother: () => reset('setup')
	};
	const status = <StatusCard {...statusOf} />;
	const rows = Math.ceil(entries.length / 2);

	return (
		<div className="chess grid gap-8 xl:grid-cols-[minmax(20rem,1fr)_auto_minmax(20rem,1fr)] xl:items-start">
			{/* Beside the board on wide screens, both columns are as tall as the board
			    and no taller: the opponent on the left, with its thinking, and the game
			    on the right, its last button level with the board's foot. On a phone
			    they stack under the board. */}
			<section
				className={cn(
					'order-2 mx-auto flex w-full max-w-[40rem] flex-col gap-2 xl:order-1 xl:mx-0 xl:h-0 xl:min-h-full xl:max-w-none',
					phase === 'setup' && 'max-xl:hidden'
				)}
			>
				{phase !== 'setup' && model && (
					<>
						<Section label="opponent">
							<p className="font-medium">{model.name}</p>
						</Section>
						{turnShown ? (
							<Generation
								status={status}
								text={turnShown.entry.thinking}
								missed={turnShown.entry.missed}
								speed={turnShown.entry.speed}
								move={turnShown.move}
								random={turnShown.entry.random}
							/>
						) : (
							<Generation
								status={status}
								text={shown ? undefined : live?.text}
								streaming={!shown}
							/>
						)}
					</>
				)}
			</section>
			<div
				id="chess-play"
				className="relative order-1 mx-auto w-full max-w-[min(40rem,calc(100dvh-7.75rem))] scroll-mt-4 xl:order-2 xl:w-(--chess-board) xl:max-w-none"
			>
				{/* Beside the rails, a tag at the top of the board says when it's
				    showing an earlier move rather than the game */}
				{preview !== undefined && (
					<p className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 animate-in rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow-sm ring-1 ring-foreground/10 fade-in max-xl:hidden">
						Viewing move {preview + 1}
					</p>
				)}
				{/* On a phone the rail is under the board, so what the model is doing,
				    or which move you're looking back at, sits over it */}
				{phase !== 'setup' && (
					<div className="mb-2 xl:hidden">
						{preview !== undefined ? (
							<div className="flex h-9 items-center gap-1 text-sm">
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Previous move"
									disabled={preview === 0}
									onClick={() => setPreview(preview - 1)}
								>
									<ChevronLeftIcon />
								</Button>
								<p className="min-w-16 text-center font-medium tabular-nums">Move {preview + 1}</p>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Next move"
									disabled={preview >= rows - 1}
									onClick={() => setPreview(preview + 1)}
								>
									<ChevronRightIcon />
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="ml-auto"
									onClick={() => setPreview(undefined)}
								>
									Back to game
								</Button>
							</div>
						) : (
							<StatusCard {...statusOf} compact />
						)}
					</div>
				)}
				<Board
					chess={chess}
					orientation="white"
					fen={shown?.fen ?? fen}
					canMove={!shown && phase === 'playing' && chess.turn() === YOU}
					lastMove={
						(shown?.last ?? last) && {
							from: (shown?.last ?? last)!.from,
							to: (shown?.last ?? last)!.to
						}
					}
					mentions={shown ? shown.marks : live && showThinking ? mentions : []}
					onMove={onMove}
				/>
			</div>
			<aside className="order-3 mx-auto flex w-full max-w-[40rem] flex-col gap-8 xl:mx-0 xl:h-0 xl:min-h-full xl:max-w-none">
				{phase === 'setup' ? (
					device && model ? (
						<Picker
							device={device}
							model={model}
							cached={cached}
							onModel={setModel}
							onStart={start}
						/>
					) : (
						<p className="text-sm text-foreground/50">Checking what this device can run…</p>
					)
				) : (
					model && (
						<>
							<Section label="settings">
								<div className="flex flex-col gap-3">
									<Switch
										label="Think before moving"
										checked={settings.think}
										onChange={(think) => update({ think })}
									/>
									<Switch
										label="Show its thinking"
										checked={showThinking}
										onChange={(on) => update({ showThinking: on })}
										hint={
											<Popover>
												<PopoverTrigger
													aria-label="What the marks on the board mean"
													render={
														<Button
															variant="ghost"
															size="icon-xs"
															className="text-muted-foreground"
														/>
													}
												>
													<InfoIcon className="size-3.5" />
												</PopoverTrigger>
												{/* `chess` for the board's colors, since it renders outside the page */}
												<PopoverContent side="bottom" align="end" className="chess w-80 p-4">
													<MarksKey />
												</PopoverContent>
											</Popover>
										}
									/>
								</div>
								<div className="mt-3 flex flex-col gap-2">
									{phase === 'playing' ? (
										<Button variant="outline" onClick={resign}>
											Resign
										</Button>
									) : (
										<>
											<Button className={ACCENT_BUTTON} onClick={start}>
												Rematch
											</Button>
											<Button variant="outline" onClick={() => reset('setup')}>
												New opponent
											</Button>
										</>
									)}
								</div>
							</Section>
							<Section
								label="moves"
								className="xl:min-h-0 xl:flex-1"
								action={
									entries.length > 0 && (
										<button
											type="button"
											onClick={copyPgn}
											className="rounded-sm outline-none hover:text-(--chess-accent) focus-visible:ring-2 focus-visible:ring-ring/50"
										>
											copy pgn
										</button>
									)
								}
							>
								<MoveList
									entries={entries}
									preview={preview}
									onPreview={setPreview}
									onTap={() =>
										document
											.getElementById('chess-play')
											?.scrollIntoView({ behavior: 'smooth', block: 'start' })
									}
								/>
							</Section>
						</>
					)
				)}
			</aside>
		</div>
	);
}

// What the model is doing right now, on a card pinned under the chat: always
// there, changing as it goes, and only "Thinking" while it really is.
function StatusCard({
	phase,
	state,
	aiTurn,
	live,
	now,
	result,
	moves,
	gpu,
	onPickAnother,
	compact = false
}: {
	phase: Phase;
	state: ReturnType<typeof useOpponent>['state'];
	aiTurn: boolean;
	live?: Live;
	now: number;
	result?: string;
	// how many moves the game ran, each side's together
	moves: number;
	// where the weights go once downloaded
	gpu: boolean;
	onPickAnother: () => void;
	compact?: boolean;
}) {
	let icon: ReactNode = <Spinner className="text-(--chess-accent)" />;
	let title: string;
	let detail: ReactNode = null;
	let extra: ReactNode = null;

	if (phase === 'over') {
		// the result reads "You win …", "Draw …" or else the model won (or you
		// resigned): outcome() and resign()
		const won = result?.startsWith('You win');
		const drawn = result?.startsWith('Draw');
		icon = won ? (
			<TrophyIcon className="size-4 text-(--chess-mated-it)" />
		) : drawn ? (
			<HandshakeIcon className="size-4 text-muted-foreground" />
		) : (
			<FlagIcon className="size-4 text-(--chess-mated-you)" />
		);
		title = won ? 'You won' : drawn ? 'A draw' : 'You lost';
		// how, without saying again who won: "By checkmate, after 4 moves."
		const how = result?.replace(/^(You win|Draw),? /, '') ?? '';
		detail = `${how.charAt(0).toUpperCase()}${how.slice(1)}, after ${moves} ${moves === 1 ? 'move' : 'moves'}.`;
	} else if (state.status === 'error') {
		icon = <TriangleAlertIcon className="size-4 text-destructive" />;
		title = `Couldn’t load ${state.model.name}`;
		detail = 'It may need more memory or storage than this device has free.';
		extra = (
			<>
				{/* what actually went wrong, for whoever wants to look */}
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer select-none hover:text-foreground">Details</summary>
					<p className="mt-1 break-words select-text">{state.message}</p>
				</details>
				<Button variant="outline" size="sm" className="self-start" onClick={onPickAnother}>
					Pick another model
				</Button>
			</>
		);
	} else if (state.status === 'loading') {
		// one number for both the words and the bar, so they never disagree
		const percent = Math.floor(state.progress * 100);
		title = {
			starting: 'Starting up',
			downloading: `Downloading ${percent}%`,
			preparing: gpu ? 'Loading onto the GPU' : 'Loading into memory',
			warming: 'Warming up'
		}[state.stage];
		detail =
			state.stage === 'downloading'
				? 'Only the first time; the browser keeps it.'
				: aiTurn
					? undefined
					: 'Make your move meanwhile.';
		if (state.stage === 'downloading') {
			extra = (
				<div className="h-1 overflow-hidden rounded-full bg-foreground/10">
					<div
						className="h-full rounded-full bg-(--chess-accent)"
						style={{ width: `${percent}%` }}
					/>
				</div>
			);
		}
	} else if (aiTurn && live) {
		const seconds = Math.max(1, Math.floor((now - live.started) / 1000));
		if (live.stage === 'thinking') icon = <Pulse />;
		title = {
			reading: 'Reading the board',
			thinking: `Thinking · ${seconds}s`,
			answering: 'Choosing a move'
		}[live.stage];
		detail = live.retry
			? `Asked again: “${live.retry}” isn’t a legal move.`
			: live.stage === 'reading' && seconds >= 10
				? `Still reading after ${seconds}s. Some models are slow to start in the browser.`
				: undefined;
	} else if (aiTurn) {
		title = 'Getting ready';
	} else {
		icon = <span className="size-2 rounded-full bg-foreground/30" />;
		title = 'Your move';
		detail = 'It answers as soon as you play.';
	}

	// on a phone, one line over the board, where it's in view while you play
	if (compact)
		return (
			<div role="status" className="flex h-9 min-w-0 items-center gap-2.5 text-sm">
				<span className="flex w-4 shrink-0 justify-center">{icon}</span>
				<p className="shrink-0 font-medium tabular-nums">{title}</p>
				{typeof detail === 'string' && <p className="truncate text-muted-foreground">{detail}</p>}
			</div>
		);

	return (
		<Card
			size="sm"
			role="status"
			className={cn(
				'min-h-18 w-full shrink-0 flex-row items-center gap-3 px-3 py-3',
				// the line over the board says it on a phone, unless there's more
				!extra && 'max-xl:hidden'
			)}
		>
			<span className="flex w-10 shrink-0 justify-center">{icon}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex flex-col gap-0.5">
					<p className="leading-tight font-medium tabular-nums">{title}</p>
					{detail && <p className="text-xs text-pretty text-muted-foreground">{detail}</p>}
				</div>
				{extra}
			</div>
		</Card>
	);
}
