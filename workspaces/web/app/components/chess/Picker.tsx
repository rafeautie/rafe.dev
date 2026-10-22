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

// Choosing an opponent: the models that should run on this device, by family
// and then size, each with its download size and how well it should run. The
// player always has white.

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
	const hidden = MODELS.filter((m) => fitFor(m, device) === 'too-large');
	const shown = showAll ? MODELS : MODELS.filter((m) => !hidden.includes(m) || m === model);
	const families = [...new Set(shown.map((m) => m.family))].map((family) => ({
		family,
		models: shown
			.filter((m) => m.family === family)
			.sort((a, b) => downloadSize(a, device) - downloadSize(b, device))
	}));

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
					<div className="flex flex-col gap-5 pr-3">
						{families.map(({ family, models }) => (
							<div key={family} role="group" aria-label={family} className="flex flex-col gap-2">
								<p className="text-xs font-medium text-foreground/50">{family}</p>
								{models.map((m) => {
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
													{cached.has(m.id)
														? 'Downloaded'
														: `${downloadSize(m, device).toFixed(1)} GB`}
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
						))}
					</div>
				</ScrollArea>
				{hidden.length > 0 && (
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
