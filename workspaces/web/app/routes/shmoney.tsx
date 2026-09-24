import { createFileRoute } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ComponentProps,
	type ReactNode
} from 'react';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { DEMO_URL, GITHUB_URL } from '~/components/shmoney/constants';
import { DownloadButton } from '~/components/shmoney/DownloadButton';
import { Logo } from '~/components/shmoney/Logo';
import { LiveDemo } from '~/components/shmoney/LiveDemo';
import { SmoothScroll, easeOutQuint, useLenis } from '~/components/shmoney/smooth-scroll';
import { Screenshot, type ScreenName } from '~/components/shmoney/Screenshot';
import { Button } from '~/components/ui/button';
import { useMedia } from '~/lib/use-media';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/shmoney')({
	head: () => ({
		meta: [
			{ title: 'shmoney | Your money, on your machine' },
			{
				name: 'description',
				content:
					'shmoney is a private, local-first personal finance app for your desktop. Bank sync, envelope budgets, offline AI categorization, and a chat that answers questions about your money, all stored in a single SQLite file on your computer.'
			},
			{ property: 'og:type', content: 'website' },
			{ property: 'og:url', content: 'https://rafe.dev/shmoney' },
			{ property: 'og:title', content: 'shmoney | Your money, on your machine' },
			{
				property: 'og:description',
				content: 'A private, local-first personal finance app. No cloud, no account, no telemetry.'
			},
			{ property: 'twitter:card', content: 'summary' },
			{ property: 'twitter:title', content: 'shmoney | Your money, on your machine' },
			{
				property: 'twitter:description',
				content: 'A private, local-first personal finance app. No cloud, no account, no telemetry.'
			}
		],
		// the screenshots and the live demo both come from the demo's origin
		links: [{ rel: 'preconnect', href: DEMO_URL }]
	}),
	component: ShmoneyPage
});

type Stop = { name: ScreenName; alt: string; title: string; body: string; hint?: string };

// One live app, steered by the page: scrolling moves through the stops beside
// (or, below xl, behind) the pinned demo, and the demo follows along. Phones
// get the screenshots.
const TOUR: Stop[] = [
	{
		name: 'transactions',
		alt: 'shmoney transactions view with net worth, search and filters, and a categorized transaction list',
		title: 'Every transaction in one place',
		body: 'Sync from your banks through SimpleFIN, or import CSV, TSV, OFX, QFX, and QIF files. Rules and an optional offline model sort everything into categories.'
	},
	{
		name: 'accounts',
		alt: 'shmoney accounts overview',
		title: 'Accounts and net worth',
		body: 'Investment holdings next to cash, with net worth as one number. Transfers between your own accounts never count as spending.'
	},
	{
		name: 'budget',
		alt: 'shmoney envelope budget view',
		title: 'Envelope budgets',
		body: 'Fill envelopes at the start of the month and watch them drain as you spend.'
	},
	{
		name: 'chat',
		alt: 'shmoney chat answering a finance question with a generated income-versus-spending chart',
		title: 'Ask about your money',
		body: 'Ask a question in plain English. The on-device model runs read-only queries against your data and charts the answer, and the conversation never leaves your computer. Here the answers are recorded; in the app, you ask your own.'
	},
	{
		name: 'report-detail',
		alt: 'shmoney spending report with stat, bar, pie, and line widgets',
		title: 'Custom reports',
		body: 'Drag charts, tables, and stats onto a dashboard, save the filters you use, and drill into exactly where the money went.'
	},
	{
		name: 'activity',
		alt: 'shmoney activity log of reversible changes',
		title: 'Undo anything',
		body: 'Every change lands in an activity log and can be reversed, bulk edits included.',
		hint: 'Try it: change a category under Transactions, then come back here and undo it.'
	}
];

// Label on the left, content on the right. Captions, the privacy note, and the
// download block all share it so the page keeps one rhythm.
function Split({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:gap-10">
			<div className="font-medium">{label}</div>
			<div className="max-w-2xl text-pretty text-black/60">{children}</div>
		</div>
	);
}

