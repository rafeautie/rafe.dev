import { Slider as SliderPrimitive } from '@base-ui/react/slider';

import { cn } from '~/lib/utils';

function Slider({
	className,
	min = 0,
	max = 100,
	...props
}: Omit<SliderPrimitive.Root.Props<number>, 'className'> & { className?: string }) {
	return (
		<SliderPrimitive.Root
			data-slot="slider"
			className={cn('w-full', className)}
			min={min}
			max={max}
			thumbAlignment="edge"
			{...props}
		>
			<SliderPrimitive.Control className="relative flex w-full touch-none items-center py-1.5 select-none data-disabled:opacity-50">
				<SliderPrimitive.Track
					data-slot="slider-track"
					className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted select-none"
				>
					<SliderPrimitive.Indicator
						data-slot="slider-range"
						className="h-full bg-primary select-none"
					/>
				</SliderPrimitive.Track>
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 data-disabled:pointer-events-none data-disabled:opacity-50"
				/>
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };
