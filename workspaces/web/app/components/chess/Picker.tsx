import { useState } from 'react';
import { Button } from '~/components/ui/button';
import {
	downloadSize,
	FIT_LABELS,
	fitFor,
	MODELS,
	type ChessModel,
	type DeviceInfo
} from '~/lib/chess/models';
import type { Side } from '~/lib/chess/storage';
import { cn } from '~/lib/utils';

// Choosing an opponent: the models that should run on this device, each with
// its download size and how well it should run, and which side to play.

const SIDES: { value: Side; label: string }[] = [
	{ value: 'w', label: 'White' },
	{ value: 'b', label: 'Black' },
	{ value: 'random', label: 'Random' }
];

export function Picker({
	device,
	model,
	side,
	cached,
	onModel,
	onSide,
	onStart
}: {
	device: DeviceInfo;
	model: ChessModel;
	side: Side;
	// models already downloaded, which start at once
	cached: Set<string>;
	onModel: (model: ChessModel) => void;
	onSide: (side: Side) => void;
	onStart: () => void;
}) {
	const [showAll, setShowAll] = useState(false);
	const hidden = MODELS.filter((m) => fitFor(m, device) === 'too-large');
	const shown = showAll ? MODELS : MODELS.filter((m) => !hidden.includes(m) || m === model);

	return (
		<div className="flex flex-col gap-6">
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 text-sm text-foreground/50">opponent</legend>
				{!device.webgpu && (
					<p className="mb-1 text-sm text-pretty text-foreground/60">
						This browser has no WebGPU, so the model runs on the processor and only the lightest are
						offered.
					</p>
				)}
				{shown.map((m) => {
					const fit = fitFor(m, device);
					return (
						<label
							key={m.id}
							className={cn(
								'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
								m === model
									? 'border-foreground/40 bg-foreground/[0.03]'
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
			</fieldset>

			<fieldset className="flex flex-col gap-2">
				<legend className="mb-2 text-sm text-foreground/50">you play</legend>
				<div className="grid grid-cols-3 gap-1 rounded-lg border border-foreground/10 p-1">
					{SIDES.map(({ value, label }) => (
						<label
							key={value}
							className={cn(
								'cursor-pointer rounded-md py-1 text-center text-sm transition-colors',
								side === value ? 'bg-foreground/[0.07]' : 'text-foreground/60 hover:text-foreground'
							)}
						>
							<input
								type="radio"
								name="side"
								className="sr-only"
								checked={side === value}
								onChange={() => onSide(value)}
							/>
							{label}
						</label>
					))}
				</div>
			</fieldset>

			<Button onClick={onStart} size="lg">
				Play {model.name}
			</Button>
		</div>
	);
}
