import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '~/lib/utils';

function Tabs({
	className,
	orientation = 'horizontal',
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
			{...props}
		/>
	);
}

const tabsListVariants = cva(
	'group/tabs-list inline-flex w-fit items-center justify-center rounded-xl p-[3px] text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
	{
		variants: {
			variant: {
				default: 'bg-muted',
				line: 'gap-1 bg-transparent',
				ghost: 'bg-transparent p-0 ring-0',
				'the-race-bg':
					'bg-linear-to-b from-[oklch(0.18_0.01_50)] to-[oklch(0.24_0.01_50)] ring-1 ring-white/10',
				'the-race-red': 'bg-linear-to-b from-the-race-red-from to-the-race-red-to',
				'the-race-white':
					'bg-linear-to-b from-the-race-white-from to-the-race-white-to ring-1 ring-the-race-bg-from/10'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	}
);

function TabsList({
	className,
	variant = 'default',
	...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			data-variant={variant}
			className={cn(tabsListVariants({ variant }), className)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				// size variants
				'group-data-[size=sm]/tabs-list:px-1 group-data-[size=sm]/tabs-list:text-xs',
				'group-data-[size=lg]/tabs-list:px-2.5 group-data-[size=lg]/tabs-list:py-1 group-data-[size=lg]/tabs-list:text-base',
				'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
				'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
				'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:-bottom-1.25 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
				// the-race-bg
				'group-data-[variant=the-race-bg]/tabs-list:text-the-race-white-to/60 group-data-[variant=the-race-bg]/tabs-list:hover:text-the-race-white-from',
				'bg-the-race-bg-to group-data-[variant=the-race-bg]/tabs-list:data-active:border-white/20 group-data-[variant=the-race-bg]/tabs-list:data-active:bg-the-race-bg-to group-data-[variant=the-race-bg]/tabs-list:data-active:text-the-race-white-from group-data-[variant=the-race-bg]/tabs-list:data-active:shadow-none',
				// the-race-red
				'group-data-[variant=the-race-red]/tabs-list:text-the-race-white-from/60 group-data-[variant=the-race-red]/tabs-list:hover:text-the-race-white-from',
				'group-data-[variant=the-race-red]/tabs-list:data-active:border-transparent group-data-[variant=the-race-red]/tabs-list:data-active:bg-the-race-white-from group-data-[variant=the-race-red]/tabs-list:data-active:text-the-race-bg-from group-data-[variant=the-race-red]/tabs-list:data-active:shadow-none',
				// the-race-white
				'group-data-[variant=the-race-white]/tabs-list:text-the-race-bg-from/60 group-data-[variant=the-race-white]/tabs-list:hover:text-the-race-bg-from',
				'group-data-[variant=the-race-white]/tabs-list:data-active:border-transparent group-data-[variant=the-race-white]/tabs-list:data-active:bg-the-race-accent group-data-[variant=the-race-white]/tabs-list:data-active:text-the-race-white-from group-data-[variant=the-race-white]/tabs-list:data-active:shadow-none',
				className
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn('flex-1 text-sm outline-none', className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
