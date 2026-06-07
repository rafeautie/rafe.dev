import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { TheRaceLogo } from '~/games/the-race/components/TheRaceLogo';
import { GameStatsChart } from '~/components/GameStatsChart';
import { getGameStats } from '~/games/stats';

export const Route = createFileRoute('/games/')({
	// One read of the stats per page load. staleTime keeps in-session revisits from
	// refetching; the server function is itself edge-cached for cross-visitor reuse.
	loader: () => getGameStats(),
	staleTime: 60_000,
	head: () => ({
		meta: [
			{ title: 'Games | Rafe Autie' },
			{
				name: 'description',
				content: 'A collection of games built by Rafe Autie.'
			}
		]
	}),
	component: GamesPage
});

type Game = {
	id: string;
	to: string;
	name: string;
	description: string;
	logo: ReactNode;
	background: string;
};

const games: Game[] = [
	{
		// Matches the game id written to Analytics Engine (see the-race-game.ts).
		id: 'the-race',
		to: '/games/the-race',
		name: 'The Race',
		description: 'a racing card game',
		logo: <TheRaceLogo />,
		background: 'bg-linear-to-b from-the-race-bg-from to-the-race-bg-to'
	}
];

function GamesPage() {
	const stats = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-8 p-8 text-xl text-black">
			<div className="space-y-2">
				<a href="/" className="text-4xl font-semibold tracking-wide">
					rafe / games
				</a>
			</div>
			<div className="flex flex-col gap-6">
				{games.map((game) => (
					<Link
						key={game.to}
						to={game.to}
						className="group flex flex-col overflow-hidden rounded-2xl border border-black/10 transition-colors hover:bg-black/5 md:flex-row md:items-center"
					>
						<div
							className={`flex h-40 shrink-0 items-center justify-center font-archivo md:h-32 md:w-64 ${game.background}`}
						>
							{game.logo}
						</div>
						<div className="flex w-full p-6">
							<div className="flex flex-1 flex-col">
								<span className="text-2xl font-semibold">{game.name}</span>
								<span className="text-base text-black/60">{game.description}</span>
							</div>
							<GameStatsChart stat={stats[game.id]} />
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
