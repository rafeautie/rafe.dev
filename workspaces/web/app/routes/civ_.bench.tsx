import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';
import { Button } from '~/components/ui/button';
import {
	BENCH_CASES,
	benchText,
	replyText,
	summarize,
	type BenchRow,
	type BenchSummary
} from '~/lib/llm/bench';
import { Dropped, useMind, type MindState } from '~/lib/llm/client';
import {
	downloadSize,
	dtypeFor,
	findCached,
	FIT_LABELS,
	fitFor,
	MIND_MODELS,
	readDevice,
	type DeviceInfo,
	type MindModel
} from '~/lib/llm/models';
import { cn } from '~/lib/utils';

// How fast the simulation's people can think on this machine: loads Gemma 4
// in the browser (lib/llm/mind.worker.ts) and times a dozen requests like the
// ones the simulation makes. Not under the /civ page, and not for search.

export const Route = createFileRoute('/civ_/bench')({
	head: () => ({
		meta: [
			{ title: 'Civ bench | Rafe Autie' },
			{ name: 'description', content: 'How fast a small model thinks in this browser.' },
			{ name: 'robots', content: 'noindex' }
		]
	}),
	component: BenchPage
});

function BenchPage() {
	return (
		<div className="min-h-dvh p-6 text-base text-foreground sm:p-8">
			<div className="flex items-center justify-between gap-4">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					<Link href="/civ">civ</Link>
					bench
				</SlashNav>
				<ThemeToggle />
			</div>
			<div className="mt-6 max-w-5xl sm:mt-8">
				<ClientOnly fallback={<p className="text-sm text-foreground/50">Reading this device…</p>}>
					<Bench />
				</ClientOnly>
			</div>
		</div>
	);
}

const STAGES = {
	starting: 'Starting',
	downloading: 'Downloading',
	reading: 'Loading from the browser',
	preparing: 'Preparing',
	warming: 'Warming up and checking prompt-start reuse'
};

