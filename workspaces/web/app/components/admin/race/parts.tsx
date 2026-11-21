import type { ReactNode } from 'react';
import { carColor, carName } from './format';
import { cn } from '~/lib/utils';

// The pieces /admin/race's sections are built from, beside the shared cards
// (components/admin/cards): a table that scrolls inside its card, a car as
// the game shows it, and a heading for each section when they stack.

// a table that scrolls sideways inside its card rather than the page
export function Table({
	head,
	right = [],
	children
}: {
	head: ReactNode[];
	/** Columns of numbers, set to the right so they line up. */
	right?: number[];
	children: ReactNode;
}) {
	return (
		<div className="overflow-x-auto">
			{/* separate borders, drawn by each cell, so a cell pinned while the table scrolls keeps its rule */}
			<table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
				<thead>
					<tr className="text-left text-foreground/50">
						{head.map((cell, i) => (
							<th
								key={i}
								className={cn(
									'border-b border-foreground/10 px-3 pb-2 font-normal whitespace-nowrap first:pl-4 last:pr-4',
									right.includes(i) && 'text-right'
								)}
							>
								{cell}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="[&>tr+tr>td]:border-t [&>tr+tr>td]:border-foreground/5">{children}</tbody>
			</table>
		</div>
	);
}

/** A car's colour, beside its name in ink: the colour says which car, the text says it too. */
export function Car({ id, name = true }: { id: string; name?: boolean }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				aria-hidden
				className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15"
				style={{ backgroundColor: carColor(id) }}
			/>
			{name && carName(id)}
		</span>
	);
}

// Below lg the sections stack with no sidebar to name them, so each names itself.
export function Heading({ children }: { children: ReactNode }) {
	return <h2 className="text-lg font-medium lg:hidden">{children}</h2>;
}
