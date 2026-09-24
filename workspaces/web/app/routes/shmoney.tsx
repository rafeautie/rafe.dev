import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { DEMO_URL, GITHUB_URL } from '~/components/shmoney/constants';
import { DownloadButton } from '~/components/shmoney/DownloadButton';
import { Logo } from '~/components/shmoney/Logo';
import { LiveDemo } from '~/components/shmoney/LiveDemo';
import { Screenshot, type ScreenName } from '~/components/shmoney/Screenshot';
import { Button } from '~/components/ui/button';

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

type Shot = { name: ScreenName; alt: string; title: string; body: string };

// The page reads top to bottom as a series of screens, each the real app
// running with sample data (see LiveDemo). The model picker and the accounts
// overview close it out as stills: the demo can't run the on-device model,
// and accounts are a click away inside every live screen.
const LIVE: Shot[] = [
	{
		name: 'transactions',
		alt: 'shmoney transactions view with net worth, search and filters, and a categorized transaction list',
		title: 'Every transaction in one place',
		body: 'Sync from your banks through SimpleFIN, or import CSV, TSV, OFX, QFX, and QIF files. Rules and an optional offline model sort everything into categories.'
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
		body: 'Every change lands in an activity log and can be reversed, bulk edits included. Try it: change a category under Accounts, then come back here and undo it.'
	}
];

const STILLS: Shot[] = [
	{
		name: 'accounts',
		alt: 'shmoney accounts overview',
		title: 'Accounts and net worth',
		body: 'Investment holdings next to cash, with net worth as one number. Transfers between your own accounts never count as spending.'
	},
	{
		name: 'settings-llm',
		alt: 'shmoney settings for the offline AI categorization model',
		title: 'AI that stays offline',
		body: 'The optional categorization model is configured and run entirely on your machine.'
	}
];

// The page column is max-w-5xl less its padding, so half a row paints at
// about 470px.
const HALF_SIZES = '(min-width: 1024px) 470px, (min-width: 640px) 50vw, 100vw';

// Label on the left, content on the right. Captions, the privacy note, and the
// download block all share it so the page keeps one rhythm.
function Split({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="grid gap-2 sm:grid-cols-[1fr_2fr] sm:gap-10">
			<div className="font-medium">{label}</div>
			<div className="text-pretty text-black/60">{children}</div>
		</div>
	);
}

function ShmoneyPage() {
	return (
		<div className="bg-background text-base text-black">
			<div className="mx-auto max-w-5xl px-6 pb-16 sm:px-8">
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
					<Logo className="size-14 rounded-2xl" />
					<h1 className="mt-8 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
						Your money, on your machine.
					</h1>
					<p className="mt-5 max-w-xl text-lg text-pretty text-black/60">
						A personal finance app that runs entirely on your computer. Sync your banks, budget with
						envelopes, build reports, and ask questions about your spending. It all lives in one
						SQLite file, with no account and no cloud.
					</p>
					<div className="mt-8 flex flex-wrap items-center gap-3">
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
					<p className="mt-4 text-sm text-black/50">
						Free for personal use · Windows, macOS, and Linux
					</p>
					<p className="mt-10 text-sm text-black/60">
						{/* LiveDemo only runs the app from md up; phones get the screenshots */}
						<span className="hidden md:inline">
							The screens below are the real app, not pictures of it. Click around: it runs in your
							browser with sample data, and nothing is saved.
						</span>
						<span className="md:hidden">
							On a larger screen, the screens below are the live app with sample data.
						</span>
					</p>
				</section>

				<div className="mt-20 space-y-20 sm:mt-24 sm:space-y-28">
					{LIVE.map((shot, index) => (
						<figure key={shot.name}>
							<LiveDemo name={shot.name} alt={shot.alt} eager={index === 0} />
							<figcaption className="mt-6">
								<Split label={shot.title}>{shot.body}</Split>
							</figcaption>
						</figure>
					))}
					<div className="grid gap-x-8 gap-y-16 sm:grid-cols-2">
						{STILLS.map((shot) => (
							<figure key={shot.name}>
								<Screenshot name={shot.name} alt={shot.alt} sizes={HALF_SIZES} />
								<figcaption className="mt-5">
									<p className="font-medium">{shot.title}</p>
									<p className="mt-1 text-pretty text-black/60">{shot.body}</p>
								</figcaption>
							</figure>
						))}
					</div>
				</div>

				<section className="mt-28 space-y-12 border-t border-black/10 pt-10 sm:mt-36">
					<Split label={<h2>Privacy</h2>}>
						Nothing leaves your machine. Your data lives in one SQLite file, bank credentials stay
						encrypted in your OS keychain, and there is no account and no telemetry. The only
						network calls are the SimpleFIN syncs you ask for.
					</Split>
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
