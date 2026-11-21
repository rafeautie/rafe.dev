import type { ReactNode } from 'react';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '~/components/ui/card';
import { cn } from '~/lib/utils';

// The cards every admin page is built from: shadcn's Card with a lowercase
// title, a short description and something at the right (a count, a unit, a
// button), a headline number in a small card of its own, and what a card says
// when it has nothing to show.

export function Panel({
	title,
	description,
	action,
	flush = false,
	className,
	contentClassName,
	footer,
	children
}: {
	title: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	/** For a table or a list, which runs to the card's edges. */
	flush?: boolean;
	className?: string;
	contentClassName?: string;
	// after the content, such as a CardFooter
	footer?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent className={cn(flush && 'px-0 group-data-[size=sm]/card:px-0', contentClassName)}>
				{children}
			</CardContent>
			{footer}
		</Card>
	);
}

// A headline number in a small card: what it counts above it, and a line
// under it when the number needs one.
export function StatCard({
	label,
	value,
	hint,
	tone
}: {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
	tone?: 'bad';
}) {
	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-1">
				<span className="truncate text-foreground/50">{label}</span>
				<span
					className={cn(
						'text-2xl font-medium tracking-tight tabular-nums',
						tone === 'bad' && 'text-destructive'
					)}
				>
					{value}
				</span>
				{hint && <span className="text-foreground/50">{hint}</span>}
			</CardContent>
		</Card>
	);
}

export function Empty({ children }: { children: ReactNode }) {
	return <p className="text-foreground/50">{children}</p>;
}
