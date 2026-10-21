import { Chess, type Color, type Square } from 'chess.js';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Board } from '~/components/chess/Board';
import { Picker } from '~/components/chess/Picker';
import {
	ACCENT_BUTTON,
	LiveThinking,
	MoveList,
	Pulse,
	Section,
	Switch
} from '~/components/chess/Rail';
import { Button } from '~/components/ui/button';
import { findMentions, mentionKey, type Mention } from '~/lib/chess/mentions';
import {
	defaultModel,
	findCached,
	findModel,
	readDevice,
	type ChessModel,
	type DeviceInfo
} from '~/lib/chess/models';
import { findMove, splitReply, type PromptInput } from '~/lib/chess/prompt';
import {
	loadGame,
	loadSettings,
	saveGame,
	saveSettings,
	type Entry,
	type SavedGame,
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

// a board highlight fades this long after the model last mentions it
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

function promptInput(chess: Chess, think: boolean, model: ChessModel, retry?: string): PromptInput {
	return {
		color: chess.turn() === 'w' ? 'white' : 'black',
		fen: chess.fen(),
		board: chess.ascii(),
		history: chess.history(),
		legal: chess.moves({ verbose: true }).map((move) => ({ san: move.san, uci: move.lan })),
		think,
		thinking: model.thinking,
		retry
	};
}

function outcome(chess: Chess, model: ChessModel): string | undefined {
	if (chess.isCheckmate()) {
		return chess.turn() === YOU ? `${model.name} wins by checkmate` : 'You win by checkmate';
	}
	if (chess.isStalemate()) return 'Draw by stalemate';
	if (chess.isInsufficientMaterial()) return 'Draw: not enough pieces left to mate';
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
	const [mentions, setMentions] = useState<Mention[]>([]);
	const { state: opponent, load, ask, finish: moveNow, stop } = useOpponent();

	const marks = useRef(new Map<string, { mention: Mention; at: number }>());
	const scanned = useRef(0);

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
		move: string | { from: Square; to: Square; promotion: 'q' },
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

	function onMove(from: Square, to: Square): boolean {
		if (phase !== 'playing' || chess.turn() !== YOU) return false;
		try {
			play({ from, to, promotion: 'q' }, { by: 'you' });
			return true;
		} catch {
			return false;
		}
	}

	function showMarks() {
		setMentions([...marks.current.values()].map(({ mention }) => mention));
	}

	const aiTurn = phase === 'playing' && chess.turn() !== YOU && !chess.isGameOver();
	const ready = opponent.status === 'ready';

	// The model's turn: ask, check the answer, ask once more naming the
	// mistake, and after a second miss play a random legal move, flagged.
	// Returns what cancels it.
	const takeTurn = useEffectEvent(() => {
		if (!model) return;
		const current = model;
		const { think, showThinking } = settings;
		let cancelled = false;
		const started = Date.now();
		const thoughts: string[] = [];
		const missed: string[] = [];
		marks.current.clear();
		scanned.current = 0;

		const notice = (text: string, stage: Live['stage']) => {
			setLive({ text, started, stage, retry: missed.at(-1) });
			if (!showThinking) return;
			// Only up to the last finished phrase, so "my knight" isn't read
			// before " on g8" arrives, with a little overlap for a move split
			// across two streamed pieces.
			const end = Math.max(...[...'.,;:!?\n'].map((mark) => text.lastIndexOf(mark))) + 1;
			if (end <= scanned.current) return;
			const found = findMentions(text.slice(Math.max(0, scanned.current - 12), end), chess);
			scanned.current = end;
			const at = Date.now();
			for (const mention of found) marks.current.set(mentionKey(mention), { mention, at });
			showMarks();
		};

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
				missed: missed.length ? missed : undefined
			});
		};

		void (async () => {
			for (let attempt = 0; attempt < 2; attempt++) {
				const input = promptInput(chess, think, current, missed.at(-1));
				const before = thoughts.join('\n\n');
				setLive({ text: before, started, stage: 'reading', retry: missed.at(-1) });
				try {
					const reply = await ask(input, (partial) => {
						if (cancelled) return;
						const { thinking, answer, closed } = splitReply(partial.text, partial.opened);
						const writing = !think || closed || answer !== '';
						notice(
							before && thinking ? `${before}\n\n${thinking}` : before || thinking,
							writing ? 'answering' : 'thinking'
						);
					});
					if (cancelled) return;
					const { thinking, answer } = splitReply(reply.text, reply.opened);
					if (thinking) thoughts.push(thinking);
					const { move, candidate } = findMove(answer || reply.text, input.legal);
					if (move) return finish(move);
					missed.push(candidate ?? 'nothing');
				} catch (error) {
					if (cancelled) return;
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

	// the thinking timer, and fading the board highlights
	useEffect(() => {
		if (!live) return;
		const timer = setInterval(() => {
			const time = Date.now();
			for (const [key, { at }] of marks.current) {
				if (time - at > MARK_MS) marks.current.delete(key);
			}
			setMentions([...marks.current.values()].map(({ mention }) => mention));
			setNow(time);
		}, 250);
		return () => clearInterval(timer);
	}, [live]);

	function reset(next: Phase) {
		stop();
		chess.reset();
		setFen(chess.fen());
		setEntries([]);
		setResult(undefined);
		setLive(undefined);
		setMentions([]);
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
		setResult(`You resigned; ${model.name} wins`);
		setPhase('over');
	}

	async function copyPgn() {
		try {
			await navigator.clipboard.writeText(chess.pgn());
			toast('Game copied as PGN');
		} catch {
			toast('Couldn’t copy the game');
		}
	}

	const update = (change: Partial<Settings>) => setSettings({ ...settings, ...change });
	const history = chess.history({ verbose: true });
	const last = history.at(-1);
	const showThinking = settings.showThinking;

	return (
		<div className="chess grid gap-8 xl:grid-cols-[1fr_auto_1fr] xl:items-start">
			{/* Beside the board on wide screens, both columns are as tall as the board
			    and no taller: the opponent on the left, with its thinking, and the game
			    on the right, its last button level with the board's foot. On a phone
			    they stack under the board. */}
			<section
				className={cn(
					'order-2 mx-auto flex w-full max-w-[40rem] flex-col gap-2 xl:order-1 xl:mx-0 xl:h-0 xl:min-h-full xl:max-w-72 xl:justify-self-end',
					phase === 'setup' && 'max-xl:hidden'
				)}
			>
				{phase !== 'setup' && model && (
					<>
						<Section label="opponent">
							<p className="font-medium">{model.name}</p>
							<Status
								phase={phase}
								state={opponent}
								aiTurn={aiTurn}
								live={live}
								now={now}
								result={result}
								gpu={device?.webgpu ?? false}
								onMoveNow={moveNow}
								onPickAnother={() => reset('setup')}
							/>
						</Section>
						{live && showThinking && <LiveThinking text={live.text} />}
					</>
				)}
			</section>
			<div className="order-1 mx-auto w-full max-w-[min(40rem,calc(100dvh-9rem))] xl:order-2 xl:w-[min(40rem,calc(100dvh-9rem))]">
				<Board
					chess={chess}
					fen={fen}
					orientation="white"
					canMove={phase === 'playing' && chess.turn() === YOU}
					lastMove={last && { from: last.from, to: last.to }}
					mentions={live && showThinking ? mentions : []}
					onMove={onMove}
				/>
			</div>
			<aside className="order-3 mx-auto flex w-full max-w-[40rem] flex-col gap-8 xl:mx-0 xl:h-0 xl:min-h-full xl:max-w-72">
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
								<MoveList entries={entries} />
							</Section>
						</>
					)
				)}
			</aside>
		</div>
	);
}

// One line on what the model is doing right now, in plain words, and only
// "Thinking" while it really is.
function Status({
	phase,
	state,
	aiTurn,
	live,
	now,
	result,
	gpu,
	onMoveNow,
	onPickAnother
}: {
	phase: Phase;
	state: ReturnType<typeof useOpponent>['state'];
	aiTurn: boolean;
	live?: Live;
	now: number;
	result?: string;
	// where the weights go once downloaded
	gpu: boolean;
	onMoveNow: () => void;
	onPickAnother: () => void;
}) {
	if (phase === 'over') return <p className="text-sm text-foreground/70">{result}</p>;
	if (state.status === 'error') {
		return (
			<div className="flex flex-col items-start gap-2 text-sm text-pretty text-foreground/60">
				<p>
					Couldn’t load {state.model.name}. It may need more memory or storage than this device has
					free. A smaller model should work.
				</p>
				<Button variant="outline" size="sm" onClick={onPickAnother}>
					Pick another model
				</Button>
			</div>
		);
	}
	if (state.status === 'loading') {
		const label = {
			starting: 'Starting up',
			downloading: `Downloading ${Math.round(state.progress * 100)}%`,
			preparing: gpu ? 'Loading onto the GPU' : 'Loading into memory',
			warming: 'Warming up'
		}[state.stage];
		return (
			<div className="flex flex-col gap-2 text-sm text-foreground/60">
				<Line label={label} note={aiTurn ? undefined : 'your move'} />
				{state.stage === 'downloading' && (
					<>
						<div className="h-1 overflow-hidden rounded-full bg-foreground/10">
							<div
								className="h-full rounded-full bg-(--chess-accent) transition-[width] duration-300"
								style={{ width: `${state.progress * 100}%` }}
							/>
						</div>
						<p className="text-xs text-foreground/40">Only the first time; the browser keeps it.</p>
					</>
				)}
			</div>
		);
	}
	if (aiTurn && live) {
		const seconds = Math.max(0, Math.floor((now - live.started) / 1000));
		const label = {
			reading: 'Reading the board',
			thinking: `Thinking ${seconds}s`,
			answering: 'Choosing a move'
		}[live.stage];
		return (
			<div className="flex flex-col gap-1 text-sm text-foreground/60">
				<div className="flex items-center justify-between gap-2">
					<Line label={label} />
					{live.stage === 'thinking' && (
						<Button variant="ghost" size="xs" onClick={onMoveNow}>
							Move now
						</Button>
					)}
				</div>
				{live.retry && (
					<p className="text-xs text-pretty text-foreground/40">
						Asked again: “{live.retry}” isn’t a legal move.
					</p>
				)}
			</div>
		);
	}
	// its turn, between the model being ready and the turn starting
	if (aiTurn) return <Line label="Getting ready" />;
	return <p className="text-sm text-foreground/60">Your move</p>;
}

function Line({ label, note }: { label: string; note?: string }) {
	return (
		<p className="flex items-center gap-2 text-sm text-foreground/60">
			<Pulse />
			{label}
			{note && <span className="text-foreground/40">· {note}</span>}
		</p>
	);
}
