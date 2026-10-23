import type { ReactNode } from 'react';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '~/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import type { Row } from '~/lib/stats/report';
import { cn } from '~/lib/utils';
import { NUMBER } from './format';

// A section of /admin/stats: a few views of the same kind (pages, entry pages,
// links followed), one at a time. With few views they are tabs; with many, a
// menu, so the heading stays one line.
export type View = { key: string; title: string; unit: ReactNode; content: ReactNode };

export function Panel({
	views,
	value,
	onChange,
	menu = false,
	className
}: {
	views: View[];
	value: string;
	onChange: (key: string) => void;
	menu?: boolean;
	className?: string;
}) {
	const current = views.find((view) => view.key === value) ?? views[0];
	return (
		<Tabs
			value={current.key}
			onValueChange={(next) => onChange(String(next))}
			className={cn('gap-0', className)}
		>
			<div className="flex min-h-10 items-center justify-between gap-4 border-b border-foreground/10 pb-2">
				{menu ? (
					<Select
						items={views.map((view) => ({ value: view.key, label: view.title }))}
						value={current.key}
						onValueChange={(next) => next && onChange(String(next))}
					>
						<SelectTrigger size="sm" aria-label="Show">
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="start" alignItemWithTrigger={false}>
							{views.map((view) => (
								<SelectItem key={view.key} value={view.key}>
									{view.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<TabsList variant="line" className="-ml-1.5">
						{views.map((view) => (
							<TabsTrigger key={view.key} value={view.key} className="font-normal">
								{view.title}
							</TabsTrigger>
						))}
					</TabsList>
				)}
				<span className="shrink-0 text-sm text-foreground/50">{current.unit}</span>
			</div>
			{views.map((view) => (
				<TabsContent key={view.key} value={view.key}>
					{view.content}
				</TabsContent>
			))}
		</Tabs>
	);
}

// Ranked rows, each with a faint bar for its share of the largest. Choosing
// one filters the whole page by it.
export function Ranking({
	rows,
	by = 'visitors',
	active,
	onPick,
	format = (row) => row.label,
	empty = 'Nothing yet.'
}: {
	rows: Row[];
	by?: 'visitors' | 'views';
	active?: string;
	onPick?: (row: Row) => void;
	format?: (row: Row) => string;
	empty?: string;
}) {
	if (!rows.length) return <p className="py-3 text-foreground/50">{empty}</p>;
	const max = Math.max(1, ...rows.map((row) => row[by]));
	return (
		<ScrollArea fade viewportClassName="max-h-[22.5rem]">
			<ol className="py-1 pr-3">
				{rows.map((row) => {
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
						'group/row relative flex w-full items-baseline justify-between gap-4 py-2 text-left',
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
		</ScrollArea>
	);
}