function Bench() {
	const [device, setDevice] = useState<DeviceInfo>();
	const [cached, setCached] = useState<Set<string>>(new Set());
	const [model, setModel] = useState<MindModel>(MIND_MODELS[0]);
	const { state, mind } = useMind();
	const [rows, setRows] = useState<BenchRow[]>([]);
	const [running, setRunning] = useState(false);
	const [compare, setCompare] = useState(true);
	const [copied, setCopied] = useState(false);
	const stopped = useRef(false);

	useEffect(() => {
		void readDevice().then(setDevice);
		void findCached().then(setCached);
	}, []);

	if (!device) return <p className="text-sm text-foreground/50">Reading this device…</p>;
	const ready = state.status === 'ready' ? state : undefined;
	const busy = state.status === 'loading' || running;

	async function run() {
		if (!ready) return;
		stopped.current = false;
		setRunning(true);
		setRows([]);
		setCopied(false);
		const ways = ready.reuse.ok ? (compare ? [true, false] : [true]) : [false];
		const done: BenchRow[] = [];
		for (const reuse of ways) {
			for (const benchCase of BENCH_CASES) {
				if (stopped.current) break;
				const started = performance.now();
				try {
					const result = await mind.ask({ ...benchCase.ask, reuse });
					done.push({ case: benchCase, reuse, result, totalMs: performance.now() - started });
				} catch (error) {
					if (error instanceof Dropped) break;
					const message = error instanceof Error ? error.message : String(error);
					done.push({
						case: benchCase,
						reuse,
						error: message,
						totalMs: performance.now() - started
					});
				}
				setRows([...done]);
			}
		}
		setRunning(false);
	}

	function stop() {
		stopped.current = true;
		mind.stop();
	}

	async function copy() {
		if (!ready) return;
		const about = [
			`Civ bench, ${new Date().toISOString()}`,
			`Model: ${ready.model.name} (${dtypeFor(device!)}, ${device!.webgpu ? 'WebGPU' : 'WebAssembly'})`,
			`Device: ${describeDevice(device!)}`,
			`Browser: ${navigator.userAgent}`,
			`Prompt-start reuse check: ${describeReuse(ready.reuse)}`
		];
		await navigator.clipboard.writeText(benchText(about, rows));
		setCopied(true);
	}

	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-2">
				<p className="text-sm text-pretty text-foreground/60">
					Times a dozen requests like the ones the people of the civ simulation will make, on a
					model running in this browser: an idea, a prayer, a council choice and a line of talk,
					three of each, all starting with the same opening about their world.
				</p>
				<p className="text-sm text-foreground/50">This device: {describeDevice(device)}</p>
			</section>

			<section className="flex flex-col gap-3">
				<p className="text-sm text-foreground/50">Model</p>
				<div className="grid gap-2 sm:grid-cols-2">
					{MIND_MODELS.map((m) => (
						<label
							key={m.id}
							className={cn(
								'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
								m === model
									? 'border-foreground/50 bg-foreground/[0.04]'
									: 'border-foreground/10 hover:border-foreground/25',
								busy && 'pointer-events-none opacity-60'
							)}
						>
							<input
								type="radio"
								name="model"
								className="sr-only"
								checked={m === model}
								disabled={busy}
								onChange={() => setModel(m)}
							/>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="text-sm font-medium">{m.name}</span>
								<span className="text-xs text-foreground/50">
									{cached.has(m.id) ? 'Downloaded' : `${downloadSize(m, device).toFixed(1)} GB`}
								</span>
							</span>
							<span className="text-xs whitespace-nowrap text-foreground/50">
								{FIT_LABELS[fitFor(m, device)]}
							</span>
						</label>
					))}
				</div>
				<Loader
					model={model}
					device={device}
					cached={cached.has(model.id)}
					state={state}
					disabled={busy}
					onLoad={() => mind.load(model, device)}
				/>
			</section>

			{ready && (
				<section className="flex flex-col gap-3">
					<p className="text-sm text-foreground/60">
						{ready.model.name} is ready. Prompt-start reuse: {describeReuse(ready.reuse)}
					</p>
					{ready.reuse.ok && (
						<label className="flex items-center gap-2 text-sm text-foreground/60">
							<input
								type="checkbox"
								checked={compare}
								disabled={running}
								onChange={(event) => setCompare(event.target.checked)}
							/>
							Run each request again without reuse, to compare
						</label>
					)}
					<div className="flex gap-2">
						{running ? (
							<Button variant="outline" onClick={stop}>
								Stop
							</Button>
						) : (
							<Button onClick={() => void run()}>Run the bench</Button>
						)}
						{rows.length > 0 && !running && (
							<Button variant="outline" onClick={() => void copy()}>
								{copied ? 'Copied' : 'Copy results'}
							</Button>
						)}
					</div>
				</section>
			)}

			{rows.length > 0 && (
				<>
					<section className="grid gap-3 sm:grid-cols-2">
						<Summary title="With prompt-start reuse" summary={summarize(rows, true)} />
						<Summary title="Reading every prompt whole" summary={summarize(rows, false)} />
					</section>
					<Table rows={rows} />
				</>
			)}
		</div>
	);
}

function Loader({
	model,
	device,
	cached,
	state,
	disabled,
	onLoad
}: {
	model: MindModel;
	device: DeviceInfo;
	cached: boolean;
	state: MindState;
	disabled: boolean;
	onLoad: () => void;
}) {
	if (state.status === 'loading') {
		const percent = Math.round(state.progress * 100);
		return (
			<div className="flex flex-col gap-2">
				<p className="text-sm text-foreground/60">
					{STAGES[state.stage]} {state.model.name}
					{state.stage === 'downloading' ? ` · ${percent}%` : '…'}
				</p>
				<div className="h-1 overflow-hidden rounded-full bg-foreground/10">
					<div
						className="h-full bg-foreground/60 transition-all"
						style={{ width: `${percent}%` }}
					/>
				</div>
			</div>
		);
	}
	const loaded = state.status === 'ready' && state.model === model;
	return (
		<div className="flex flex-col items-start gap-2">
			{state.status === 'error' && (
				<p className="text-sm text-red-600 dark:text-red-400">
					{state.model.name} didn&rsquo;t load: {state.message}
				</p>
			)}
			{!loaded && (
				<>
					<p className="text-sm text-pretty text-foreground/50">
						{cached
							? `${model.name} is in this browser already, so it loads without downloading.`
							: `This downloads ${downloadSize(model, device).toFixed(1)} GB from Hugging Face. The browser keeps it, so later visits (and /chess) load it without downloading again.`}
					</p>
					<Button variant="outline" disabled={disabled} onClick={onLoad}>
						{cached
							? `Load ${model.name}`
							: `Download ${model.name} (${downloadSize(model, device).toFixed(1)} GB)`}
					</Button>
				</>
			)}
		</div>
	);
}

