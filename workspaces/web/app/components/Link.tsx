import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

// inline-block so the scale applies; inline elements ignore it. Tailwind's
// scale-* sets the scale property, not transform, so that is what transitions.
const hoverEffect =
	'group/link relative inline-block transition-[scale,color] duration-400 ease-out hover:scale-101';

// A browser draws a blur only in whole device pixels, so animating blur(0) to
// blur(1px) jumps in one step. Instead the link holds its content twice and
// fades a blurred copy in over the sharp one, which animates only opacity.
// Each layer inherits the link's own layout, so a link styled as a flex row
// (an icon beside text) or a block (a post card) lays out its content the same.
const layer =
	'[display:inherit] [flex-direction:inherit] [align-items:inherit] [justify-content:inherit] [gap:inherit] transition-opacity duration-400 ease-out';

export function Link({
	plain = false,
	className,
	children,
	...props
}: ComponentProps<'a'> & { plain?: boolean }) {
	if (plain) {
		return (
			<a className={className} {...props}>
				{children}
			</a>
		);
	}
	return (
		<a className={cn(hoverEffect, className)} {...props}>
			<span className={cn(layer, 'group-hover/link:opacity-0')}>{children}</span>
			<span
				aria-hidden
				className={cn(
					layer,
					'pointer-events-none absolute inset-0 opacity-0 blur-[1px] select-none group-hover/link:opacity-100'
				)}
			>
				{children}
			</span>
		</a>
	);
}
