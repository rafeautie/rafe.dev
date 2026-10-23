import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const DESCRIPTION =
	'Round-based zombies in the browser. Start a lobby, send the link, and hold out together.';

// The game only runs in the browser, so it loads there, in its own chunk.
const Zombies = lazy(() => import('~/components/zombies/Zombies'));

export const Route = createFileRoute('/zombies')({
	validateSearch: (search: Record<string, unknown>): { lobby?: string } =>
		typeof search.lobby === 'string' ? { lobby: search.lobby.toUpperCase() } : {},
	head: () => ({
		meta: [
			{ title: 'Zombies | Rafe Autie' },
			{ name: 'description', content: DESCRIPTION },
			{ property: 'og:type', content: 'website' },
			{ property: 'og:url', content: 'https://rafe.dev/zombies' },
			{ property: 'og:title', content: 'Zombies | Rafe Autie' },
			{ property: 'og:description', content: DESCRIPTION }
		],
		links: [{ rel: 'canonical', href: 'https://rafe.dev/zombies' }]
	}),
	component: ZombiesPage
});

function ZombiesPage() {
	const { lobby } = Route.useSearch();
	return (
		<ClientOnly>
			<Suspense>
				<Zombies lobby={lobby} />
			</Suspense>
		</ClientOnly>
	);
}
