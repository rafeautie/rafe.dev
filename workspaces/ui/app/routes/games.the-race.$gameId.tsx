import { createFileRoute } from '@tanstack/react-router';
import { useRaceWebSocket } from '../hooks/useRaceWebSocket';
import type { PublicGameState, ClientMessage } from 'shared';

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

	return (
		<div className="flex h-dvh items-center justify-center">
			<p className="text-xl font-semibold">
				phase: {state.phase}
			</p>
		</div>
	);
}

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
							{p.isHost && (
								<span className="text-xs font-medium text-black/40 uppercase tracking-wide">host</span>
							)}
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
