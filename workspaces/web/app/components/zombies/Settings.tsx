import { useId, useSyncExternalStore } from 'react';
import { Button } from '~/components/ui/button';
import { Slider } from '~/components/ui/slider';
import { Switch } from '~/components/ui/switch';
import { RANGES, settings, type Settings } from '~/lib/zombies/settings';
import { cn } from '~/lib/utils';

// The player's settings, the same on the lobby page and in the pause menu.
// Every change is saved and takes effect at once.

const PERCENT = (v: number) => `${Math.round(v * 100)}%`;

const SLIDERS: {
	key: keyof typeof RANGES;
	label: string;
	format: (v: number) => string;
}[] = [
	{ key: 'volume', label: 'Volume', format: (v) => String(v) },
	{ key: 'sensitivity', label: 'Mouse Sensitivity', format: (v) => v.toFixed(2) },
	{ key: 'aimSensitivity', label: 'Aim Sensitivity', format: PERCENT },
	{ key: 'fov', label: 'Field of View', format: (v) => `${v}°` }
];

export function SettingsForm({ className }: { className?: string }) {
	const current = useSyncExternalStore(settings.subscribe, settings.get);
	const set = (patch: Partial<Settings>) => settings.set(patch);
	const invertId = useId();

	return (
		<div className={cn('flex flex-col gap-4 text-sm font-medium', className)}>
			{SLIDERS.map(({ key, label, format }) => (
				<div key={key} className="flex flex-col gap-1.5">
					<div className="flex justify-between">
						<span className="text-muted-foreground">{label}</span>
						<span>{format(current[key])}</span>
					</div>
					<Slider
						{...RANGES[key]}
						value={current[key]}
						onValueChange={(value) => set({ [key]: value })}
						aria-label={label}
					/>
				</div>
			))}
			<div className="flex items-center justify-between">
				<span id={invertId} className="text-muted-foreground">
					Invert Look
				</span>
				<Switch
					aria-labelledby={invertId}
					checked={current.invertY}
					onCheckedChange={(checked) => set({ invertY: checked })}
				/>
			</div>
			<p className="text-[0.8125rem] text-muted-foreground">
				Aim sensitivity is a share of mouse sensitivity, used while aiming down sights.
			</p>
			<Button variant="outline" className="self-start" onClick={() => settings.reset()}>
				Reset to Defaults
			</Button>
		</div>
	);
}
