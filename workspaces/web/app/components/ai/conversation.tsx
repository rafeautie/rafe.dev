import type { ComponentProps } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

import { cn } from '~/lib/utils';

// After AI Elements' Conversation (shadcn's AI chat components): a message
// thread that stays pinned to the newest message while it streams, unless the
// reader has scrolled up to look back, with a button to jump down again.

function Conversation({ className, ...props }: ComponentProps<typeof StickToBottom>) {
	return (
		<StickToBottom
			data-slot="conversation"
			className={cn('relative flex-1 overflow-y-hidden', className)}
			initial="smooth"
			resize="smooth"
			role="log"
			{...props}
		/>
	);
}

function ConversationContent({
	className,
	scrollClassName,
	...props
}: ComponentProps<typeof StickToBottom.Content>) {
	return (
		<StickToBottom.Content
			data-slot="conversation-content"
			className={cn('flex flex-col gap-4', className)}
			// the scroller reserves room for a scrollbar on both sides by
			// default; one thin one on the right keeps messages flush left
			scrollClassName={cn('[scrollbar-gutter:stable]! [scrollbar-width:thin]', scrollClassName)}
			{...props}
		/>
	);
}

function ConversationEmpty({ className, ...props }: ComponentProps<'p'>) {
	return (
		<p
			data-slot="conversation-empty"
			className={cn('text-sm text-foreground/40', className)}
			{...props}
		/>
	);
}

function ConversationScrollButton({ className, ...props }: ComponentProps<'button'>) {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();
	if (isAtBottom) return null;
	return (
		<button
			type="button"
			data-slot="conversation-scroll-button"
			aria-label="Scroll to the newest message"
			onClick={() => scrollToBottom()}
			className={cn(
				'absolute bottom-2 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border border-foreground/10 bg-background text-foreground/60 shadow-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
				className
			)}
			{...props}
		>
			<ArrowDownIcon className="size-3.5" />
		</button>
	);
}

export { Conversation, ConversationContent, ConversationEmpty, ConversationScrollButton };
