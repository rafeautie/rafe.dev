import { createFileRoute } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'framer-motion';
import {
	ArrowLeftRight,
	Cpu,
	Download,
	FileUp,
	KeyRound,
	Landmark,
	Mail,
	TrendingUp,
	Undo2
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
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
		<span className={cn('font-semibold tracking-tight', className)}>
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

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<p className="font-mono text-xs tracking-[0.22em] text-muted-foreground uppercase">
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
		<span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/70">
			{txn.transfer && <ArrowLeftRight className="size-3" />}
			{txn.category}
		</span>
	);
}

function AppWindowMock() {
	return (
		<div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_60px_-24px_rgb(0_0_0/0.25)]">
			<div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
				<div className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-foreground/10" />
					<span className="size-2.5 rounded-full bg-foreground/10" />
					<span className="size-2.5 rounded-full bg-foreground/10" />
				</div>
				<span className="font-mono text-xs text-muted-foreground">shmoney: data.sqlite</span>
				<Badge variant="outline" className="ml-auto border-bill/30 text-bill">
					Offline OK
				</Badge>
			</div>
			<div className="flex">
				<aside className="hidden w-44 shrink-0 flex-col gap-4 border-r border-border p-4 md:flex">
					<nav className="space-y-1 text-xs text-muted-foreground">
						<p className="rounded-md bg-muted px-2 py-1.5 text-foreground">Transactions</p>
						<p className="px-2 py-1.5">Budget</p>
						<p className="px-2 py-1.5">Reports</p>
					</nav>
					<div className="space-y-3 border-t border-border pt-3">
						<p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
							Envelopes
						</p>
						{ENVELOPES.map((env) => (
							<div key={env.name} className="space-y-1.5">
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-xs text-foreground/80">{env.name}</span>
									<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
										{env.spent} / {env.budget}
									</span>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-bill/70"
										style={{ width: `${Math.round((env.spent / env.budget) * 100)}%` }}
									/>
								</div>
							</div>
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
								<tr key={`${txn.date}-${txn.payee}`} className="border-b border-border/60">
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
											txn.incoming ? 'text-bill' : 'text-foreground/80'
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
						<span className="ml-auto text-bill">0 bytes to the cloud</span>
					</div>
				</div>
			</div>
		</div>
	);
}

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
	const reduceMotion = useReducedMotion();
	return (
		<div className="overflow-x-clip bg-background font-sans text-foreground selection:bg-bill/20">
			<div className="mx-auto max-w-5xl px-6 pb-16 sm:px-8">
				<header className="flex items-center justify-between pt-8">
					<p className="text-xl font-medium">
						<a href="/">rafe</a> <span className="text-muted-foreground">/</span>{' '}
						<Wordmark className="font-medium" />
					</p>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<GitHubIcon className="size-4" />
						GitHub
					</a>
				</header>

				<motion.section
					initial={reduceMotion ? false : { opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: 'easeOut' }}
					className="relative pt-20 sm:pt-24"
				>
					<Guilloche className="pointer-events-none absolute -top-24 -right-56 -z-10 w-[42rem] [mask-image:radial-gradient(closest-side,black,transparent)] text-foreground opacity-[0.05]" />
					<p className="font-mono text-xs tracking-[0.22em] text-bill uppercase">
						Private first · Local first · Personal first
					</p>
					<h1 className="mt-5 max-w-xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
						Your money, on your machine.
					</h1>
					<p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
						shmoney is a desktop app for your whole financial life: bank sync, envelope budgets, and
						AI categorization that runs offline. Everything lives in one SQLite file on your
						computer. No cloud. No account. No telemetry.
					</p>
					<div className="mt-8 flex flex-wrap items-center gap-3">
						<Button asChild size="lg" className="px-4">
							<a href={RELEASES_URL} target="_blank" rel="noreferrer">
								<Download data-icon="inline-start" className="size-4" />
								Download for free
							</a>
						</Button>
						<Button asChild variant="outline" size="lg" className="px-4">
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								View the source
							</a>
						</Button>
					</div>
					<p className="mt-4 font-mono text-xs text-muted-foreground">
						Windows · macOS · Linux · free for personal use
					</p>
				</motion.section>

				<motion.section
					initial={reduceMotion ? false : { opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.12, ease: 'easeOut' }}
					className="mt-14"
				>
					<AppWindowMock />
				</motion.section>

				<section className="mt-24">
					<SectionLabel>What it does</SectionLabel>
					<div className="mt-6 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
						{FEATURES.map((feature) => (
							<div key={feature.title} className="border-t border-border pt-5">
								<feature.icon className="size-4 text-bill" aria-hidden="true" />
								<h2 className="mt-3 font-medium">{feature.title}</h2>
								<p className="mt-1.5 text-sm text-pretty text-muted-foreground">{feature.body}</p>
							</div>
						))}
					</div>
				</section>

				<section className="mt-24">
					<SectionLabel>The privacy ledger</SectionLabel>
					<div className="mt-6 rounded-xl bg-ink-deep p-7 text-paper sm:p-10">
						<div className="flex items-baseline justify-between gap-3 border-b border-paper/60 pb-3">
							<span className="font-mono text-xs tracking-[0.18em] uppercase">
								Statement of disclosure
							</span>
							<span className="hidden font-mono text-xs text-paper/60 tabular-nums sm:inline">
								No. 000000
							</span>
						</div>
						<dl className="divide-y divide-paper/15">
							{LEDGER_ROWS.map((row) => (
								<div key={row.item} className="flex items-baseline gap-3 py-3">
									<dt className="text-sm text-paper/85">{row.item}</dt>
									<span
										aria-hidden="true"
										className="mx-1 flex-1 border-b border-dotted border-paper/30"
									/>
									<dd className="font-mono text-sm whitespace-nowrap tabular-nums">{row.value}</dd>
								</div>
							))}
						</dl>
						<div className="flex items-baseline justify-between gap-3 border-t border-paper/60 pt-4">
							<span className="font-medium">Total leaving your machine</span>
							<span className="font-mono font-semibold text-[oklch(0.82_0.1_162)]">Nothing</span>
						</div>
						<p className="mt-5 max-w-xl text-xs text-pretty text-paper/60">
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
						<Button asChild size="lg" className="px-4">
							<a href={RELEASES_URL} target="_blank" rel="noreferrer">
								<Download data-icon="inline-start" className="size-4" />
								Download shmoney
							</a>
						</Button>
						<Button asChild variant="outline" size="lg" className="px-4">
							<a href={GITHUB_URL} target="_blank" rel="noreferrer">
								<GitHubIcon className="size-4" />
								Star on GitHub
							</a>
						</Button>
					</div>
					<p className="font-mono text-xs text-muted-foreground">
						Pre-1.0 · PolyForm Noncommercial 1.0.0 · free for personal use
					</p>
				</section>

				<footer className="mt-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
					<Wordmark className="text-foreground" />
					<p>
						Built by{' '}
						<a href="https://rafe.dev" className="text-foreground/80 hover:text-foreground">
							Rafe Autie
						</a>
					</p>
					<a
						href={GITHUB_URL}
						target="_blank"
						rel="noreferrer"
						className="ml-auto hover:text-foreground"
					>
						GitHub
					</a>
				</footer>
			</div>
		</div>
	);
}
