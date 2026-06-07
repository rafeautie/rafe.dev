import { createFileRoute } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { useRaceSession } from '~/games/the-race/hooks/useRaceSession';
import { ConnectingView } from '~/games/the-race/components/ConnectingView';
import { LobbyView } from '~/games/the-race/components/LobbyView';
import { RaceView } from '~/games/the-race/components/RaceView';
import { ResultsView } from '~/games/the-race/components/ResultsView';

export const Route = createFileRoute('/games/the-race/$gameId')({
	component: GameRoom
});

function GameRoom() {
	const { gameId } = Route.useParams();
	const session = useRaceSession(gameId);

	if (!session.connected || !session.state) {
		return <ConnectingView gameId={gameId} />;
	}

	const phase = session.state.phase;
	// Group qualifying/race together so the in-race phase change doesn't
	// trigger a fade — only crossing between lobby, race, and results does.
	const view =
		phase === 'lobby'
			? 'lobby'
			: phase === 'qualifying' || phase === 'race'
				? 'race'
				: phase === 'results'
					? 'results'
					: 'other';

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={view}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.25, ease: 'easeInOut' }}
			>
				{view === 'lobby' && <LobbyView gameId={gameId} session={session} />}
				{view === 'race' && <RaceView session={session} />}
				{view === 'results' && <ResultsView session={session} />}
				{view === 'other' && (
					<div className="flex h-dvh items-center justify-center">
						<p className="text-sm font-semibold">phase: {phase}</p>
					</div>
				)}
			</motion.div>
		</AnimatePresence>
	);
}
