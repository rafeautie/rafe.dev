import { ArrowRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from '~/components/admin/cards';
import { CardFooter } from '~/components/ui/card';
import { ScrollArea } from '~/components/ui/scroll-area';
import type { Row } from '~/lib/stats/report';
import { cn } from '~/lib/utils';
import { NUMBER } from '~/lib/admin/format';

// The surfaces /admin/stats is built from: the admin's card with a title,
// what its numbers count, and what it holds, and the lists that go in them.

export function StatsCard({
	title,
	description,
	unit,
	more,
	className,
	children
}: {
	title: ReactNode;
	description?: ReactNode;
	unit?: ReactNode;
	// a way to the whole list, under a short one
	more?: { label: string; onClick: () => void };
	className?: string;
	children: ReactNode;
}) {
	return (
		<Panel
			title={title}
			description={description}
			action={unit && <span className="text-sm text-foreground/50">{unit}</span>}
			className={className}
			contentClassName="flex-1"
			footer={more && <More {...more} />}
		>
			{children}
		</Panel>
	);
}

function More({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<CardFooter className="p-0 group-data-[size=sm]/card:p-0">
			<button
				type="button"
				onClick={onClick}
				className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-foreground/60 transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
			>
				{label}
				<ArrowRightIcon className="size-3.5" />
			</button>
		</CardFooter>
	);
}

// Ranked rows, each with a faint bar for its share of the largest. Choosing
// one filters the whole page by it. `limit` cuts it to the top few, for a
// short list that has a whole one elsewhere.
export function Ranking({
	rows,
	by = 'visitors',
	active,
	onPick,
	format = (row) => row.label,
	empty = 'Nothing yet.',
	limit,
	height = 'max-h-[22.5rem]'
}: {
	rows: Row[];
	by?: 'visitors' | 'views';
	active?: string;
	onPick?: (row: Row) => void;
	format?: (row: Row) => string;
	empty?: string;
	limit?: number;
	height?: string;
}) {
	if (!rows.length) return <p className="py-2 text-foreground/50">{empty}</p>;
	const shown = limit ? rows.slice(0, limit) : rows;
	const max = Math.max(1, ...shown.map((row) => row[by]));
	const list = (
		<ol className={cn(!limit && 'pr-3')}>
			{shown.map((row) => {
				const text = format(row);
				const content = (
					<>
						<span
							aria-hidden
							className="absolute inset-y-1 left-0 rounded-[4px] bg-foreground/[0.05] transition-colors group-hover/row:bg-foreground/[0.09]"
							style={{ width: `${Math.max((row[by] / max) * 100, 0.5)}%` }}
						/>
						<span className="relative min-w-0 truncate pl-2" title={text}>
							{text}
						</span>
						<span className="relative pr-2 tabular-nums">{NUMBER.format(row[by])}</span>
					</>
				);
				const className = cn(
					'group/row relative flex w-full items-baseline justify-between gap-4 py-1.5 text-left',
					active === row.key && 'font-medium'
				);
				return (
					<li key={row.key}>
						{onPick ? (
							<button
								type="button"
								className={cn(className, 'cursor-pointer')}
								onClick={() => onPick(row)}
								title={`Show only ${text}`}
							>
								{content}
							</button>
						) : (
							<div className={className}>{content}</div>
						)}
					</li>
				);
			})}
		</ol>
	);
	// a short list needs no scrolling; -my-1 takes back the rows' own room
	// above and below, outside the scrolling so it is not taken for more
	return limit ? (
		<div className="-my-1">{list}</div>
	) : (
		<ScrollArea fade className="-my-1" viewportClassName={height}>
			{list}
		</ScrollArea>
	);
}

// How a whole splits, for a breakdown with only a few kinds (devices, light
// or dark): one bar cut into shares, then each share with its percentage.
export function Shares({
	rows,
	active,
	onPick,
	empty = 'Nothing yet.'
}: {
	rows: Row[];
	active?: string;
	onPick?: (row: Row) => void;
	empty?: string;
}) {
	if (!rows.length) return <p className="py-2 text-foreground/50">{empty}</p>;
	const total = rows.reduce((sum, row) => sum + row.visitors, 0) || 1;
	// darkest first, each next share lighter, so the bar reads in order
	const shade = (index: number) =>
		`color-mix(in oklab, var(--foreground) ${Math.max(16, 80 - index * 22)}%, transparent)`;
	const percent = (row: Row) => `${Math.round((row.visitors / total) * 100)}%`;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
				{rows.map((row, index) => (
					<span
						key={row.key}
						className="h-full"
						style={{ width: percent(row), backgroundColor: shade(index) }}
					/>
				))}
			</div>
			<ul className="flex flex-col">
				{rows.map((row, index) => {
					const content = (
						<>
							<span className="flex min-w-0 items-center gap-2">
								<span
									aria-hidden
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: shade(index) }}
								/>
								<span className="truncate">{row.label}</span>
							</span>
							<span className="flex shrink-0 items-baseline gap-3 tabular-nums">
								<span className="text-foreground/50">{NUMBER.format(row.visitors)}</span>
								<span className="w-9 text-right">{percent(row)}</span>
							</span>
						</>
					);
					const className = cn(
						'flex w-full items-baseline justify-between gap-4 rounded-md py-1.5 text-left',
						active === row.key && 'font-medium'
					);
					return (
						<li key={row.key}>
							{onPick ? (
								<button
									type="button"
									onClick={() => onPick(row)}
									title={`Show only ${row.label}`}
									className={cn(className, 'cursor-pointer hover:text-foreground/70')}
								>
									{content}
								</button>
							) : (
								<div className={className}>{content}</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
