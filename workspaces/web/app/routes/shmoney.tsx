import { createFileRoute } from '@tanstack/react-router';
import { Cpu, FileUp, Landmark, Mail, MessagesSquare, TrendingUp, Undo2 } from 'lucide-react';
import { GITHUB_URL } from '~/components/shmoney/constants';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { DownloadButton } from '~/components/shmoney/DownloadButton';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Guilloche } from '~/components/shmoney/Guilloche';
import { Logo } from '~/components/shmoney/Logo';
import { ScreenshotCarousel } from '~/components/shmoney/ScreenshotCarousel';
import { SectionLabel } from '~/components/shmoney/SectionLabel';
import { Wordmark } from '~/components/shmoney/Wordmark';
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
		]
	}),
	component: ShmoneyPage
});

const FEATURES = [
	{
		icon: Landmark,
		title: 'Bank sync via SimpleFIN',
		body: 'Pull fresh transactions straight from your banks. Credentials stay encrypted in your OS keychain.'
	},
	{
		icon: Cpu,
		title: 'Local AI categorization',
		body: 'An optional offline model files transactions into categories. Pair it with rules for the recurring stuff.'
	},
	{
		icon: MessagesSquare,
		title: 'Chat with your finances',
		body: 'Ask the same on-device model questions about your money. It runs read-only queries, charts the answer, and keeps history on your machine.'
	},
	{
		icon: Mail,
		title: 'Envelope budgets',
		body: 'Fill envelopes each month and catch overspending the moment it happens, not at the statement.'
	},
	{
		icon: FileUp,
		title: 'File imports',
		body: 'Bring your history along from CSV, TSV, OFX, QFX, or QIF exports.'
	},
	{
		icon: TrendingUp,
		title: 'Investments and net worth',
		body: 'Track holdings next to cash and see net worth as one number. Transfers between your accounts never count as spending.'
	},
	{
		icon: Undo2,
		title: 'Undo anything',
		body: 'Every change lands in an activity log and is reversible. Fat-finger a bulk edit? Take it back.'
	}
];

const LEDGER_ROWS = [
	{ item: 'Transactions uploaded to our servers', value: '0 bytes' },
	{ item: 'Credentials stored in the cloud', value: '0' },
	{ item: 'Telemetry and analytics events', value: '0' },
	{ item: 'Third parties with access to your data', value: '0' },
	{ item: 'Monthly subscription, personal use', value: '$0.00' }
];

function ShmoneyPage() {
	return (
		<div className="overflow-x-clip bg-background font-sans text-foreground selection:bg-azure/20">
			<div className="mx-auto max-w-5xl px-6 pb-16 sm:px-8">
				<header className="flex items-center justify-between pt-8">
					<div className="flex items-center gap-3">
						<Logo />
						<SlashNav className="text-xl font-medium">
							<Link href="/">rafe</Link>
							<Wordmark className="font-medium" />
						</SlashNav>
					</div>
					<Link
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
					>
						<GitHubIcon className="size-4" />
						GitHub
					</Link>
				</header>

				<section className="relative pt-20 sm:pt-24">
					<Guilloche className="pointer-events-none absolute -top-24 -right-56 -z-10 w-[42rem] [mask-image:radial-gradient(closest-side,black,transparent)] text-foreground opacity-[0.05]" />
					<p className="text-xs tracking-[0.22em] text-azure uppercase">
						Private first · Local first · Personal first
					</p>
					<h1 className="mt-5 max-w-xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
						Your money, on your machine.
					</h1>
					<p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
						shmoney is a desktop app for your whole financial life: bank sync, envelope budgets, and
						AI that categorizes your transactions and answers questions about your money, all
						offline. Everything lives in one SQLite file on your computer. No cloud. No account. No
						telemetry.
					</p>
					<div className="mt-8 flex flex-wrap items-center gap-3">
						<DownloadButton>Download for free</DownloadButton>
						<Button
							variant="outline"
							size="lg"
							className="px-4"
							render={<Link plain href={GITHUB_URL} target="_blank" rel="noreferrer" />}
						>
							View the source
						</Button>
					</div>
					<p className="mt-4 text-xs text-muted-foreground">
						Windows · macOS · Linux · free for personal use
					</p>
				</section>

				<section className="mt-14">
					{/* Break out of the center column so the side slides overflow it. */}
					<div className="relative left-1/2 w-screen max-w-7xl -translate-x-1/2">
						<ScreenshotCarousel />
					</div>
				</section>

				<section className="mt-24">
					<SectionLabel>What it does</SectionLabel>
					<div className="mt-6 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
						{FEATURES.map((feature) => (
							<div key={feature.title} className="border-t border-border pt-5">
								<feature.icon className="size-4 text-azure" aria-hidden="true" />
								<h2 className="mt-3 font-medium">{feature.title}</h2>
								<p className="mt-1.5 text-sm text-pretty text-muted-foreground">{feature.body}</p>
							</div>
						))}
					</div>
				</section>

				<section className="mt-24">
					<SectionLabel>The privacy ledger</SectionLabel>
					<div className="mt-6 rounded-xl border border-border bg-muted/40 p-7 sm:p-10">
						<div className="flex items-baseline justify-between gap-3 border-b border-foreground/20 pb-3">
							<span className="text-xs tracking-[0.18em] uppercase">Statement of disclosure</span>
							<span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
								No. 000000
							</span>
						</div>
						<dl className="py-2">
							{LEDGER_ROWS.map((row) => (
								<div key={row.item} className="flex items-baseline gap-3 py-2.5">
									<dt className="text-sm text-foreground/80">{row.item}</dt>
									<span
										aria-hidden="true"
										className="mx-1 flex-1 border-b border-dotted border-foreground/25"
									/>
									<dd className="text-sm whitespace-nowrap tabular-nums">{row.value}</dd>
								</div>
							))}
						</dl>
						<div className="flex items-baseline justify-between gap-3 border-t border-foreground/20 pt-4">
							<span className="font-medium">Total leaving your machine</span>
							<span className="font-semibold text-azure">Nothing</span>
						</div>
						<p className="mt-5 max-w-xl text-xs text-pretty text-muted-foreground">
							The only network calls shmoney makes are the ones you ask for: pulling transactions
							from your banks through SimpleFIN. Everything else, including the optional AI, runs
							offline.
						</p>
					</div>
				</section>

				<section className="mt-24 flex flex-col items-center gap-5 text-center">
					<h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
						Bring your money home.
					</h2>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<DownloadButton>Download shmoney</DownloadButton>
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
					<p className="text-xs text-muted-foreground">
						Pre-1.0 · PolyForm Noncommercial 1.0.0 · free for personal use
					</p>
				</section>

				<footer className="mt-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
					<span className="flex items-center gap-2">
						<Logo className="size-5 rounded-md" />
						<Wordmark className="text-foreground" />
					</span>
					<p>
						Built by{' '}
						<Link href="https://rafe.dev" className="text-foreground/80 hover:text-foreground">
							Rafe Autie
						</Link>
					</p>
					<Link
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="ml-auto hover:text-foreground"
					>
						GitHub
					</Link>
				</footer>
			</div>
		</div>
	);
}
