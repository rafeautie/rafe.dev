import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Bar, FRAME } from '~/components/race/Bar';

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
		<div className="min-h-dvh p-6 text-base text-foreground sm:p-8">
			<ClientOnly fallback={<Placeholder />}>
				<Suspense fallback={<Placeholder />}>
					<Live />
				</Suspense>
			</ClientOnly>
		</div>
	);
}

// Holds the header and the track's place until the race loads, so nothing jumps.
function Placeholder() {
	return (
		<div className={`${FRAME} flex flex-col gap-4`}>
			<Bar />
			<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_var(--rail)]">
				<div className="aspect-video w-full rounded-lg bg-foreground/[0.04]" />
			</div>
		</div>
	);
}
