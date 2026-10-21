import type { ComponentProps } from 'react';

import { cn } from '~/lib/utils';

// After AI Elements' Message: one turn of a chat thread. The person's turns
// sit on the right in a soft bubble; the assistant's sit on the left, unboxed.

type From = 'user' | 'assistant';

function Message({ from, className, ...props }: ComponentProps<'div'> & { from: From }) {
	return (
		<div
			data-slot="message"
			data-from={from}
			className={cn(
				'group flex w-full flex-col gap-2',
				from === 'user' ? 'items-end' : 'items-start',
				className
			)}
			{...props}
		/>
	);
}

function MessageContent({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-slot="message-content"
			className={cn(
				'flex max-w-full flex-col gap-1 text-sm',
				'group-data-[from=user]:rounded-lg group-data-[from=user]:bg-foreground/5 group-data-[from=user]:px-3 group-data-[from=user]:py-1.5',
				className
			)}
			{...props}
		/>
	);
}

export { Message, MessageContent };
