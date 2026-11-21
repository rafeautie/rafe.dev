import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Bar, PAGE } from '~/components/race/Bar';

// The race everybody watches together (components/race/Live). It is drawn in
// the browser, so it loads there, in its own chunk. Still being built, so it
// is kept out of search engines.
const Live = lazy(() => import('~/components/race/Live'));

export const Route = createFileRoute('/race/')({
	head: () => ({
		meta: [{ title: 'Race | Rafe Autie' }, { name: 'robots', content: 'noindex, nofollow' }]
	}),
	component: RacePage
});

function RacePage() {
	return (
		<ClientOnly fallback={<Placeholder />}>
			<Suspense fallback={<Placeholder />}>
				<Live />
			</Suspense>
		</ClientOnly>
	);
}

// Holds the header and the race's place until the race loads, so nothing jumps.
function Placeholder() {
	return (
		<div className={PAGE}>
			<Bar />
			<div className="min-h-0 flex-1 rounded-lg bg-foreground/[0.04]" />
		</div>
	);
}
