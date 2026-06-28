import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '~/lib/utils';

const inputVariants = cva(
	'h-8 w-full min-w-0 rounded-xl border px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
	{
		variants: {
			variant: {
				default:
					'bg-transparent border-input disabled:bg-input/50 dark:bg-input/30 dark:disabled:bg-input/80'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
);

function Input({
	className,
	type,
	variant,
	...props
}: React.ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Input, inputVariants };
