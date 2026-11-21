import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '~/components/Link';
import { AdminHeader, ControlsRail, ProblemBadge } from '~/components/admin/AdminHeader';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { Books } from '~/components/admin/race/Books';
import { Live } from '~/components/admin/race/Live';
import { Players } from '~/components/admin/race/Players';
import { SecondsLeft } from '~/components/admin/race/clock';
import { Results } from '~/components/admin/race/Results';
import { Tuning } from '~/components/admin/race/Tuning';
import { Subsections } from '~/components/admin/Subsections';
import { readSection, sectionId } from '~/lib/admin/section';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { errorMessage } from '~/lib/admin/format';
import { requireAdmin } from '~/lib/admin/guard';
import {
	cautionRace,
	getRaceAdmin,
	pauseRace,
	voidRace,
	type RaceAdminView
} from '~/lib/race/admin';

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
	// the page polls for itself after this; switching sections is a change of
	// search the loader does not depend on, so it asks nothing new
	loader: () => getRaceAdmin({ data: { search: '' } }),
	component: RacePage
});

const POLL_MS = 3000;

function RacePage() {
	const { section } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const router = useRouter();
	const [view, setView] = useState<RaceAdminView>(Route.useLoaderData());
	const [search, setSearch] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [voiding, setVoiding] = useState(false);

	const refresh = useCallback(async () => {
		try {
			setView(await getRaceAdmin({ data: { search } }));
		} catch (error) {
			// a lapsed sign-in: reloading the page's data fails the same way,
			// which puts up the admin's own error page and its sign-in button
			if (errorMessage(error) === 'Not signed in') void router.invalidate();
			else setProblem(errorMessage(error));
		}
	}, [search, router]);

	// Soon after the search changes, then every few seconds while the tab is
	// shown: a hidden tab asks nothing, so it doesn't keep the room busy, and
	// catches up the moment it is shown again.
	useEffect(() => {
		let gone = false;
		let timer = setTimeout(function tick() {
			const again = () => {
				if (!gone) timer = setTimeout(tick, POLL_MS);
			};
			if (document.hidden) again();
			else void refresh().finally(again);
		}, 250);
		const shown = () => {
			if (!document.hidden) void refresh();
		};
		document.addEventListener('visibilitychange', shown);
		return () => {
			gone = true;
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', shown);
		};
	}, [refresh]);

	// kept the same across polls, so the sections that take it (memo) skip
	// redrawing while nothing in it moves
	const act = useCallback(
		async (run: () => Promise<unknown>) => {
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
		},
		[refresh]
	);

	const go = (key: Section) => navigate({ search: { section: key === 'live' ? undefined : key } });
	// a link from one section to another ("results" on the last race): on a
	// wide screen the section takes this one's place, from its top; narrower,
	// where every section is on the one page, it scrolls down to it. The
	// router's own scroll to the top, at the end of the navigation, would
	// undo that, so this does the scrolling instead.
	const open = (key: 'results' | 'books') => {
		void navigate({ search: { section: key }, resetScroll: false }).then(() => {
			if (window.matchMedia('(min-width: 64rem)').matches) window.scrollTo({ top: 0 });
			else document.getElementById(sectionId(key))?.scrollIntoView({ behavior: 'smooth' });
		});
	};
	const { loop } = view;
	// Each poll brings fresh objects even when nothing changed; these stay the
	// same object until their contents change, so the memoed sections can tell.
	const historyJson = JSON.stringify(view.history);
	const history = useMemo<RaceAdminView['history']>(() => JSON.parse(historyJson), [historyJson]);
	const settingsJson = JSON.stringify(view.settings);
	const settings = useMemo<RaceAdminView['settings']>(
		() => JSON.parse(settingsJson),
		[settingsJson]
	);

	return (
		<Subsections
			title="race"
			value={section}
			onChange={go}
			sections={[
				{ key: 'live', label: 'live', content: <Live view={view} go={open} /> },
				{
					key: 'players',
					label: 'players',
					content: (
						<Players
							players={view.players}
							live={view.live}
							watching={loop.players}
							clock={loop.now}
							search={search}
							setSearch={setSearch}
							busy={busy}
							act={act}
						/>
					)
				},
				{ key: 'results', label: 'results', content: <Results history={history} /> },
				{ key: 'books', label: 'books', content: <Books history={history} /> },
				{
					key: 'tuning',
					label: 'tuning',
					content: (
						<Tuning key={settingsJson} {...settings} cars={history.cars} busy={busy} act={act} />
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
							{loop.phase !== 'idle' && (
								<>
									{' · '}
									<SecondsLeft endsAt={loop.endsAt} roomNow={loop.now} />s left
								</>
							)}
						</span>
						{loop.flag === 'yellow' && <Badge variant="secondary">Caution</Badge>}
						{loop.flag === 'restart' && <Badge variant="secondary">Going green</Badge>}
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
				{/* the field slows and closes up behind the leader, then races on; the room says why not if it cannot */}
				<Button
					variant="outline"
					disabled={busy || loop.phase !== 'racing' || loop.flag !== 'green'}
					onClick={() => act(() => cautionRace())}
				>
					Throw caution
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
