import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { formatPostDate } from '~/lib/admin/time';
import { cn } from '~/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// noon, so no time zone moves it to the day before
const fromIso = (iso: string) => (iso ? new Date(`${iso}T12:00:00`) : undefined);

// A yyyy-mm-dd date, picked from a calendar.
export function DatePicker({
	value,
	onChange,
	placeholder = 'Pick a date',
	className
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = fromIso(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className={cn('-mx-2.5 font-normal text-foreground/50', className)}
					/>
				}
			>
				{value ? formatPostDate(value) : placeholder}
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					onSelect={(date) => {
						onChange(date ? toIso(date) : '');
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
