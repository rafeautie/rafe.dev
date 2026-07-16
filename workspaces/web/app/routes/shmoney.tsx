import { createFileRoute } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
	ArrowLeftRight,
	ArrowUpRight,
	Cpu,
	Download,
	FileUp,
	KeyRound,
	LayoutDashboard,
	SlidersHorizontal,
	TrendingUp,
	Undo2
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { cn } from '~/lib/utils';

const GITHUB_URL = 'https://github.com/rafeautie/shmoney';
const RELEASES_URL = `${GITHUB_URL}/releases`;

export const Route = createFileRoute('/shmoney')({
	head: () => ({
		meta: [
			{ title: 'shmoney | Your money, on your machine' },
			{
				name: 'description',
				content:
					'shmoney is a private, local-first personal finance app for your desktop. Bank sync, envelope budgets, and offline AI categorization, all stored in a single SQLite file on your computer.'
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

function Wordmark({ className }: { className?: string }) {
	return (
		<span className={cn('font-archivo font-semibold tracking-tight', className)}>
			<span className="text-bill">$</span>hmoney
		</span>
	);
}

function GitHubIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
		</svg>
	);
}

function Guilloche({ className }: { className?: string }) {
	const rings = [
		{ count: 20, rx: 380, ry: 130, offset: 0 },
		{ count: 20, rx: 270, ry: 84, offset: 4.5 }
	];
	return (
		<svg viewBox="0 0 800 800" aria-hidden="true" className={className}>
			<g fill="none" stroke="currentColor" strokeWidth="0.7">
				{rings.map((ring, r) =>
					Array.from({ length: ring.count }, (_, i) => (
						<ellipse
							key={`${r}-${i}`}
							cx="400"
							cy="400"
							rx={ring.rx}
							ry={ring.ry}
							transform={`rotate(${(i * 180) / ring.count + ring.offset} 400 400)`}
						/>
					))
				)}
			</g>
		</svg>
	);
}

function Reveal({
	children,
	delay = 0,
	className
}: {
	children: ReactNode;
	delay?: number;
	className?: string;
}) {
	const reduceMotion = useReducedMotion();
	if (reduceMotion) {
		return <div className={className}>{children}</div>;
	}
	return (
		<motion.div
			initial={{ opacity: 0, y: 24 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: '-80px' }}
			transition={{ duration: 0.55, delay, ease: 'easeOut' }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p className="font-archivo text-xs font-semibold tracking-[0.22em] text-bill uppercase">
			{children}
		</p>
	);
}

type Txn = {
	date: string;
	payee: string;
	category: string;
	amount: string;
	incoming?: boolean;
	transfer?: boolean;
	pending?: boolean;
};

const TRANSACTIONS: Txn[] = [
	{ date: 'Jul 14', payee: "Trader Joe's", category: 'Groceries', amount: '-84.20' },
	{
		date: 'Jul 14',
		payee: 'ACME Corp payroll',
		category: 'Income',
		amount: '+3,180.00',
		incoming: true
	},
	{ date: 'Jul 13', payee: 'Blue Bottle Coffee', category: 'Coffee', amount: '-6.75' },
	{
		date: 'Jul 12',
		payee: 'Transfer to savings',
		category: 'Transfer',
		amount: '-500.00',
		transfer: true
	},
	{ date: 'Jul 11', payee: 'Oakmont Apartments', category: 'Housing', amount: '-2,150.00' },
	{ date: 'Jul 11', payee: 'REI Co-op', category: 'Categorizing', amount: '-132.60', pending: true }
];

const ENVELOPES = [
	{ name: 'Groceries', spent: 412, budget: 600 },
	{ name: 'Dining out', spent: 96, budget: 150 },
	{ name: 'Fun money', spent: 58, budget: 120 }
];

function CategoryChip({ txn }: { txn: Txn }) {
	if (txn.pending) {
		return (
			<span className="inline-flex animate-pulse items-center gap-1 rounded-full bg-bill/10 px-2 py-0.5 text-[11px] text-bill">
				<Cpu className="size-3" />
				Categorizing
			</span>
		);
	}
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
				txn.transfer ? 'bg-secondary text-muted-foreground' : 'bg-secondary text-foreground/80'
			)}
		>
			{txn.transfer && <ArrowLeftRight className="size-3" />}
			{txn.category}
		</span>
	);
}

function EnvelopeMeter({ name, spent, budget }: { name: string; spent: number; budget: number }) {
	const pct = Math.round((spent / budget) * 100);
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-xs text-foreground/85">{name}</span>
				<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
					{spent} / {budget}
				</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
				<div className="h-full rounded-full bg-bill/80" style={{ width: `${pct}%` }} />
			</div>
		</div>
	);
}

function AppWindowMock() {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-ink-deep shadow-[0_40px_120px_-30px_rgb(0_0_0/0.7)]">
			<div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
				<div className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-foreground/15" />
					<span className="size-2.5 rounded-full bg-foreground/15" />
					<span className="size-2.5 rounded-full bg-foreground/15" />
				</div>
				<span className="font-mono text-xs text-muted-foreground">shmoney: data.sqlite</span>
				<Badge variant="outline" className="ml-auto border-bill/30 text-bill">
					Offline OK
				</Badge>
			</div>
			<div className="flex">
				<aside className="hidden w-48 shrink-0 flex-col gap-5 border-r border-border p-4 md:flex">
					<nav className="space-y-1 text-xs text-muted-foreground">
						<p className="rounded-md bg-secondary px-2 py-1.5 text-foreground">Transactions</p>
						<p className="px-2 py-1.5">Budget</p>
						<p className="px-2 py-1.5">Investments</p>
						<p className="px-2 py-1.5">Reports</p>
						<p className="px-2 py-1.5">Activity</p>
					</nav>
					<div className="space-y-3 border-t border-border pt-4">
						<p className="font-archivo text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
							Envelopes
						</p>
						{ENVELOPES.map((env) => (
							<EnvelopeMeter key={env.name} {...env} />
						))}
					</div>
				</aside>
				<div className="min-w-0 flex-1">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-border text-[11px] text-muted-foreground">
								<th className="px-4 py-2 font-medium">Date</th>
								<th className="px-4 py-2 font-medium">Payee</th>
								<th className="hidden px-4 py-2 font-medium sm:table-cell">Category</th>
								<th className="px-4 py-2 text-right font-medium">Amount</th>
							</tr>
						</thead>
						<tbody>
							{TRANSACTIONS.map((txn) => (
								<tr key={`${txn.date}-${txn.payee}`} className="border-b border-border/50">
									<td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
										{txn.date}
									</td>
									<td className="max-w-0 truncate px-4 py-2.5 text-[13px] text-foreground/90">
										{txn.payee}
									</td>
									<td className="hidden px-4 py-2.5 sm:table-cell">
										<CategoryChip txn={txn} />
									</td>
									<td
										className={cn(
											'px-4 py-2.5 text-right font-mono text-[13px] tabular-nums',
											txn.incoming ? 'text-bill' : 'text-foreground/90'
										)}
									>
										{txn.amount}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
						<span>Synced via SimpleFIN, 2m ago</span>
						<span className="hidden sm:inline">2,847 transactions</span>
						<span className="ml-auto text-bill">0 bytes to the cloud</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function ImportMock() {
	return (
		<div className="space-y-4 rounded-xl border border-border bg-ink-deep p-5 shadow-2xl">
			<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-foreground/25 px-6 py-8 text-center">
				<FileUp className="size-5 text-bill" />
				<p className="text-sm text-foreground/90">Drop statements here</p>
				<p className="text-xs text-muted-foreground">or connect a bank through SimpleFIN</p>
			</div>
			<div className="flex flex-wrap justify-center gap-2">
				{['CSV', 'TSV', 'OFX', 'QFX', 'QIF'].map((fmt) => (
					<Badge key={fmt} variant="secondary" className="font-mono">
						{fmt}
					</Badge>
				))}
			</div>
			<div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground">
				<KeyRound className="size-3.5 shrink-0 text-bill" />
				Credentials encrypted in your OS keychain, never written to disk in the clear
			</div>
		</div>
	);
}

const AI_ROWS = [
	{ payee: 'Shell Gas #4402', chip: 'Fuel', done: true },
	{ payee: 'Costco Wholesale', chip: 'Groceries', done: true },
	{ payee: 'Steam Purchase', chip: 'Categorizing', done: false }
];

function LocalAiMock() {
	return (
		<div className="space-y-3 rounded-xl border border-border bg-ink-deep p-5 shadow-2xl">
			{AI_ROWS.map((row) => (
				<div
					key={row.payee}
					className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2.5"
				>
					<span className="truncate text-sm text-foreground/90">{row.payee}</span>
					<span
						className={cn(
							'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
							row.done ? 'bg-bill/10 text-bill' : 'animate-pulse bg-secondary text-muted-foreground'
						)}
					>
						<Cpu className="size-3" />
						{row.chip}
					</span>
				</div>
			))}
			<div className="flex items-center justify-between px-1 pt-1 font-mono text-[11px] text-muted-foreground">
				<span>model: on-device (llama.cpp)</span>
				<span className="text-bill">network: none</span>
			</div>
		</div>
	);
}

function EnvelopesMock() {
	const envelopes = [
		{ name: 'Groceries', spent: 412, budget: 600, left: '$188.00 left' },
		{ name: 'Housing', spent: 2150, budget: 2150, left: 'Fully spent' },
		{ name: 'Fun money', spent: 58, budget: 120, left: '$62.00 left' }
	];
	return (
		<div className="space-y-3 rounded-xl border border-border bg-ink-deep p-5 shadow-2xl">
			{envelopes.map((env) => (
				<div key={env.name} className="space-y-2 rounded-lg bg-secondary/50 px-4 py-3">
					<div className="flex items-baseline justify-between gap-2">
						<span className="text-sm text-foreground/90">{env.name}</span>
						<span className="font-mono text-xs text-muted-foreground tabular-nums">{env.left}</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
						<div
							className="h-full rounded-full bg-bill/80"
							style={{ width: `${Math.min(100, Math.round((env.spent / env.budget) * 100))}%` }}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

const SHOWCASES = [
	{
		eyebrow: 'Sync and import',
		title: 'Every account, one ledger.',
		body: 'Connect your banks through SimpleFIN and pull fresh transactions whenever you like. Credentials are encrypted in your OS keychain, not in a config file. Moving from another tool? Import CSV, TSV, OFX, QFX, or QIF and keep your whole history.',
		mock: <ImportMock />
	},
	{
		eyebrow: 'Local AI',
		title: 'A categorizer that never leaves the house.',
		body: 'An optional offline model, powered by llama.cpp, reads your transactions and files them into categories on your own hardware. Pair it with the rules engine for the recurring stuff, and review every suggestion before it sticks.',
		mock: <LocalAiMock />
	},
	{
		eyebrow: 'Envelope budgets',
		title: 'Give every dollar a job.',
		body: 'Fill envelopes at the start of the month and watch them drain as you spend, so overspending shows up the moment it happens instead of at the statement. Transfers between your own accounts are detected automatically and never count as spending.',
		mock: <EnvelopesMock />
	}
];

const FEATURES = [
	{
		icon: SlidersHorizontal,
		title: 'Rules engine',
		body: 'Payee matches, amount ranges, whatever you need. Set a rule once and every future transaction files itself.'
	},
	{
		icon: ArrowLeftRight,
		title: 'Transfer detection',
		body: 'Money moving between your own accounts is flagged as a transfer, not spending, so reports stay honest.'
	},
	{
		icon: TrendingUp,
		title: 'Investments and net worth',
		body: 'Track holdings alongside cash accounts and see net worth as one number instead of five open tabs.'
	},
	{
		icon: LayoutDashboard,
		title: 'Dashboards and reports',
		body: 'Composable widgets for spending, income, and trends. Arrange the view however your money makes sense.'
	},
	{
		icon: Undo2,
		title: 'Activity log with undo',
		body: 'Every change is recorded and reversible. Fat-finger a bulk edit? Take it back.'
	},
	{
		icon: KeyRound,
		title: 'Keychain security',
		body: 'Bank credentials live in your OS keychain, encrypted by the platform and invisible to everything else.'
	}
];

const LEDGER_ROWS = [
	{ item: 'Transactions uploaded to our servers', value: '0 bytes' },
	{ item: 'Credentials stored in the cloud', value: '0' },
	{ item: 'Telemetry and analytics events', value: '0' },
	{ item: 'Third parties with access to your data', value: '0' },
	{ item: 'Monthly subscription, personal use', value: '$0.00' }
];

const FAQ = [
	{
		q: 'How does bank sync work without a cloud?',
		a: 'shmoney talks to your banks through SimpleFIN, a bridge built for exactly this. Your credentials are encrypted in your OS keychain, and transactions flow straight into the SQLite database on your machine. There is no shmoney server in the middle, because there is no shmoney server.'
	},
	{
		q: 'Where does my data live?',
		a: 'In a single SQLite file on your computer. You can back it up, move it between machines, or open it with any SQLite tool. It is your data in every sense, including the boring literal one.'
	},
	{
		q: 'Do I need the AI?',
		a: 'No. Categorization with a local model is optional and runs entirely offline through llama.cpp. The rules engine covers recurring transactions without any model at all, and you can always categorize by hand.'
	},
	{
		q: 'What does it cost?',
		a: 'Nothing for personal use. shmoney is licensed under PolyForm Noncommercial 1.0.0, so it is free to use for your own finances. Commercial use requires a separate license.'
	},
	{
		q: 'Is it stable?',
		a: 'shmoney is in active development and has not reached a stable release yet, so the database schema may still change between versions. The activity log with undo has your back while things evolve.'
	}
];

function ShmoneyPage() {
	const reduceMotion = useReducedMotion();
	return (
		<div className="shmoney bg-background font-sans text-foreground selection:bg-bill selection:text-ink-deep">
			<header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
					<a href="#top" className="text-lg">
						<Wordmark />
					</a>
					<nav className="ml-auto hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
						<a href="#features" className="transition-colors hover:text-foreground">
							Features
						</a>
						<a href="#privacy" className="transition-colors hover:text-foreground">
							Privacy
						</a>
						<a href="#faq" className="transition-colors hover:text-foreground">
							FAQ
						</a>
					</nav>
					<Button asChild variant="outline" size="sm" className="ml-auto sm:ml-0">
						<a href={GITHUB_URL} target="_blank" rel="noreferrer">
							<GitHubIcon className="size-3.5" />
							GitHub
						</a>
					</Button>
				</div>
			</header>

			<main id="top" className="relative overflow-x-clip">
				<section className="relative">
					<Guilloche className="pointer-events-none absolute -top-40 -right-64 w-[52rem] [mask-image:radial-gradient(closest-side,black,transparent)] text-paper opacity-[0.06]" />
					<div className="relative mx-auto max-w-6xl px-5 pt-20 pb-16 sm:pt-28">
						<motion.div
							initial={reduceMotion ? false : { opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, ease: 'easeOut' }}
							className="max-w-2xl space-y-6"
						>
							<Eyebrow>Private first · Local first · Personal first</Eyebrow>
							<h1 className="font-archivo text-5xl font-bold tracking-tight text-balance sm:text-6xl">
								Your money, on your machine.
							</h1>
							<p className="max-w-xl text-lg text-pretty text-muted-foreground">
								shmoney is a desktop app for tracking every account, budget, and dollar. It syncs
								your banks, sorts your spending with local AI, and keeps the whole ledger in one
								SQLite file on your computer. No cloud. No account. No telemetry.
							</p>
							<div className="flex flex-wrap items-center gap-3 pt-2">
								<Button asChild size="lg" className="px-4">
									<a href={RELEASES_URL} target="_blank" rel="noreferrer">
										<Download data-icon="inline-start" className="size-4" />
										Download for free
									</a>
								</Button>
								<Button asChild variant="outline" size="lg" className="px-4">
									<a href={GITHUB_URL} target="_blank" rel="noreferrer">
										<GitHubIcon className="size-4" />
										View the source
									</a>
								</Button>
							</div>
							<p className="font-mono text-xs text-muted-foreground">
								Windows · macOS · Linux · free for personal use
							</p>
						</motion.div>
						<motion.div
							initial={reduceMotion ? false : { opacity: 0, y: 32 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
							className="mt-14"
						>
							<AppWindowMock />
						</motion.div>
					</div>
				</section>

				<section className="border-y border-border bg-ink-deep/60">
					<div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 sm:grid-cols-4">
						{[
							{ figure: '1', label: 'SQLite file holds everything' },
							{ figure: '0', label: 'accounts or sign-ups required' },
							{ figure: '0', label: 'bytes of telemetry, ever' },
							{ figure: '$0', label: 'for personal use' }
						].map((stat) => (
							<div key={stat.label} className="space-y-1">
								<p className="font-mono text-3xl text-bill tabular-nums">{stat.figure}</p>
								<p className="text-sm text-muted-foreground">{stat.label}</p>
							</div>
						))}
					</div>
				</section>

				<section id="features" className="mx-auto max-w-6xl scroll-mt-20 space-y-24 px-5 py-24">
					{SHOWCASES.map((showcase, i) => (
						<Reveal key={showcase.title}>
							<div
								className={cn(
									'grid items-center gap-10 lg:grid-cols-2 lg:gap-16',
									i % 2 === 1 && 'lg:[&>*:first-child]:order-2'
								)}
							>
								<div className="space-y-4">
									<Eyebrow>{showcase.eyebrow}</Eyebrow>
									<h2 className="font-archivo text-3xl font-bold tracking-tight text-balance sm:text-4xl">
										{showcase.title}
									</h2>
									<p className="max-w-lg text-pretty text-muted-foreground">{showcase.body}</p>
								</div>
								{showcase.mock}
							</div>
						</Reveal>
					))}

					<Reveal>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{FEATURES.map((feature) => (
								<div
									key={feature.title}
									className="space-y-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/25"
								>
									<feature.icon className="size-5 text-bill" />
									<h3 className="font-medium">{feature.title}</h3>
									<p className="text-sm text-pretty text-muted-foreground">{feature.body}</p>
								</div>
							))}
						</div>
					</Reveal>
				</section>

				<section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24">
					<Reveal>
						<div className="mx-auto max-w-3xl space-y-4 text-center">
							<Eyebrow>The privacy ledger</Eyebrow>
							<h2 className="font-archivo text-3xl font-bold tracking-tight text-balance sm:text-4xl">
								What shmoney sends to the cloud, itemized.
							</h2>
						</div>
						<div className="mx-auto mt-10 max-w-2xl rounded-xl bg-paper p-7 text-ink-deep shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] sm:p-10">
							<div className="flex items-baseline justify-between border-b-2 border-ink-deep pb-3">
								<span className="font-archivo text-sm font-bold tracking-[0.18em] uppercase">
									Statement of disclosure
								</span>
								<span className="font-mono text-xs tabular-nums">No. 000000</span>
							</div>
							<dl className="divide-y divide-ink-deep/15">
								{LEDGER_ROWS.map((row) => (
									<div key={row.item} className="flex items-baseline gap-3 py-3.5">
										<dt className="text-sm">{row.item}</dt>
										<span
											aria-hidden="true"
											className="mx-1 flex-1 border-b border-dotted border-ink-deep/40"
										/>
										<dd className="font-mono text-sm font-medium tabular-nums">{row.value}</dd>
									</div>
								))}
							</dl>
							<div className="flex items-baseline justify-between gap-3 border-t-2 border-ink-deep pt-4">
								<span className="font-archivo text-base font-bold">Total leaving your machine</span>
								<span className="font-mono text-base font-semibold">Nothing</span>
							</div>
							<p className="mt-6 text-xs text-ink-deep/70">
								The only network calls shmoney makes are the ones you ask for: pulling transactions
								from your banks through SimpleFIN. Everything else, including the optional AI, runs
								offline.
							</p>
						</div>
					</Reveal>
				</section>

				<section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24">
					<Reveal className="mx-auto max-w-2xl">
						<Eyebrow>Questions</Eyebrow>
						<h2 className="mt-4 font-archivo text-3xl font-bold tracking-tight">
							Fair things to ask.
						</h2>
						<Accordion type="single" collapsible className="mt-8 w-full">
							{FAQ.map((item) => (
								<AccordionItem key={item.q} value={item.q}>
									<AccordionTrigger className="text-left text-base">{item.q}</AccordionTrigger>
									<AccordionContent className="text-pretty text-muted-foreground">
										{item.a}
									</AccordionContent>
								</AccordionItem>
							))}
						</Accordion>
					</Reveal>
				</section>

				<section id="download" className="relative overflow-hidden border-t border-border">
					<Guilloche className="pointer-events-none absolute -bottom-72 left-1/2 w-[60rem] -translate-x-1/2 [mask-image:radial-gradient(closest-side,black,transparent)] text-paper opacity-[0.05]" />
					<div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-24 text-center">
						<Badge variant="outline" className="border-bill/30 text-bill">
							Pre-1.0, in active development
						</Badge>
						<h2 className="font-archivo text-4xl font-bold tracking-tight text-balance sm:text-5xl">
							Bring your money home.
						</h2>
						<p className="max-w-md text-pretty text-muted-foreground">
							Free for personal use on Windows, macOS, and Linux. Grab a build from GitHub, or clone
							the repo and build it yourself.
						</p>
						<div className="flex flex-wrap items-center justify-center gap-3">
							<Button asChild size="lg" className="px-4">
								<a href={RELEASES_URL} target="_blank" rel="noreferrer">
									<Download data-icon="inline-start" className="size-4" />
									Download shmoney
								</a>
							</Button>
							<Button asChild variant="outline" size="lg" className="px-4">
								<a href={GITHUB_URL} target="_blank" rel="noreferrer">
									Star on GitHub
									<ArrowUpRight data-icon="inline-end" className="size-4" />
								</a>
							</Button>
						</div>
					</div>
				</section>
			</main>

			<footer className="border-t border-border">
				<div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
					<Wordmark className="text-base" />
					<Separator orientation="vertical" className="hidden h-4 sm:block" />
					<p>
						Built by{' '}
						<a href="https://rafe.dev" className="text-foreground/90 hover:text-foreground">
							Rafe Autie
						</a>
					</p>
					<div className="flex items-center gap-4 sm:ml-auto">
						<a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
							GitHub
						</a>
						<span className="font-mono text-xs">PolyForm Noncommercial 1.0.0</span>
					</div>
				</div>
				<p className="mx-auto max-w-6xl px-5 pb-8 font-mono text-xs text-muted-foreground/70">
					This page has no cookies and no trackers. You already knew that.
				</p>
			</footer>
		</div>
	);
}
