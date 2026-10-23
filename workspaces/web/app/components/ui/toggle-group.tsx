import * as React from 'react';
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { type VariantProps } from 'class-variance-authority';

import { cn } from '~/lib/utils';
import { toggleVariants } from '~/components/ui/toggle';

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
	size: 'default',
	variant: 'default'
});

function ToggleGroup({
	className,
	variant,
	size,
	children,
	...props
}: Omit<ToggleGroupPrimitive.Props, 'className'> &
	VariantProps<typeof toggleVariants> & { className?: string }) {
	return (
		<ToggleGroupPrimitive
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			className={cn('group/toggle-group flex w-fit items-center gap-0.5 rounded-lg', className)}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ variant, size }}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	);
}

function ToggleGroupItem({
	className,
	children,
	variant,
	size,
	...props
}: Omit<TogglePrimitive.Props, 'className'> &
	VariantProps<typeof toggleVariants> & { className?: string }) {
	const context = React.useContext(ToggleGroupContext);

	return (
		<TogglePrimitive
			data-slot="toggle-group-item"
			className={cn(
				toggleVariants({
					variant: context.variant || variant,
					size: context.size || size
				}),
				'shrink-0 focus:z-10 focus-visible:z-10',
				className
			)}
			{...props}
		>
			{children}
		</TogglePrimitive>
	);
}

export { ToggleGroup, ToggleGroupItem };
