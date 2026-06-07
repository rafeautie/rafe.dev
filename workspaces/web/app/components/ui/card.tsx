import * as React from 'react';

import { cn } from '~/lib/utils';

type CardVariant =
	| 'default'
	| 'the-race-red'
	| 'the-race-white'
	| 'the-race-accent'
	| 'the-race-bg';

const cardVariantClasses: Record<CardVariant, string> = {
	default: '',
	'the-race-red':
		'bg-linear-to-b from-the-race-red-from to-the-race-red-to text-the-race-white-from ring-0',
	'the-race-white':
		'bg-linear-to-b from-the-race-white-from to-the-race-white-to text-the-race-bg-from ring-0',
	'the-race-accent': 'bg-the-race-accent text-the-race-white-from ring-0',
	'the-race-bg':
		'bg-linear-to-b from-[oklch(0.24_0.01_50)] to-[oklch(0.22_0.01_50)] text-the-race-white-from ring-1 ring-white/10'
};

function Card({
	className,
	size = 'default',
	variant = 'default',
	...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm'; variant?: CardVariant }) {
	return (
		<div
			data-slot="card"
			data-size={size}
			data-variant={variant}
			className={cn(
				'group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
				cardVariantClasses[variant],
				className
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3',
				className
			)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-title"
			className={cn(
				'font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
				className
			)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-description"
			className={cn(
				'text-sm text-muted-foreground',
				'group-data-[variant=the-race-bg]/card:text-the-race-white-to',
				className
			)}
			{...props}
		/>
	);
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-action"
			className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-content"
			className={cn('px-4 group-data-[size=sm]/card:px-3', className)}
			{...props}
		/>
	);
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-footer"
			className={cn(
				'flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3',
				'group-data-[variant=the-race-red]/card:border-white/20 group-data-[variant=the-race-red]/card:bg-black/20',
				'group-data-[variant=the-race-white]/card:border-the-race-bg-from/10 group-data-[variant=the-race-white]/card:bg-black/5',
				'group-data-[variant=the-race-accent]/card:border-the-race-bg-from/10 group-data-[variant=the-race-accent]/card:bg-black/10',
				'group-data-[variant=the-race-bg]/card:border-white/10 group-data-[variant=the-race-bg]/card:bg-white/5 group-data-[variant=the-race-bg]/card:text-the-race-white-to',
				className
			)}
			{...props}
		/>
	);
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
