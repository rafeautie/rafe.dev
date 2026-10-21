import type { ComponentProps, ReactNode } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { BrainIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '~/lib/utils';

// After AI Elements' Reasoning: a model's thinking, folded under a "Thought
// for 7s" line, or "Thinking…" while it streams in. It starts closed; opening
// it is the reader's call.

function Reasoning({ className, ...props }: Collapsible.Root.Props) {
	return (
		<Collapsible.Root
			data-slot="reasoning"
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
