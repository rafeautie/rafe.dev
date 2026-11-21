import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail, ProblemBadge } from '~/components/admin/AdminHeader';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { Books } from '~/components/admin/race/Books';
import { Live } from '~/components/admin/race/Live';
import { Players } from '~/components/admin/race/Players';
import { Results } from '~/components/admin/race/Results';
import { Tuning } from '~/components/admin/race/Tuning';
import { readSection, Subsections } from '~/components/admin/Subsections';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { errorMessage } from '~/lib/admin/format';
import { requireAdmin } from '~/lib/admin/guard';
import { getRaceAdmin, pauseRace, voidRace, type RaceAdminView } from '~/lib/race/admin';

// The race game's back office (lib/race), laid out the way a live betting
// game is run: what is on now, watched (live); the people playing it, acted
// on (players); how the races have come out and what the house made of them,
// read (results, books); and the numbers it runs on, changed now and then
// (tuning). Everything is the room's word, asked for again every few seconds
// while the page is open. The section components are in components/admin/race.

const SECTIONS = ['live', 'players', 'results', 'books', 'tuning'] as const;
type Section = (typeof SECTIONS)[number];

export const Route = createFileRoute('/admin/race')({
	// which section shows on a wide screen
	validateSearch: (search: Record<string, unknown>) => readSection(SECTIONS, search),
	beforeLoad: requireAdmin,
	loader: () => getRaceAdmin({ data: { search: '' } }),
	// the page polls for itself, so switching sections asks nothing new
	shouldReload: ({ cause }) => cause !== 'stay',
	component: RacePage
});

const POLL_MS = 3000;

function RacePage() {
	const { section } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [view, setView] = useState<RaceAdminView>(Route.useLoaderData());
	// how far the room's clock is ahead of this one, for the time left
	const [skew, setSkew] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [search, setSearch] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [voiding, setVoiding] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const next = await getRaceAdmin({ data: { search } });
			setView(next);
			setSkew(next.loop.now - Date.now());
		} catch (error) {
			setProblem(errorMessage(error));
		}
	}, [search]);

	// soon after the search changes, then every few seconds
	useEffect(() => {
		let gone = false;
		let timer = setTimeout(function tick() {
			void refresh().finally(() => {
				if (!gone) timer = setTimeout(tick, POLL_MS);
			});
		}, 250);
		return () => {
			gone = true;
			clearTimeout(timer);
		};
	}, [refresh]);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	async function act(run: () => Promise<unknown>) {
		setProblem(null);
		setBusy(true);
		try {
			await run();
			await refresh();
		} catch (error) {
			setProblem(errorMessage(error));
		} finally {
			setBusy(false);
		}
	}

	const go = (key: Section) => navigate({ search: { section: key === 'live' ? undefined : key } });
	const { loop } = view;
	const clock = now + skew;
	const left = Math.max(0, Math.ceil((loop.endsAt - clock) / 1000));

	return (
		<Subsections
			title="race"
			value={section}
			onChange={go}
			sections={[
				{ key: 'live', label: 'live', content: <Live view={view} clock={clock} go={go} /> },
				{
					key: 'players',
					label: 'players',
					content: (
						<Players
							players={view.players}
							watching={loop.players}
							clock={clock}
							search={search}
							setSearch={setSearch}
							busy={busy}
							act={act}
						/>
					)
				},
				{ key: 'results', label: 'results', content: <Results history={view.history} /> },
				{ key: 'books', label: 'books', content: <Books history={view.history} /> },
				{
					key: 'tuning',
					label: 'tuning',
					content: (
						<Tuning
							key={JSON.stringify(view.settings)}
							{...view.settings}
							cars={view.history.cars}
							busy={busy}
							act={act}
						/>
					)
				}
			]}
		>
			<AdminHeader path={['race']}>
				<Link href="/race">game</Link>
			</AdminHeader>

			<ControlsRail
				status={
					<>
						<span>
							{loop.round ? `race ${loop.round}` : 'no races yet'} · {loop.phase}
							{loop.phase !== 'idle' && <span suppressHydrationWarning> · {left}s left</span>}
						</span>
						{loop.paused && <Badge variant="secondary">Paused</Badge>}
						<ProblemBadge text={problem} onDismiss={() => setProblem(null)} />
					</>
				}
			>
				<Button
					variant="outline"
					disabled={busy}
					onClick={() => act(() => pauseRace({ data: { paused: !loop.paused } }))}
				>
					{loop.paused ? 'Resume' : 'Pause'}
				</Button>
				<Button
					variant="destructive"
					disabled={busy || loop.phase === 'idle' || loop.phase === 'results'}
					onClick={() => setVoiding(true)}
				>
					Void race
				</Button>
			</ControlsRail>
			<ConfirmDialog
				open={voiding}
				onOpenChange={setVoiding}
				title={`Void race ${loop.round}?`}
				description="Every bet on it is handed back and it is marked void. The next race opens, unless the races are paused or nobody is watching."
				confirm="Void race"
				destructive
				onConfirm={() => act(() => voidRace())}
			/>
		</Subsections>
	);
}
