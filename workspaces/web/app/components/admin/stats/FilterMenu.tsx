import { ArrowLeftIcon, ChevronRightIcon, ListFilterIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ScrollArea } from '~/components/ui/scroll-area';
import { DIMENSIONS, type FilterKey, type Filters } from '~/lib/stats/dimensions';
import type { Row } from '~/lib/stats/report';
import { cn } from '~/lib/utils';
import { country, NUMBER } from './format';

// Filter by anything the page breaks visits down by: first what to filter
// by, then one of its values in the current view, searchable.
export function FilterMenu({
	values,
	filters,
	onFilter
}: {
	values: Record<FilterKey, Row[]>;
	filters: Filters;
	onFilter: (key: FilterKey, value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [key, setKey] = useState<FilterKey | null>(null);
	const [query, setQuery] = useState('');
	const label = (k: FilterKey, row: Row) => (k === 'country' ? country(row.key) : row.label);
	const keys = (Object.keys(values) as FilterKey[]).filter((k) => values[k].length);
	const rows = key
		? values[key].filter((row) =>
				label(key, row).toLowerCase().includes(query.trim().toLowerCase())
			)
		: [];

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setKey(null);
					setQuery('');
				}
			}}
		>
			<PopoverTrigger render={<Button variant="outline" className="font-normal" />}>
				<ListFilterIcon />
				Filter
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 gap-1 p-1.5">
				{key ? (
					<>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Back"
								onClick={() => {
									setKey(null);
									setQuery('');
								}}
							>
								<ArrowLeftIcon />
							</Button>
							<Input
								autoFocus
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={`Find ${DIMENSIONS[key].title.toLowerCase()}`}
								aria-label={`Find ${DIMENSIONS[key].title.toLowerCase()}`}
								className="h-8"
							/>
						</div>
						<ScrollArea fade viewportClassName="max-h-72">
							<ul className="py-1">
								{rows.map((row) => (
									<li key={row.key}>
										<button
											type="button"
											onClick={() => {
												onFilter(key, row.key);
												setOpen(false);
												setKey(null);
												setQuery('');
											}}
											className={cn(
												'flex w-full cursor-pointer items-baseline justify-between gap-4 rounded-md px-2 py-1.5 text-left hover:bg-foreground/5',
												filters[key] === row.key && 'font-medium'
											)}
										>
											<span className="truncate">{label(key, row)}</span>
											<span className="shrink-0 text-foreground/50 tabular-nums">
												{NUMBER.format(row.visitors)}
											</span>
										</button>
									</li>
								))}
								{!rows.length && (
									<li className="px-2 py-1.5 text-foreground/50">Nothing matches.</li>
								)}
							</ul>
						</ScrollArea>
					</>
				) : (
					<ul>
						{keys.map((k) => (
							<li key={k}>
								<button
									type="button"
									onClick={() => setKey(k)}
									className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left hover:bg-foreground/5"
								>
									{DIMENSIONS[k].title}
									<span className="flex items-center gap-1 text-foreground/50">
										{filters[k] && <span className="max-w-32 truncate">{filters[k]}</span>}
										<ChevronRightIcon className="size-3.5" />
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</PopoverContent>
		</Popover>
	);
}
