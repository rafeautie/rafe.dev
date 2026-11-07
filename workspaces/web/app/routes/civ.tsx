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

// The way home and the theme switch live in the game's top bar, so the
// route hands them to it, and shows the same pair while the game loads.
const lead = (
	<div className="flex items-center gap-3">
		<SlashNav className="text-base font-medium">
			<Link href="/">rafe</Link>
			civ
		</SlashNav>
		<ThemeToggle />
	</div>
);

function CivPage() {
	return (
		<div className="fixed inset-0 overflow-hidden text-base text-foreground">
			<ClientOnly fallback={<Placeholder />}>
				<Suspense fallback={<Placeholder />}>
					<CivApp lead={lead} />
				</Suspense>
			</ClientOnly>
		</div>
	);
}

function Placeholder() {
	return (
		<div className="absolute inset-0 bg-foreground/[0.04]">
			<div className="absolute top-3 left-3 rounded-xl border border-foreground/10 bg-background/85 px-3 py-1.5 backdrop-blur-md">
				{lead}
			</div>
		</div>
	);
}
