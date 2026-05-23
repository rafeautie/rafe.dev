import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useRaceWebSocket } from '../hooks/useRaceWebSocket';
import type { PublicGameState, PublicPlayer, Card, ClientMessage } from 'shared';

export const Route = createFileRoute('/games/the-race/$gameId')({
	component: GameRoom,
});

function GameRoom() {
	const { gameId } = Route.useParams();
	const { state, playerId, send, connected } = useRaceWebSocket(gameId);

	if (!connected || !state) {
		return (
			<div className="flex h-dvh items-center justify-center">
				<p className="text-black/40">connecting to {gameId}…</p>
			</div>
		);
	}

	if (state.phase === 'lobby') {
		return <LobbyView gameId={gameId} state={state} playerId={playerId} send={send} />;
	}

	if (state.phase === 'qualifying') {
		return <QualifyView state={state} playerId={playerId} send={send} />;
	}

	return (
		<div className="flex h-dvh items-center justify-center">
			<p className="text-xl font-semibold">phase: {state.phase}</p>
		</div>
	);
}

// ─── LobbyView ────────────────────────────────────────────────────────────────

interface LobbyViewProps {
	gameId: string;
	state: PublicGameState;
	playerId: string;
	send: (msg: ClientMessage) => void;
}

function LobbyView({ gameId, state, playerId, send }: LobbyViewProps) {
	const me = state.players.find((p) => p.id === playerId);
	const isHost = me?.isHost ?? false;

	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-8 p-10">
			<div className="flex flex-col items-center gap-2">
				<p className="text-sm font-medium text-black/40 uppercase tracking-widest">game code</p>
				<p className="font-mono text-5xl font-bold tracking-widest">{gameId}</p>
			</div>

			<div className="flex w-full max-w-sm flex-col gap-2">
				<p className="text-sm font-medium text-black/60">Players ({state.players.length}/6)</p>
				<ul className="flex flex-col gap-1">
					{state.players.map((p) => (
						<li
							key={p.id}
							className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-2"
						>
							<span className="font-medium">{p.name}</span>
							<div className="flex items-center gap-2">
								{!p.connected && (
									<span className="text-xs text-black/30">disconnected</span>
								)}
								{p.isHost && (
									<span className="text-xs font-medium text-black/40 uppercase tracking-wide">host</span>
								)}
							</div>
						</li>
					))}
				</ul>
			</div>

			{isHost && (
				<button
					onClick={() => send({ type: 'START_GAME' })}
					disabled={state.players.length < 2}
					className="rounded-lg bg-black px-8 py-3 font-semibold text-white hover:bg-black/80 disabled:opacity-40"
				>
					Start Game
				</button>
			)}

			{!isHost && (
				<p className="text-sm text-black/40">Waiting for host to start…</p>
			)}
		</div>
	);
}

// ─── QualifyView ──────────────────────────────────────────────────────────────

interface QualifyViewProps {
	state: PublicGameState;
	playerId: string;
	send: (msg: ClientMessage) => void;
}

function cardLabel(card: Card): string {
	return card.kind === 'regular' ? String(card.value) : 'R';
}

function QualifyView({ state, playerId, send }: QualifyViewProps) {
	const me = state.players.find((p: PublicPlayer) => p.id === playerId);
	const myCars = state.cars.filter((c) => me?.carIds.includes(c.id));
	const qualifiedSet = new Set(state.qualifiedCarIds);

	// Selection state per car: { [carId]: cardIndex }
	const [selections, setSelections] = useState<Record<number, number>>({});

	const pendingCars = myCars.filter((c) => !qualifiedSet.has(c.id));
	const allSelected = pendingCars.every((c) => selections[c.id] !== undefined);
	const allMyCarsDone = myCars.every((c) => qualifiedSet.has(c.id));

	function handleSubmit() {
		for (const car of pendingCars) {
			const idx = selections[car.id];
			if (idx !== undefined) {
				send({ type: 'QUALIFY', carId: car.id, cardIndices: [idx] });
			}
		}
	}

	const totalCars = state.cars.length;
	const qualifiedCount = state.qualifiedCarIds.length;

	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-8 p-6">
			<div className="flex flex-col items-center gap-1">
				<p className="text-sm font-medium text-black/40 uppercase tracking-widest">Qualifying</p>
				<p className="text-sm text-black/50">
					{qualifiedCount}/{totalCars} cars ready
				</p>
			</div>

			{allMyCarsDone ? (
				<div className="flex flex-col items-center gap-2 rounded-xl border border-black/10 px-8 py-6">
					<p className="font-semibold">Card submitted</p>
					<p className="text-sm text-black/50">
						Waiting for {totalCars - qualifiedCount} more car{totalCars - qualifiedCount !== 1 ? 's' : ''}…
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-6 w-full max-w-xl">
					{myCars.map((car) => {
						if (qualifiedSet.has(car.id)) {
							return (
								<div key={car.id} className="flex flex-col gap-2">
									{myCars.length > 1 && (
										<p className="text-xs font-medium text-black/40 uppercase tracking-wide">Car {car.id}</p>
									)}
									<div className="flex items-center gap-3 rounded-xl border border-black/10 px-4 py-3">
										<p className="text-sm text-black/50">Card submitted — waiting for others…</p>
									</div>
								</div>
							);
						}

						const hand = car.hand ?? [];
						const selected = selections[car.id];

						return (
							<div key={car.id} className="flex flex-col gap-2">
								{myCars.length > 1 && (
									<p className="text-xs font-medium text-black/40 uppercase tracking-wide">Car {car.id}</p>
								)}
								<p className="text-sm text-black/60">
									Pick one card to set your starting position. Highest wins pole.
								</p>
								<div className="flex flex-wrap gap-2">
									{hand.map((card, i) => (
										<button
											key={i}
											onClick={() => setSelections((s) => ({ ...s, [car.id]: i }))}
											className={[
												'h-16 w-12 rounded-lg border-2 font-bold text-lg transition-colors',
												selected === i
													? 'border-black bg-black text-white'
													: 'border-black/20 bg-white text-black hover:border-black/50',
											].join(' ')}
										>
											{cardLabel(card)}
										</button>
									))}
								</div>
							</div>
						);
					})}

					<button
						onClick={handleSubmit}
						disabled={!allSelected}
						className="self-start rounded-lg bg-black px-6 py-2.5 font-semibold text-white hover:bg-black/80 disabled:opacity-40"
					>
						Submit
					</button>
				</div>
			)}

			<div className="flex flex-col gap-1 w-full max-w-xl">
				<p className="text-xs font-medium text-black/40 uppercase tracking-wide">All cars</p>
				<ul className="flex flex-col gap-1">
					{state.players.map((p: PublicPlayer) => (
						<li key={p.id} className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-2 text-sm">
							<span className={p.id === playerId ? 'font-semibold' : ''}>{p.name}</span>
							<span className="text-black/40">
								{p.carIds.every((id) => qualifiedSet.has(id)) ? 'Ready' : 'Choosing…'}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
