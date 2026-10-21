import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '~/lib/utils';

// After AI Elements' Reasoning: a model's thinking, folded under a "Thought
// for 7s" line. It opens by itself while the thinking streams in, and folds
// away once when it's done; after that it's the reader's to open.

function Reasoning({
	streaming = false,
	className,
	...props
}: Collapsible.Root.Props & { streaming?: boolean }) {
	const [open, setOpen] = useState(streaming);
	const was = useRef(streaming);
	useEffect(() => {
		if (streaming && !was.current) setOpen(true);
		if (!streaming && was.current) setOpen(false);
		was.current = streaming;
	}, [streaming]);
	return (
		<Collapsible.Root
			data-slot="reasoning"
			open={open}
			onOpenChange={setOpen}
			className={cn('flex w-full flex-col gap-2', className)}
			{...props}
		/>
	);
}

function ReasoningTrigger({
	streaming = false,
	seconds,
	label,
	className,
	...props
}: Collapsible.Trigger.Props & { streaming?: boolean; seconds?: number; label?: ReactNode }) {
	const shown = Math.max(1, Math.round(seconds ?? 0));
	return (
		<Collapsible.Trigger
			data-slot="reasoning-trigger"
			className={cn(
				'group/trigger flex items-center gap-1.5 rounded-sm text-xs text-foreground/50 outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none',
				className
			)}
			{...props}
		>
			<BrainIcon className="size-3.5" />
			{label ??
				(streaming ? (
					<span className="motion-safe:animate-pulse">Thinking…</span>
				) : seconds === undefined ? (
					'Thoughts'
				) : (
					`Thought for ${shown}s`
				))}
			<ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]/trigger:rotate-180" />
		</Collapsible.Trigger>
	);
}

function ReasoningContent({ className, ...props }: ComponentProps<typeof Collapsible.Panel>) {
	return (
		<Collapsible.Panel
			data-slot="reasoning-content"
			className={cn(
				'border-l border-foreground/10 pl-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/50',
				className
			)}
			{...props}
		/>
	);
}

export { Reasoning, ReasoningTrigger, ReasoningContent };
