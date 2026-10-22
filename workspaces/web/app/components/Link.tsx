import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

// inline-block so the scale applies; inline elements ignore it. Tailwind's
// scale-* sets the scale property, not transform, so that is what transitions.
const hoverEffect =
	'inline-block transition-[scale,filter,color] duration-400 ease-out hover:scale-101 hover:blur-[1px]';

export function Link({
	plain = false,
	className,
	...props
}: ComponentProps<'a'> & { plain?: boolean }) {
	return <a className={cn(!plain && hoverEffect, className)} {...props} />;
}
