import type { ComponentProps } from 'react';
import { cn } from '~/lib/utils';

// inline-block so the transform applies; inline elements ignore scale
const hoverEffect =
	'inline-block transition-[transform,filter,color] duration-400 ease-out hover:scale-101 hover:blur-[1px]';

export function Link({
	plain = false,
	className,
	...props
}: ComponentProps<'a'> & { plain?: boolean }) {
	return <a className={cn(!plain && hoverEffect, className)} {...props} />;
}
