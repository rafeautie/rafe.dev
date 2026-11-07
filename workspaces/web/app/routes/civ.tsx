import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';

const DESCRIPTION =
	'A small band of people grows into a civilization in your browser, while you shape the world around them.';

// The world runs in a worker and draws on a canvas, so the whole thing loads
// in the browser, in its own chunk.
const CivApp = lazy(() => import('~/components/civ/CivApp'));

export const Route = createFileRoute('/civ')({
	head: () => ({
		meta: [
			{ title: 'Civ | Rafe Autie' },
			{ name: 'description', content: DESCRIPTION },
			// unfinished: kept out of search until it's ready
			{ name: 'robots', content: 'noindex' }
		]
	}),
	component: CivPage
});

function CivPage() {
	return (
		<div className="min-h-dvh p-6 text-base text-foreground sm:p-8">
			<div className="flex items-center justify-between gap-4">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					civ
				</SlashNav>
				<ThemeToggle />
			</div>
			<div className="mt-6 sm:mt-8">
				<ClientOnly fallback={<Placeholder />}>
					<Suspense fallback={<Placeholder />}>
						<CivApp />
					</Suspense>
				</ClientOnly>
			</div>
		</div>
	);
}

function Placeholder() {
	return (
		<div className="h-[60dvh] w-full rounded-lg bg-foreground/[0.04] lg:h-[calc(100dvh-7rem)]" />
	);
}
