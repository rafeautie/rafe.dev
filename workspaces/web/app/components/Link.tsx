import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

// inline-block so the scale applies; inline elements ignore it. Tailwind's
// scale-* sets the scale property, not transform, so that is what transitions.
//
// will-change keeps the link on its own layer all the time, not just while it
// animates. Without it, dark text on a plain light background is drawn with
// sharper subpixel smoothing at rest and switches to plain smoothing for the
// animation, so the text visibly snaps as the hover starts and ends. Over the
// old home page's photo the text never had subpixel smoothing, so it never
// snapped.
const hoverEffect =
	'inline-block transition-[scale,filter,color] duration-400 ease-out will-change-[scale,filter] hover:scale-101 hover:blur-[1px]';

export function Link({
	plain = false,
	className,
	...props
}: ComponentProps<'a'> & { plain?: boolean }) {
	return <a className={cn(!plain && hoverEffect, className)} {...props} />;
}
