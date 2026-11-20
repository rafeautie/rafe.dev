import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';

// The race only runs in the browser, so it loads there, in its own chunk.
// Still being built, so it is kept out of search engines.
const Sandbox = lazy(() => import('~/components/race/Sandbox'));

export const Route = createFileRoute('/race')({
	head: () => ({
		meta: [{ title: 'Race | Rafe Autie' }, { name: 'robots', content: 'noindex, nofollow' }]
	}),
	component: RacePage
});

function RacePage() {
	return (
		<div className="min-h-dvh p-6 text-base text-foreground sm:p-8">
			<div className="flex items-center justify-between gap-4">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					race
				</SlashNav>
				<ThemeToggle />
			</div>
			<div className="mt-6 sm:mt-8">
				<ClientOnly fallback={<TrackPlaceholder />}>
					<Suspense fallback={<TrackPlaceholder />}>
						<Sandbox />
					</Suspense>
				</ClientOnly>
			</div>
		</div>
	);
}

// Holds the track's place until the race loads, so nothing jumps.
function TrackPlaceholder() {
	return <div className="mx-auto aspect-video w-full max-w-6xl rounded-lg bg-foreground/[0.04]" />;
}
