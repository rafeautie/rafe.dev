import { createFileRoute } from '@tanstack/react-router';
import { ChevronDownIcon, MousePointerClickIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { DEMO_URL, GITHUB_URL } from '~/components/shmoney/constants';
import { DownloadButton } from '~/components/shmoney/DownloadButton';
import { Logo } from '~/components/shmoney/Logo';
import { LiveDemo } from '~/components/shmoney/LiveDemo';
import { SmoothScroll, useLenis } from '~/components/shmoney/smooth-scroll';
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
					'shmoney is a private, local-first personal finance app for your desktop. Bank sync, envelope budgets, savings goals, offline AI categorization, and a chat that answers questions about your money, all stored in a single SQLite file on your computer.'
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

type Stop = { name: ScreenName; alt: string; title: string; body: string; hint: string };

// One live app, steered by the page: scrolling moves through the stops beside
// (or, below xl, behind) the pinned demo, and the demo follows along. Phones
// get the screenshots.
const TOUR: Stop[] = [
	{
		name: 'transactions',
		alt: 'shmoney transactions view with net worth, search and filters, and a categorized transaction list',
		title: 'Every transaction in one place',
		body: 'Sync your banks through SimpleFIN or import statement files. Rules and an offline model categorize everything.',
		hint: 'Search for a merchant, or change a category.'
	},
	{
		name: 'accounts',
		alt: 'shmoney accounts overview',
		title: 'Accounts and net worth',
		body: 'Investments next to cash, with net worth as one number. Transfers between your accounts never count as spending.',
		hint: 'Open an account to see just its transactions.'
	},
	{
		name: 'budget',
		alt: 'shmoney envelope budget view',
		title: 'Envelope budgets',
		body: 'Fill envelopes each month and watch them drain as you spend.',
		hint: 'Switch between the card and table views.'
	},
	{
		name: 'goals',
		alt: 'shmoney goals page with savings goal cards showing progress, pace, and on-track status',
		title: 'Savings goals',
		body: 'Pick a target and the accounts that fund it. Progress and pace come straight from your transactions.',
		hint: 'Add a goal, then find it on the Budget page.'
	},
	{
		name: 'chat',
		alt: 'shmoney chat answering a finance question with a generated income-versus-spending chart',
		title: 'Ask about your money',
		body: 'An on-device model answers in plain English, charts the results, and proposes changes for you to approve. Nothing leaves your computer.',
		hint: 'Open another conversation from the sidebar.'
	},
	{
		name: 'report-detail',
		alt: 'shmoney spending report with stat, bar, pie, and line widgets',
		title: 'Custom reports',
		body: 'Build dashboards from charts, tables, and stats, or start from a ready-made one.',
		hint: 'Press Edit to rearrange the widgets.'
	},
	{
		name: 'activity',
		alt: 'shmoney activity log of reversible changes',
		title: 'Undo anything',
		body: 'Every change is logged and can be reversed, bulk edits included.',
		hint: 'Change a category under Transactions, then undo it here.'
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
	// below xl, whether the tour prompt still holds the spot the stops' text takes over
	const [intro, setIntro] = useState(true);
	const pinned = useMedia('(min-width: 768px)');
	const lenis = useLenis();
	const stops = useRef<(HTMLLIElement | null)[]>([]);
	const tour = useRef<HTMLDivElement>(null);
	const introStop = useRef<HTMLLIElement>(null);
	const firstText = useRef<HTMLDivElement>(null);
	const pin = useRef<HTMLDivElement>(null);

	// On every scroll, and before the first paint: the stop nearest the middle
	// of the viewport is the one on screen (the first above the tour, the last
	// below it). Below xl, each stop's text sits stacked by the pinned demo and
	// fades in whole once its stop is the nearest, so wherever the scroll rests
	// one stop reads in full.
	useLayoutEffect(() => {
		if (!pinned || !tour.current) return;
		const prompts = [...tour.current.querySelectorAll<HTMLElement>('[data-track]')];
		const fades = [...tour.current.querySelectorAll<HTMLElement>('[data-fade]')];
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const update = () => {
			const offsets = stops.current.map(offsetOf);
			let nearest = 0;
			offsets.forEach((offset, index) => {
				if (Math.abs(offset) < Math.abs(offsets[nearest])) nearest = index;
			});
			setActive(nearest);
			setIntro(Math.abs(offsetOf(introStop.current)) < Math.abs(offsets[0]));
			// On xl the demo waits centered under the prompt, and moves over beside
			// the stops as the first one scrolls in, with its text rising alongside,
			// so arriving and docking are one motion. Once docked, stop text goes
			// back to fading on its own as each stop becomes active.
			const from = middleOf(introStop.current);
			const to = middleOf(stops.current[0]);
			const progress = from === to ? 1 : clamp(from / (from - to));
			// eased so the slide settles, rather than stops, at the first stop
			const dock = still ? Math.round(progress) : 1 - (1 - progress) ** 2;
			tour.current?.style.setProperty('--dock', String(dock));
			// Left alone, the demo would ride up with the page and stop dead the
			// moment it pins. Instead it rises with the page at first, then slows
			// to rest as the first stop arrives, keeping its peek on load.
			const box = pin.current;
			if (box && tour.current) {
				// its offset below the pin: where the page puts it, and where it's
				// drawn instead, starting out at the page's speed
				const { top } = tour.current.getBoundingClientRect();
				const natural = Math.max(0, top);
				const start = top + window.scrollY;
				const end = window.scrollY + to;
				const drawn =
					still || start <= 0
						? natural
						: start * (1 - clamp(window.scrollY / end)) ** (end / start);
				box.style.translate = drawn === natural ? '' : `0 ${drawn - natural}px`;
			}
			const text = firstText.current;
			if (text) {
				const docking = dock < 1;
				text.style.transition = docking ? 'none' : '';
				text.style.opacity = docking ? String(dock) : '';
				text.style.translate = docking && !still ? `0 ${0.75 * (1 - dock)}rem` : '';
			}
			// The prompt holds until its spot scrolls past, so it shows in full while
			// the tour approaches, then rides out with the scroll, gone by the time
			// the first stop takes over
			const offset = Math.min(0, offsetOf(introStop.current));
			const prompt = Math.max(0, 1 - Math.abs(offset) * 2);
			for (const item of prompts) {
				item.style.opacity = String(prompt);
				if (!still) item.style.translate = `0 ${offset * Number(item.dataset.distance)}px`;
			}
			// the intro's arrow shares its row with the stops' descriptions
			for (const item of fades) item.style.opacity = String(prompt);
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	}, [pinned]);

	// below xl, stop text swaps in place: the outgoing text fades out, then the
	// incoming fades in, each nudged the way the scroll went (passed stops wait
	// just above, stops to come just below)
	const place = (index: number) =>
		intro || index > active ? 'after' : index < active ? 'before' : 'here';

	const select = (index: number) => {
		const stop = stops.current[index];
		if (!pinned || !stop) setActive(index);
		else if (lenis) lenis.scrollTo(centerOf(stop));
		else stop.scrollIntoView({ block: 'center' });
	};

	return (
		<section className="mx-auto max-w-5xl px-6 sm:px-8 xl:max-w-7xl">
			{/* Below xl the stops are invisible spacers under the pinned demo, which
			    shows the stop's title and description above it and its hint below */}
			<div ref={tour} className="tour grid xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-16">
				{/* the padding makes the tour a full viewport taller than its stops, so the
				    demo is pinned, and centered, even at the first and last */}
				<ol className="col-start-1 row-start-1 py-[15vh]">
					<li ref={introStop} className="min-h-[70vh]" />
					{TOUR.map((stop, index) => (
						<li
							key={stop.name}
							ref={(element) => {
								stops.current[index] = element;
							}}
							data-active={index === active}
							className="group flex min-h-[70vh] flex-col justify-center"
						>
							<div
								ref={index === 0 ? firstText : undefined}
								className="translate-y-3 opacity-20 transition-[opacity,translate] duration-700 ease-out group-data-[active=true]:translate-y-0 group-data-[active=true]:opacity-100 max-xl:invisible"
							>
								<button
									type="button"
									aria-pressed={index === active}
									onClick={() => select(index)}
									className="cursor-pointer text-left text-3xl font-semibold tracking-tight text-balance"
								>
									{stop.title}
								</button>
								<p className="mt-4 text-lg text-pretty text-black/60">{stop.body}</p>
								<TryIt className="mt-5">{stop.hint}</TryIt>
							</div>
						</li>
					))}
				</ol>
				<div
					ref={pin}
					className="sticky top-0 col-start-1 row-start-1 flex h-screen items-center self-start xl:col-start-2"
				>
					{/* undocked (--dock 0), the demo shifts left by half the stops' column and
					    the gap, which centers it in the tour. Below xl it's capped at 52rem, the width
					    of that column in a full-width tour, so it stays one size throughout */}
					{/* The demo and its prompt rise in from below the page once the demo
					    has something to show, the demo a beat behind; opening scrolled
					    down, they're simply there. The rise uses transform, leaving translate
					    to the dock. */}
					<div className="tour-demo relative mx-auto w-full [transition:opacity_1.6s_ease-out,transform_1.6s_cubic-bezier(0.16,1,0.3,1)] has-[[data-entrance=instant]]:transition-none has-[[data-entrance=waiting]]:opacity-0 motion-safe:has-[[data-entrance=waiting]]:[transform:translateY(60vh)] max-xl:max-w-[min(52rem,calc((100vh-19rem)*1.6))] xl:max-w-[calc((100vh-9rem)*1.6)] xl:translate-x-[calc(-12rem*(1-var(--dock,0)))]">
						{/* hangs above the demo, so the demo itself stays centered. It undoes
						    the dock's shift, staying put to fade out while the demo moves over */}
						<div
							data-track="intro"
							data-distance={40}
							aria-hidden
							className="absolute inset-x-0 bottom-full mb-6 hidden flex-col items-center gap-2 text-center text-2xl font-semibold tracking-tight xl:flex xl:[transform:translateX(calc(-12rem*var(--dock,0)))]"
						>
							Scroll to take the tour
							<ChevronDownIcon className="size-6 animate-bounce text-black/40" />
						</div>
						<div className="grid xl:hidden">
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
									data-place={place(index)}
									aria-hidden={intro || index !== active}
									className="col-start-1 row-start-1 text-center text-2xl font-semibold tracking-tight text-balance transition-[opacity,translate] duration-200 ease-out not-data-[place=here]:opacity-0 data-[place=here]:delay-200 data-[place=here]:duration-300 motion-safe:data-[place=after]:translate-y-2 motion-safe:data-[place=before]:-translate-y-2"
								>
									{stop.title}
								</h3>
							))}
						</div>
						{/* a fixed height, so the demo holds still between stops */}
						<div className="mt-2 mb-5 grid xl:hidden">
							<div data-fade="arrow" className="col-start-1 row-start-1 flex justify-center">
								<ChevronDownIcon className="size-6 animate-bounce text-black/40" />
							</div>
							{TOUR.map((stop, index) => (
								<p
									key={stop.name}
									data-place={place(index)}
									aria-hidden={intro || index !== active}
									className="col-start-1 row-start-1 mx-auto max-w-2xl text-center text-pretty text-black/60 transition-[opacity,translate] duration-200 ease-out not-data-[place=here]:opacity-0 data-[place=here]:delay-200 data-[place=here]:duration-300 motion-safe:data-[place=after]:translate-y-2 motion-safe:data-[place=before]:-translate-y-2"
								>
									{stop.body}
								</p>
							))}
						</div>
						{/* above the text below it, which the expand button hangs into */}
						<div className="tour-rise relative z-10">
							<div className="[transition:opacity_1.6s_ease-out_200ms,transform_1.6s_cubic-bezier(0.16,1,0.3,1)_200ms] has-[[data-entrance=instant]]:transition-none has-[[data-entrance=waiting]]:opacity-0 motion-safe:has-[[data-entrance=waiting]]:[transform:translateY(8vh)]">
								<LiveDemo screen={TOUR[active].name} alt={TOUR[active].alt} />
							</div>
						</div>
						<div className="mt-5 grid xl:hidden">
							{TOUR.map((stop, index) => (
								<TryIt
									key={stop.name}
									data-place={place(index)}
									aria-hidden={intro || index !== active}
									plain
									className="col-start-1 row-start-1 transition-[opacity,translate] duration-200 ease-out not-data-[place=here]:opacity-0 data-[place=here]:delay-200 data-[place=here]:duration-300 motion-safe:data-[place=after]:translate-y-2 motion-safe:data-[place=before]:-translate-y-2"
								>
									{stop.hint}
								</TryIt>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function clamp(value: number): number {
	return Math.min(1, Math.max(0, value));
}

// how far an element's middle is below the viewport's, in pixels
function middleOf(element: HTMLElement | null): number {
	if (!element) return 0;
	const { top, height } = element.getBoundingClientRect();
	return top + height / 2 - window.innerHeight / 2;
}

// how far an element's middle is from the viewport's, in its own heights
function offsetOf(element: HTMLElement | null): number {
	if (!element) return 0;
	const { top, height } = element.getBoundingClientRect();
	return (top + height / 2 - window.innerHeight / 2) / height;
}

// something to do in the live demo at this stop
// boxed beside the stops on xl; plain text under the demo below it, where a
// box would crowd the demo
function TryIt({
	plain = false,
	className,
	children,
	...props
}: ComponentProps<'p'> & { plain?: boolean }) {
	if (plain) {
		return (
			<p {...props} className={cn('text-center text-sm text-pretty text-black/50', className)}>
				<strong className="font-semibold text-black/70">Try it:</strong> {children}
			</p>
		);
	}
	return (
		<p
			{...props}
			className={cn(
				'inline-flex items-start gap-2 rounded-lg border border-black/10 bg-black/[0.03] px-3 py-2 text-left text-sm text-pretty text-black/70',
				className
			)}
		>
			<MousePointerClickIcon className="mt-0.5 size-4 shrink-0 text-black/40" aria-hidden />
			<span>
				<strong className="font-semibold text-black">Try it</strong> {children}
			</span>
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
			<div className="mx-auto max-w-5xl px-6 sm:px-8 xl:max-w-7xl">
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
						envelopes, save toward goals, build reports, and ask questions about your spending. It
						all lives in one SQLite file, with no account and no cloud.
					</p>
					<div className="rise mt-8 flex flex-wrap items-center gap-3 [--delay:240ms]">
						<DownloadButton />
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

			<div className="mx-auto max-w-5xl px-6 pb-16 sm:px-8 xl:max-w-7xl">
				<div className="mt-8 space-y-20 md:hidden">
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
								<DownloadButton />
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
