import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';

const DESCRIPTION =
	'Play chess against a small AI model that runs entirely in your browser, and watch it think.';

// The board and the model only run in the browser, so the game loads there,
// in its own chunk.
const Game = lazy(() => import('~/components/chess/Game'));

export const Route = createFileRoute('/chess')({
	head: () => ({
		meta: [
			{ title: 'Chess | Rafe Autie' },
			{ name: 'description', content: DESCRIPTION },
			{ property: 'og:type', content: 'website' },
			{ property: 'og:url', content: 'https://rafe.dev/chess' },
			{ property: 'og:title', content: 'Chess | Rafe Autie' },
			{ property: 'og:description', content: DESCRIPTION }
		],
		links: [{ rel: 'canonical', href: 'https://rafe.dev/chess' }]
	}),
	component: ChessPage
});

function ChessPage() {
	return (
		<div className="min-h-dvh px-6 py-8 text-base text-foreground sm:px-8">
			<div className="flex items-center justify-between gap-4">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					chess
				</SlashNav>
				<ThemeToggle />
			</div>
			<div className="mt-10 sm:mt-12">
				<ClientOnly fallback={<BoardPlaceholder />}>
					<Suspense fallback={<BoardPlaceholder />}>
						<Game />
					</Suspense>
				</ClientOnly>
			</div>
		</div>
	);
}

// Holds the board's place until the game loads, so nothing jumps.
function BoardPlaceholder() {
	return (
		<div className="mx-auto aspect-square w-full max-w-[min(40rem,calc(100dvh-9rem))] rounded-lg bg-foreground/[0.04] xl:w-[min(calc(100dvh-9rem),calc(100vw-49rem))] xl:max-w-none 2xl:w-[min(calc(100dvh-9rem),calc(100vw-57rem))]" />
	);
}
