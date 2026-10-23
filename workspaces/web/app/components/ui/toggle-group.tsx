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
	spacing = 0.5,
	children,
	...props
}: Omit<ToggleGroupPrimitive.Props, 'className'> &
	VariantProps<typeof toggleVariants> & {
		className?: string;
		// 0 joins the items into one segmented control
		spacing?: 0 | 0.5;
	}) {
	return (
		<ToggleGroupPrimitive
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			data-spacing={spacing}
			className={cn(
				'group/toggle-group flex w-fit items-center rounded-lg',
				spacing === 0 ? 'gap-0' : 'gap-0.5',
				className
			)}
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
				'group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:first:rounded-l-lg group-data-[spacing=0]/toggle-group:last:rounded-r-lg',
				'group-data-[variant=outline]/toggle-group:group-data-[spacing=0]/toggle-group:border-l-0 group-data-[variant=outline]/toggle-group:group-data-[spacing=0]/toggle-group:first:border-l',
				className
			)}
			{...props}
		>
			{children}
		</TogglePrimitive>
	);
}

export { ToggleGroup, ToggleGroupItem };