function Summary({ title, summary }: { title: string; summary?: BenchSummary }) {
	return (
		<div className="rounded-lg border border-foreground/10 px-4 py-3">
			<p className="text-sm text-foreground/50">{title}</p>
			{summary ? (
				<>
					<p className="mt-1 text-2xl font-medium tabular-nums">
						{Math.round(summary.medianMs)} ms
						<span className="text-sm font-normal text-foreground/50"> median per call</span>
					</p>
					<p className="text-sm text-foreground/60 tabular-nums">
						About {Math.floor(summary.perMinute)} calls a minute, one after another ({summary.calls}{' '}
						calls)
					</p>
				</>
			) : (
				<p className="mt-1 text-sm text-foreground/40">Not run</p>
			)}
		</div>
	);
}

const ms = (value: number) => Math.round(value).toLocaleString();

function Table({ rows }: { rows: BenchRow[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-left text-sm tabular-nums">
				<thead className="text-xs text-foreground/50">
					<tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-normal">
						<th>Request</th>
						<th className="text-right">Prompt</th>
						<th className="text-right">Reused</th>
						<th className="text-right">Read ms</th>
						<th className="text-right">Written</th>
						<th className="text-right">Write ms</th>
						<th className="text-right">Total ms</th>
						<th>Reply</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => {
						const speed = row.result?.speed;
						return (
							<tr
								key={i}
								className="border-t border-foreground/10 align-top [&>td]:px-2 [&>td]:py-1.5"
							>
								<td className="whitespace-nowrap">
									<span className="text-foreground/50">{row.case.kind}</span> {row.case.name}
									{!row.reuse && <span className="text-foreground/40"> · whole</span>}
								</td>
								<td className="text-right">{speed?.promptTokens ?? '–'}</td>
								<td className="text-right">{speed?.reusedTokens ?? '–'}</td>
								<td className="text-right">{speed ? ms(speed.readMs) : '–'}</td>
								<td className="text-right">{speed?.writtenTokens ?? '–'}</td>
								<td className="text-right">{speed ? ms(speed.writeMs) : '–'}</td>
								<td className="text-right">{ms(row.totalMs)}</td>
								<td className="min-w-64 text-foreground/70">
									{row.result ? (
										replyText(row.result)
									) : (
										<span className="text-red-600 dark:text-red-400">{row.error}</span>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function describeDevice(device: DeviceInfo): string {
	const parts = [
		device.webgpu
			? `WebGPU${device.f16 ? ' with 16-bit math' : ''}, largest GPU buffer ${device.maxBuffer.toFixed(1)} GB`
			: 'no WebGPU, so the model runs on the processor (slow)'
	];
	if (device.memory) parts.push(`${device.memory} GB memory (browsers say 8 at most)`);
	if (device.phone) parts.push('a phone or tablet');
	return parts.join(', ');
}

function describeReuse(reuse: Extract<MindState, { status: 'ready' }>['reuse']): string {
	if (reuse.ok) return `works (scores within ${reuse.drift.toFixed(3)} of reading whole)`;
	const detail =
		reuse.drift !== undefined
			? `, ${reuse.agree ? 'same' : 'a different'} next token, scores up to ${reuse.drift.toFixed(2)} apart`
			: '';
	return `off: ${reuse.reason}${detail}`;
}
