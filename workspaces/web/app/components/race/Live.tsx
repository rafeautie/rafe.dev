import { useCallback, useEffect, useRef, useState } from 'react';
import type { Pools } from '~/lib/race/betting';
import { Game, type Paint } from './Game';
import { MIN_H, MIN_W, fit, layout } from './hud';
import { entry, type Running, type Tick } from './shared';
import { createReplay, unpack, type Replay } from '~/lib/race/recording';
import { STANDING_BY, createRenderer, type CarView } from '~/lib/race/render';
import type { Bet, FromRoom, RoomState, Standing, ToRoom } from '~/lib/race/room';
import { ROSTER } from '~/lib/race/roster';
import { LAPS, createRace, rank } from '~/lib/race/sim';
import { createSound, type Sound } from '~/lib/race/sound';
import { TRACK } from '~/lib/race/track';

// The race everybody is watching. The page holds a socket to the race room
// and shows whatever the room says is happening: the cars waiting on the
// grid while betting is open, then the race, played from the recording the
// room sends at the moment the room's clock says it has reached, then the
// result. It runs no race of its own, so every page shows the same one.
//
// The race is drawn in a frame fitted to the space the page gives it, with
// the game's graphics drawn over it each frame (Game.tsx, hud.ts).

export default function Live() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const stage = useRef<HTMLDivElement>(null);
	const [view, setView] = useState(() => fit(MIN_W, MIN_H, 1));
	const paint = useRef<Paint | null>(null);
	const setPaint = useCallback((next: Paint) => {
		paint.current = next;
	}, []);
	const [room, setRoom] = useState<RoomState | null>(null);
	/** Seconds left in the phase, by the room's clock. */
	const [left, setLeft] = useState(0);
	const [sound, setSound] = useState(false);
	// what the betting shows, each from the room's latest word on it
	const [pools, setPools] = useState<Pools | null>(null);
	const [you, setYou] = useState<Standing | null>(null);
	const [bets, setBets] = useState<Bet[]>([]);
	const [board, setBoard] = useState<Standing[]>([]);
	const [ticker, setTicker] = useState<Tick[]>([]);
	const [problem, setProblem] = useState<string | null>(null);
	// the running order, a few times a second rather than every frame
	const [running, setRunning] = useState<Running | null>(null);
	const socket = useRef<WebSocket | null>(null);
	const audio = useRef<Sound | null>(null);

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

	// says whether it went, so the page can tell a bet that is waiting from one that never left
	const send = useCallback((message: ToRoom) => {
		if (socket.current?.readyState !== WebSocket.OPEN) return false;
		// a new bet is a new question: the last refusal is not about it
		if (message.type === 'bet') setProblem(null);
		socket.current.send(JSON.stringify(message));
		return true;
	}, []);

	useEffect(() => {
		const renderer = createRenderer(canvas.current!);
		let state: RoomState | null = null;
		let replay: Replay | null = null;
		// the cars sitting on the grid, shown until there is a race to show
		let waiting: CarView[] = [];
		// how far the room's clock is ahead of this one
		let ahead = 0;
		// the race time last drawn, or -1 before any
		let shown = -1;
		// when the running order was last lifted out for the page
		let lifted = 0;
		// when the last frame was drawn
		let drawn = performance.now();

		// the frame is as big as the space it has, and the track sits where the layout puts it
		function size() {
			const { clientWidth, clientHeight } = stage.current!;
			if (!clientWidth || !clientHeight) return;
			const next = fit(clientWidth, clientHeight, devicePixelRatio);
			const { track } = layout(next);
			renderer.resize(next.width, next.height, track.x, track.y, next.zoom);
			setView(next);
		}
		size();
		const resized = new ResizeObserver(size);
		resized.observe(stage.current!);

		// the round the ticker is for, so it starts over with each new one
		let ticked = -1;
		function countDown() {
			if (state) setLeft(Math.max(0, Math.ceil((state.endsAt - Date.now() - ahead) / 1000)));
		}
		let again: ReturnType<typeof setTimeout>;
		let gone = false;
		function connect() {
			const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/race/socket`);
			socket.current = ws;
			ws.binaryType = 'arraybuffer';
			ws.onopen = () =>
				ws.send(JSON.stringify({ type: 'sync', sent: Date.now() } satisfies ToRoom));
			ws.onmessage = ({ data }) => {
				if (typeof data !== 'string') {
					const next = createReplay(unpack(new Uint8Array(data)), ROSTER);
					// A second recording of the race being shown: a caution has been
					// thrown by hand, and the race from there on is another one. It is
					// the same up to now, so it carries on from where this one is.
					if (replay && state?.phase === 'racing' && shown >= 0) next.seek(shown);
					else shown = -1;
					replay = next;
					return;
				}
				const message = JSON.parse(data) as FromRoom;
				if (message.type === 'sync') {
					// the reply left the room about halfway through the round trip
					ahead = message.now - (message.sent + Date.now()) / 2;
					return;
				}
				if (message.type === 'you') {
					setYou(message.you);
					setBets(message.bets);
					setProblem(null);
					return;
				}
				if (message.type === 'bet') {
					const { name, market, outcome, stake, pool } = message;
					setPools(
						(pools) => pools && { ...pools, [market]: { ...pools[market], [outcome]: pool } }
					);
					setTicker((ticker) => [{ name, market, outcome, stake }, ...ticker].slice(0, 40));
					return;
				}
				if (message.type === 'board') {
					setBoard(message.board);
					return;
				}
				if (message.type === 'no') {
					setProblem(message.reason);
					return;
				}
				state = message.state;
				setPools(message.pools);
				if (state.phase === 'betting') {
					replay = null;
					setRunning(null);
					renderer.reset();
					waiting = createRace(0, state.grid.map(entry)).cars;
					// the state is repeated during betting; only a new round clears the ticker
					if (state.round !== ticked) {
						setTicker([]);
						setProblem(null);
						// last race's bets are settled and gone; on first arrival the room's own word stands
						if (ticked !== -1) setBets([]);
					}
					ticked = state.round;
				}
				setRoom(state);
				// at once, not on the next tick, so the new phase is never shown
				// with the last one's time left
				countDown();
			};
			// the room drops its sockets now and then, a deploy for one
			ws.onclose = () => {
				if (!gone) again = setTimeout(connect, 2000);
			};
		}
		connect();

		const countdown = setInterval(countDown, 250);

		let frame = requestAnimationFrame(function tick() {
			frame = requestAnimationFrame(tick);
			let cars = waiting;
			// the replay, while it is what is being shown
			let showing: Replay | null = null;
			let moved = 0;
			if (replay && state && state.phase !== 'betting') {
				const time = Math.min(replay.duration, (Date.now() + ahead - state.startsAt) / 1000);
				const events = replay.seek(time);
				if (shown >= 0 && time >= shown && time - shown < 0.5) {
					moved = time - shown;
					for (const event of events) {
						renderer.event(event, replay.cars[event.car]);
						audio.current?.event(event);
					}
				} else {
					// A jump: joining late, or the tab coming back from the
					// background. The marks on the track are from another moment.
					renderer.reset();
				}
				shown = Math.max(0, time);
				cars = replay.cars;
				showing = replay;
				const now = performance.now();
				if (now - lifted > 250) {
					lifted = now;
					const order = rank(replay.cars);
					// laps ended under caution are run again, so they are not counted
					const { extra } = replay;
					setRunning({
						order: order.map((car) => car.entry.id),
						cars: Object.fromEntries(
							replay.cars.map((car) => [
								car.entry.id,
								{
									fraction: Math.max(
										0,
										Math.min(1, car.progress / TRACK.length / LAPS - extra / LAPS)
									),
									lap: car.laps - extra,
									retired: car.retired,
									finished: car.finishTime > 0
								}
							])
						),
						anyOut: replay.cars.some((car) => car.retired),
						flag: replay.flag
					});
				}
			}
			const now = performance.now();
			const dt = Math.min(0.1, (now - drawn) / 1000);
			drawn = now;
			renderer.draw(
				cars,
				moved,
				{ line: false, hulls: false },
				showing ? { trucks: showing.trucks, caution: showing.flag === 'yellow' } : STANDING_BY,
				(painter) => paint.current?.(painter, cars, showing, dt)
			);
			audio.current?.update(replay?.cars ?? [], moved);
		});

		return () => {
			gone = true;
			clearTimeout(again);
			clearInterval(countdown);
			cancelAnimationFrame(frame);
			resized.disconnect();
			socket.current?.close();
		};
	}, []);

	return (
		<Game
			room={room}
			left={left}
			pools={pools}
			you={you}
			bets={bets}
			board={board}
			ticker={ticker}
			problem={problem}
			running={running}
			sound={sound}
			setSound={setSound}
			send={send}
			view={view}
			stage={stage}
			setPaint={setPaint}
		>
			<canvas ref={canvas} className="block size-full" />
		</Game>
	);
}
