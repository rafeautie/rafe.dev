import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useRaceWebSocket } from '../hooks/useRaceWebSocket';
import type { PublicGameState, PublicPlayer, PublicCarState, Card, ClientMessage } from 'shared';

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

	if (state.phase === 'race') {
		return <RaceView state={state} playerId={playerId} send={send} />;
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

// ─── RaceView ─────────────────────────────────────────────────────────────────

interface RaceViewProps {
	state: PublicGameState;
	playerId: string;
	send: (msg: ClientMessage) => void;
}

function RaceView({ state, playerId, send }: RaceViewProps) {
	const me = state.players.find((p) => p.id === playerId);
	const activeCarId = state.pendingThisRound[0];
	const activeCar = state.cars.find((c) => c.id === activeCarId);
	const isMyTurn = me?.carIds.includes(activeCarId ?? -1) ?? false;

	const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);

	useEffect(() => {
		setSelectedCardIdx(null);
	}, [activeCarId]);

	const leaderPos = state.cars.length > 0 ? Math.max(...state.cars.map((c) => c.position)) : 0;
	const occupiedPositions = new Set(state.cars.map((c) => c.position));

	function canExtendCard(card: Card, carPos: number): boolean {
		if (card.kind !== 'regular' || card.value > 3) return false;
		if (card.value === 3 && carPos === leaderPos) return false;
		return !occupiedPositions.has(carPos + 1);
	}

	const hand = activeCar?.hand ?? [];
	const selectedCard = selectedCardIdx !== null ? hand[selectedCardIdx] : undefined;
	const extendValid =
		selectedCard != null && activeCar != null && canExtendCard(selectedCard, activeCar.position);

	function handleAction(type: 'DISCARD' | 'EXTEND') {
		if (selectedCardIdx === null || !activeCar) return;
		send({ type, carId: activeCar.id, cardIndex: selectedCardIdx } as ClientMessage);
		setSelectedCardIdx(null);
	}

	return (
		<div className="flex h-dvh flex-col gap-6 p-6 overflow-y-auto">
			<TrackView state={state} activeCarId={activeCarId} />

			<div className="flex flex-col gap-1">
				<p className="text-sm font-semibold">
					{isMyTurn
						? `Your turn — Car ${activeCar?.id}`
						: activeCar
							? `Car ${activeCar.id}'s turn…`
							: 'Starting next round…'}
				</p>
				{state.endAfterRound && (
					<p className="text-xs text-black/50">Final round — a car is out of cards</p>
				)}
			</div>

			{isMyTurn && activeCar && hand.length > 0 && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<p className="text-xs font-medium text-black/40 uppercase tracking-wide">
							Hand — position {activeCar.position}
							{activeCar.position === leaderPos ? ' (leader)' : ''}
						</p>
						<HandView
							hand={hand}
							selectedIdx={selectedCardIdx}
							activeCar={activeCar}
							leaderPos={leaderPos}
							occupiedPositions={occupiedPositions}
							onSelect={setSelectedCardIdx}
						/>
					</div>
					<ActionPanel
						canDiscard={selectedCardIdx !== null}
						canExtend={extendValid}
						onDiscard={() => handleAction('DISCARD')}
						onExtend={() => handleAction('EXTEND')}
					/>
				</div>
			)}

			<div className="mt-auto flex flex-col gap-2">
				<p className="text-xs font-medium text-black/40 uppercase tracking-wide">Standings</p>
				<StandingsView state={state} playerId={playerId} activeCarId={activeCarId} />
			</div>
		</div>
	);
}

// ─── TrackView ────────────────────────────────────────────────────────────────

function TrackView({ state, activeCarId }: { state: PublicGameState; activeCarId?: number }) {
	if (state.cars.length === 0) return null;

	const maxPos = Math.max(...state.cars.map((c) => c.position));
	const trackLength = maxPos + 4;
	const carsByPos = new Map<number, PublicCarState[]>();
	for (const car of state.cars) {
		const slot = carsByPos.get(car.position) ?? [];
		slot.push(car);
		carsByPos.set(car.position, slot);
	}

	return (
		<div className="flex flex-col gap-1">
			<p className="text-xs font-medium text-black/40 uppercase tracking-wide">Track</p>
			<div className="overflow-x-auto">
				<div className="flex gap-1 min-w-max pb-1">
					{Array.from({ length: trackLength }, (_, pos) => {
						const cars = carsByPos.get(pos) ?? [];
						const hasActive = cars.some((c) => c.id === activeCarId);
						return (
							<div
								key={pos}
								className={[
									'flex min-h-12 w-12 flex-col items-center justify-center gap-0.5 rounded border text-xs',
									cars.length > 0
										? hasActive
											? 'border-black bg-black text-white'
											: 'border-black/40 bg-black/10'
										: 'border-black/10 text-black/20',
								].join(' ')}
							>
								{cars.length > 0 ? (
									cars.map((c) => (
										<span key={c.id} className="font-mono font-bold leading-tight">
											C{c.id}
										</span>
									))
								) : (
									<span>{pos}</span>
								)}
							</div>
						);
					})}
					<div className="flex items-center px-2 text-black/30 text-lg">→</div>
				</div>
			</div>
		</div>
	);
}

