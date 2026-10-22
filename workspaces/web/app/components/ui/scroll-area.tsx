import * as React from 'react';
import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';

import { cn } from '~/lib/utils';

// shadcn's scroll area on Base UI, with one addition: `fade` softens whichever
// end still has more to scroll, using the overflow attributes Base UI sets on
// the viewport.
function ScrollArea({
	className,
	viewportClassName,
	fade = false,
	children,
	...props
}: ScrollAreaPrimitive.Root.Props & { viewportClassName?: string; fade?: boolean }) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			className={cn('relative', className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot="scroll-area-viewport"
				className={cn(
					'size-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
					fade &&
						'data-[overflow-y-end]:mask-b-from-[calc(100%-2.5rem)] data-[overflow-y-start]:mask-t-from-[calc(100%-2.5rem)]',
					viewportClassName
				)}
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar />
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
}

function ScrollBar({
	className,
	orientation = 'vertical',
	...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
	return (
		<ScrollAreaPrimitive.Scrollbar
			data-slot="scroll-area-scrollbar"
			orientation={orientation}
			className={cn(
				'flex touch-none p-px opacity-0 transition-opacity select-none data-[hovering]:opacity-100 data-[scrolling]:opacity-100',
				orientation === 'vertical' && 'h-full w-2',
				orientation === 'horizontal' && 'h-2 flex-col',
				className
			)}
			{...props}
		>
			<ScrollAreaPrimitive.Thumb
				data-slot="scroll-area-thumb"
				className="relative flex-1 rounded-full bg-foreground/20"
			/>
		</ScrollAreaPrimitive.Scrollbar>
	);
}

export { ScrollArea, ScrollBar };
