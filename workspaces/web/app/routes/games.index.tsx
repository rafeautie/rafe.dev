import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { TheRaceLogo } from '~/games/the-race/components/TheRaceLogo';

export const Route = createFileRoute('/games/')({
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
	to: string;
	name: string;
	description: string;
	logo: ReactNode;
	background: string;
};

const games: Game[] = [
	{
		to: '/games/the-race',
		name: 'The Race',
		description: 'a racing card game',
		logo: <TheRaceLogo />,
		background: 'bg-linear-to-b from-the-race-bg-from to-the-race-bg-to'
	}
];

function GamesPage() {
	return (
		<div className="flex flex-col gap-8 p-8 text-xl text-black">
			<div className="space-y-2">
				<p className="text-4xl font-semibold tracking-wide">
					<a href="/">rafe / games</a>
				</p>
			</div>
			<div className="flex flex-col gap-6">
				{games.map((game) => (
					<Link
						key={game.to}
						to={game.to}
						className="group flex flex-col overflow-hidden rounded-2xl border border-black/10 transition-colors hover:bg-black/5 sm:flex-row sm:items-center"
					>
						<div
							className={`flex h-40 shrink-0 items-center justify-center font-archivo sm:h-32 sm:w-64 ${game.background}`}
						>
							{game.logo}
						</div>
						<div className="flex flex-col gap-1 p-6">
							<span className="text-2xl font-semibold">{game.name}</span>
							<span className="text-base text-black/60">{game.description}</span>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