// ─── HandView ─────────────────────────────────────────────────────────────────

interface HandViewProps {
	hand: Card[];
	selectedIdx: number | null;
	activeCar: PublicCarState;
	leaderPos: number;
	occupiedPositions: Set<number>;
	onSelect: (idx: number | null) => void;
}

function HandView({ hand, selectedIdx, activeCar, leaderPos, occupiedPositions, onSelect }: HandViewProps) {
	function canExtend(card: Card): boolean {
		if (card.kind !== 'regular' || card.value > 3) return false;
		if (card.value === 3 && activeCar.position === leaderPos) return false;
		return !occupiedPositions.has(activeCar.position + 1);
	}

	return (
		<div className="flex flex-wrap gap-2">
			{hand.map((card, i) => {
				const isSelected = selectedIdx === i;
				const extendable = canExtend(card);
				return (
					<button
						key={i}
						onClick={() => onSelect(isSelected ? null : i)}
						className={[
							'relative flex h-16 w-12 flex-col items-center justify-center rounded-lg border-2 font-bold text-lg transition-colors',
							isSelected
								? 'border-black bg-black text-white'
								: 'border-black/20 bg-white text-black hover:border-black/60',
						].join(' ')}
					>
						{cardLabel(card)}
						{extendable && !isSelected && (
							<span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-black" />
						)}
					</button>
				);
			})}
		</div>
	);
}

// ─── ActionPanel ──────────────────────────────────────────────────────────────

interface ActionPanelProps {
	canDiscard: boolean;
	canExtend: boolean;
	onDiscard: () => void;
	onExtend: () => void;
}

function ActionPanel({ canDiscard, canExtend, onDiscard, onExtend }: ActionPanelProps) {
	return (
		<div className="flex gap-3">
			<button
				onClick={onDiscard}
				disabled={!canDiscard}
				className="rounded-lg border-2 border-black/20 px-5 py-2.5 font-semibold text-black hover:border-black/60 disabled:opacity-40"
			>
				Discard
			</button>
			<button
				onClick={onExtend}
				disabled={!canExtend}
				className="rounded-lg bg-black px-5 py-2.5 font-semibold text-white hover:bg-black/80 disabled:opacity-40"
			>
				Extend
			</button>
		</div>
	);
}

// ─── StandingsView ────────────────────────────────────────────────────────────

interface StandingsViewProps {
	state: PublicGameState;
	playerId: string;
	activeCarId?: number;
}

function StandingsView({ state, playerId, activeCarId }: StandingsViewProps) {
	const sorted = [...state.cars].sort((a, b) => b.position - a.position);

	return (
		<ul className="flex flex-col gap-1">
			{sorted.map((car, rank) => {
				const owner = state.players.find((p) => p.carIds.includes(car.id));
				const isMyPlayer = owner?.id === playerId;
				const isPending = state.pendingThisRound.includes(car.id);
				const isActive = car.id === activeCarId;

				return (
					<li
						key={car.id}
						className={[
							'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
							isActive ? 'border-black' : 'border-black/10',
						].join(' ')}
					>
						<span className="w-5 text-xs text-black/40">P{rank + 1}</span>
						<span className="rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs">C{car.id}</span>
						<span className={isMyPlayer ? 'font-semibold' : ''}>{owner?.name ?? '?'}</span>
						<span className="ml-auto text-xs text-black/40">pos {car.position}</span>
						<span className="w-12 text-right text-xs text-black/40">{car.handSize} cards</span>
						<span className="w-4 text-center text-xs">
							{isActive ? '▶' : !isPending ? <span className="text-black/30">✓</span> : null}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
