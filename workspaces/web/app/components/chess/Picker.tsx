import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
	downloadSize,
	FIT_LABELS,
	fitFor,
	MODELS,
	type ChessModel,
	type DeviceInfo
} from '~/lib/chess/models';
import { cn } from '~/lib/utils';
import { ACCENT_BUTTON } from '~/components/chess/Rail';

// Choosing an opponent: the models that should run on this device, each with
// its download size and how well it should run. The player always has white.

export function Picker({
	device,
	model,
	cached,
	onModel,
	onStart
}: {
	device: DeviceInfo;
	model: ChessModel;
	// models already downloaded, which start at once
	cached: Set<string>;
	onModel: (model: ChessModel) => void;
	onStart: () => void;
}) {
	const [showAll, setShowAll] = useState(false);
	const [query, setQuery] = useState('');
	const hidden = MODELS.filter((m) => fitFor(m, device) === 'too-large');
	// a search looks through every model, the ones too large for this device too
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const shown = words.length
		? MODELS.filter((m) => words.every((w) => `${m.name} ${m.maker}`.toLowerCase().includes(w)))
		: showAll
			? MODELS
			: MODELS.filter((m) => !hidden.includes(m) || m === model);

	return (
		<div className="flex flex-col gap-6 xl:min-h-0 xl:flex-1">
			<div
				role="radiogroup"
				aria-labelledby="opponent-label"
				className="flex flex-col gap-2 xl:min-h-0 xl:flex-1"
			>
				<p id="opponent-label" className="mb-2 text-sm text-foreground/50">
					opponent
				</p>
				<input
					id="model-search"
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search models"
					aria-label="Search models"
					autoComplete="off"
					className="mr-3 mb-1 h-8 rounded-md border border-foreground/10 bg-transparent px-2.5 text-sm outline-none placeholder:text-foreground/40 focus-visible:border-(--chess-accent) focus-visible:ring-2 focus-visible:ring-(--chess-accent)/25"
				/>
				{!device.webgpu && (
					<p className="mb-1 text-sm text-pretty text-foreground/60">
						This browser has no WebGPU, so the model runs on the processor and only the lightest are
						offered.
					</p>
				)}
				<ScrollArea
					fade
					className="xl:min-h-0 xl:flex-1"
					viewportClassName="max-h-[min(24rem,50dvh)] xl:max-h-none"
				>
					<div className="flex flex-col gap-2 pr-3">
						{shown.length === 0 && (
							<p className="py-2 text-sm text-foreground/50">No model matches “{query}”.</p>
						)}
						{shown.map((m) => {
							const fit = fitFor(m, device);
							return (
								<label
									key={m.id}
									className={cn(
										'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
										m === model
											? 'border-(--chess-accent) bg-(--chess-accent)/5'
											: 'border-foreground/10 hover:border-foreground/25'
									)}
								>
									<input
										type="radio"
										name="model"
										className="sr-only"
										checked={m === model}
										onChange={() => onModel(m)}
									/>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="text-sm font-medium">{m.name}</span>
										<span className="text-xs text-foreground/50">
											{m.maker} ·{' '}
											{cached.has(m.id) ? 'downloaded' : `${downloadSize(m, device).toFixed(1)} GB`}
										</span>
									</span>
									<span
										className={cn(
											'text-xs whitespace-nowrap',
											fit === 'good' ? 'text-foreground/60' : 'text-foreground/40'
										)}
									>
										{FIT_LABELS[fit]}
									</span>
								</label>
							);
						})}
					</div>
				</ScrollArea>
				{hidden.length > 0 && !words.length && (
					<button
						type="button"
						onClick={() => setShowAll(!showAll)}
						className="self-start text-xs text-foreground/50 hover:text-foreground"
					>
						{showAll
							? 'Hide the ones too large for this device'
							: `Show all (${hidden.length} more)`}
					</button>
				)}
			</div>

			<Button onClick={onStart} size="lg" className={ACCENT_BUTTON}>
				Play {model.name}
			</Button>
		</div>
	);
}
