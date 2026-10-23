import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { useRender } from '@base-ui/react/use-render';

import { cn } from '~/lib/utils';

const badgeVariants = cva(
	'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground',
				secondary: 'bg-secondary text-secondary-foreground',
				destructive: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
				outline: 'border-border text-foreground'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
);

function Badge({
	className,
	variant = 'default',
	render,
	...props
}: React.ComponentProps<'span'> &
	VariantProps<typeof badgeVariants> & {
		render?: useRender.RenderProp;
	}) {
	return useRender({
		defaultTagName: 'span',
		render,
		props: {
			'data-slot': 'badge',
			'data-variant': variant,
			className: cn(badgeVariants({ variant }), className),
			...props
		}
	});
}

export { Badge, badgeVariants };