function Tour() {
	const [active, setActive] = useState(0);
	const pinned = useMedia('(min-width: 768px)');
	const lenis = useLenis();
	const stops = useRef<(HTMLLIElement | null)[]>([]);
	const tour = useRef<HTMLDivElement>(null);
	const introStop = useRef<HTMLLIElement>(null);

	// Scrolling always settles with a stop in the middle of the viewport,
	// beside the pinned demo. With smooth scrolling on, the page eases there
	// itself once the wheel goes quiet; without it, CSS snapping does the job,
	// with the blocks above and below the tour as snap areas.
	useEffect(() => {
		if (!pinned) return;
		const root = document.documentElement;
		if (!lenis) {
			root.style.scrollSnapType = 'y mandatory';
			return () => {
				root.style.scrollSnapType = '';
			};
		}
		let timer = 0;
		let heading = 0;
		const snap = () => {
			const destination = lenis.targetScroll;
			const centers = stops.current.flatMap((stop) => (stop ? [centerOf(stop)] : []));
			const height = stops.current[0]?.offsetHeight ?? 0;
			const first = centers[0];
			const last = centers[centers.length - 1];
			let target: number | undefined;
			if (destination < first) {
				// the scroll prompt is never a resting place: heading down past the
				// hero carries on to the first stop, heading up leaves the tour
				const reach = heading > 0 ? height * 1.5 : height / 4;
				if (first - destination < reach) target = first;
			} else if (destination > last) {
				// past the last stop the page scrolls freely on to the footer
				if (destination - last < height / 4) target = last;
			} else {
				target = centers.reduce((a, b) =>
					Math.abs(b - destination) < Math.abs(a - destination) ? b : a
				);
			}
			if (target === undefined || Math.abs(target - destination) < 1) return;
			lenis.scrollTo(target, { duration: 0.9, easing: easeOutQuint });
		};
		const settle = () => {
			clearTimeout(timer);
			timer = window.setTimeout(snap, 150);
		};
		const offInput = lenis.on('virtual-scroll', ({ deltaY }) => {
			if (deltaY) heading = Math.sign(deltaY);
			settle();
		});
		// keyboard, scrollbar and touch momentum scroll natively
		const offScroll = lenis.on('scroll', () => {
			if (lenis.isScrolling !== 'native') return;
			if (lenis.direction) heading = lenis.direction;
			settle();
		});
		return () => {
			clearTimeout(timer);
			offInput();
			offScroll();
		};
	}, [pinned, lenis]);

	// On every scroll, and before the first paint: the stop nearest the middle
	// of the viewport is the one on screen (the first above the tour, the last
	// below it). Below xl, each stop's title and description sit stacked by the
	// pinned demo and move with the scroll: a stop's text is where its
	// (invisible) stop is, scaled down to a short slide, and fades out halfway
	// to the next.
	useLayoutEffect(() => {
		if (!pinned || !tour.current) return;
		const items = [...tour.current.querySelectorAll<HTMLElement>('[data-track]')];
		const fades = [...tour.current.querySelectorAll<HTMLElement>('[data-fade]')];
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const update = () => {
			const offsets = stops.current.map(offsetOf);
			let nearest = 0;
			offsets.forEach((offset, index) => {
				if (Math.abs(offset) < Math.abs(offsets[nearest])) nearest = index;
			});
			setActive(nearest);
			// the intro holds until its spot scrolls past, so it shows in full while
			// the tour approaches
			const intro = Math.min(0, offsetOf(introStop.current));
			const shown = (offset: number) => Math.max(0, 1 - Math.abs(offset) * 2);
			// the prompt only ever shows while no stop's title does
			const prompt = Math.min(shown(intro), 1 - Math.max(...offsets.map(shown)));
			for (const item of items) {
				const offset = item.dataset.track === 'intro' ? intro : offsets[Number(item.dataset.track)];
				item.style.opacity = String(item.dataset.track === 'intro' ? prompt : shown(offset));
				if (!still) item.style.translate = `0 ${offset * Number(item.dataset.distance)}px`;
			}
			// the intro's arrow hands its row over to the tip, one after the other
			const arrow = prompt;
			const tip = Math.min(1, Math.max(0, (-intro - 0.5) * 2));
			for (const item of fades) {
				item.style.opacity = String(item.dataset.fade === 'arrow' ? arrow : tip);
			}
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	}, [pinned]);

	const select = (index: number) => {
		const stop = stops.current[index];
		if (!pinned || !stop) setActive(index);
		else if (lenis) lenis.scrollTo(centerOf(stop), { duration: 1.2, easing: easeOutQuint });
		else stop.scrollIntoView({ block: 'center' });
	};

	return (
		<section className="mx-auto max-w-5xl px-6 sm:px-8 xl:max-w-7xl">
			{/* Below xl the stops are invisible spacers under the pinned demo, which
			    shows the stop's title above it and its description below */}
			<div ref={tour} className="tour grid xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-16">
				{/* the padding makes the tour a full viewport taller than its stops, so the
				    demo is pinned, and centered, even at the first and last */}
				<ol className="col-start-1 row-start-1 py-[15vh]">
					<li ref={introStop} className="flex min-h-[70vh] flex-col justify-center">
						<ScrollPrompt className="max-xl:invisible" />
					</li>
					{TOUR.map((stop, index) => (
						<li
							key={stop.name}
							ref={(element) => {
								stops.current[index] = element;
							}}
							data-active={index === active}
							className="group flex min-h-[70vh] snap-center flex-col justify-center"
						>
							<div className="translate-y-3 opacity-20 transition-[opacity,translate] duration-700 ease-out group-data-[active=true]:translate-y-0 group-data-[active=true]:opacity-100 max-xl:invisible">
								<button
									type="button"
									aria-pressed={index === active}
									onClick={() => select(index)}
									className="cursor-pointer text-left text-3xl font-semibold tracking-tight text-balance"
								>
									{stop.title}
								</button>
								<p className="mt-4 text-lg text-pretty text-black/60">{stop.body}</p>
								{stop.hint && <p className="mt-4 text-pretty text-black/50">{stop.hint}</p>}
							</div>
						</li>
					))}
				</ol>
				<div className="sticky top-0 col-start-1 row-start-1 flex h-screen items-center self-start xl:col-start-2">
					<div className="tour-demo relative mx-auto w-full max-xl:max-w-[calc((100vh-19rem)*1.6)] xl:max-w-[calc((100vh-9rem)*1.6)]">
						<div className="-my-1 grid overflow-hidden py-1 xl:hidden">
							<p
								data-track="intro"
								data-distance={40}
								aria-hidden
								className="col-start-1 row-start-1 text-center text-2xl font-semibold tracking-tight"
							>
								Scroll to take the tour
							</p>
							{TOUR.map((stop, index) => (
								<h3
									key={stop.name}
									data-track={index}
									data-distance={40}
									aria-hidden={index !== active}
									style={{ opacity: 0 }}
									className="col-start-1 row-start-1 text-center text-2xl font-semibold tracking-tight text-balance"
								>
									{stop.title}
								</h3>
							))}
						</div>
						<div className="mt-2 mb-5 grid xl:hidden">
							<div data-fade="arrow" className="col-start-1 row-start-1 flex justify-center">
								<ChevronDownIcon className="size-6 animate-bounce text-black/40" />
							</div>
							<Tip data-fade="tip" style={{ opacity: 0 }} className="col-start-1 row-start-1" />
						</div>
						<div className="tour-rise">
							<LiveDemo screen={TOUR[active].name} alt={TOUR[active].alt} />
						</div>
						{/* hangs below the demo, so the demo itself stays centered */}
						<Tip className="absolute inset-x-0 top-full mt-4 hidden xl:block" />
						{/* a fixed height, so the demo holds still between stops */}
						<div className="mt-5 grid overflow-hidden xl:hidden">
							{TOUR.map((stop, index) => (
								<div
									key={stop.name}
									data-track={index}
									data-distance={48}
									aria-hidden={index !== active}
									style={{ opacity: 0 }}
									className="col-start-1 row-start-1 mx-auto max-w-2xl text-center text-pretty"
								>
									<p className="text-black/60">{stop.body}</p>
									{stop.hint && <p className="mt-2 text-sm text-black/50">{stop.hint}</p>}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function ScrollPrompt({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={cn(
				'flex w-max flex-col items-center gap-3 text-center text-3xl font-semibold tracking-tight',
				className
			)}
		>
			<span>
				Scroll to
				<br />
				take the tour
			</span>
			<ChevronDownIcon className="size-6 animate-bounce text-black/40" />
		</div>
	);
}

// how far an element's middle is from the viewport's, in its own heights
function offsetOf(element: HTMLElement | null): number {
	if (!element) return 0;
	const { top, height } = element.getBoundingClientRect();
	return (top + height / 2 - window.innerHeight / 2) / height;
}

function Tip({ className, ...props }: ComponentProps<'p'>) {
	return (
		<p {...props} className={cn('text-center text-sm text-pretty text-black/50', className)}>
			<strong className="font-semibold text-black/70">Tip:</strong> this is the real app, running in
			your browser with sample data. Click around; nothing is saved.
		</p>
	);
}

// the scroll position that puts an element's middle at the viewport's
function centerOf(element: HTMLElement): number {
	const { top, height } = element.getBoundingClientRect();
	return window.scrollY + top + height / 2 - window.innerHeight / 2;
}

function ShmoneyPage() {
	return (
		<div className="bg-background text-base text-black">
			<SmoothScroll />
			<div className="mx-auto max-w-5xl px-6 sm:px-8 xl:max-w-7xl xl:snap-start">
				<header className="flex items-center justify-between gap-4 pt-8">
					<SlashNav className="text-lg font-medium sm:text-xl">
						<Link href="/">rafe</Link>
						<Link href="/development">development</Link>
						shmoney
					</SlashNav>
					<Link
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 text-sm text-black/60 hover:text-black"
					>
						<GitHubIcon className="size-4" />
						GitHub
					</Link>
				</header>

				<section className="pt-20 sm:pt-28">
					<Logo className="rise size-14 rounded-2xl" />
					<h1 className="rise mt-8 text-4xl font-semibold tracking-tight text-balance [--delay:80ms] sm:text-5xl">
						Your money, on your machine.
					</h1>
					<p className="rise mt-5 max-w-xl text-lg text-pretty text-black/60 [--delay:160ms]">
						A personal finance app that runs entirely on your computer. Sync your banks, budget with
						envelopes, build reports, and ask questions about your spending. It all lives in one
						SQLite file, with no account and no cloud.
					</p>
					<div className="rise mt-8 flex flex-wrap items-center gap-3 [--delay:240ms]">
						<DownloadButton>Download</DownloadButton>
						<Button
							variant="outline"
							size="lg"
							className="px-4"
							render={<Link plain href={GITHUB_URL} target="_blank" rel="noreferrer" />}
						>
							View the source
						</Button>
					</div>
					<p className="rise mt-4 text-sm text-black/50 [--delay:240ms]">
						Free for personal use · Windows, macOS, and Linux
					</p>
					{/* LiveDemo only runs the app from md up; phones get the screenshots */}
					<p className="rise mt-10 text-sm text-balance text-black/60 [--delay:320ms] md:hidden">
						On a larger screen, the app below is live, with sample data.
					</p>
				</section>
			</div>

			<div className="mt-8 hidden md:block">
				<Tour />
			</div>

			<div className="mx-auto max-w-5xl px-6 pb-16 sm:px-8 xl:max-w-7xl xl:snap-end">
				<div className="mt-20 space-y-20 md:hidden">
					{TOUR.map((stop, index) => (
						<figure key={stop.name} className="reveal">
							<Screenshot name={stop.name} alt={stop.alt} sizes="100vw" eager={index === 0} />
							<figcaption className="mt-6">
								<Split label={stop.title}>{stop.body}</Split>
							</figcaption>
						</figure>
					))}
				</div>

				<section className="mt-28 space-y-12 border-t border-black/10 pt-10 sm:mt-36 md:mt-4">
					<div className="reveal">
						<Split label={<h2>Privacy</h2>}>
							Nothing leaves your machine. Your data lives in one SQLite file, bank credentials stay
							encrypted in your OS keychain, and there is no account and no telemetry. The only
							network calls are the SimpleFIN syncs you ask for.
						</Split>
					</div>
					<div className="reveal">
						<Split label={<h2>Get shmoney</h2>}>
							<p>
								Free for personal use under the PolyForm Noncommercial 1.0.0 license. shmoney is
								pre-1.0.
							</p>
							<div className="mt-5 flex flex-wrap items-center gap-3">
								<DownloadButton>Download</DownloadButton>
								<Button
									variant="outline"
									size="lg"
									className="px-4"
									render={<Link plain href={GITHUB_URL} target="_blank" rel="noreferrer" />}
								>
									<GitHubIcon className="size-4" />
									Star on GitHub
								</Button>
							</div>
						</Split>
					</div>
				</section>

				<footer className="mt-24 flex items-center justify-between gap-4 text-sm text-black/60">
					<p>
						Built by{' '}
						<Link href="/about" className="text-black hover:text-black">
							Rafe Autie
						</Link>
					</p>
					<Link href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-black">
						GitHub
					</Link>
				</footer>
			</div>
		</div>
	);
}
