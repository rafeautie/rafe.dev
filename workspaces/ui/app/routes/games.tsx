import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/games')({
	component: GamesPage,
});

function GamesPage() {
	return (
		<div className="flex h-dvh flex-col items-center justify-center gap-8 p-10">
			<h1 className="text-3xl font-semibold tracking-wide">games</h1>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Link
					to="/games/the-race"
					className="flex flex-col gap-2 rounded-xl border border-black/10 p-6 transition-colors hover:bg-black/5"
				>
					<span className="text-xl font-semibold">The Race</span>
					<span className="text-sm text-black/60">a card racing game</span>
				</Link>
			</div>
		</div>
	);
}
