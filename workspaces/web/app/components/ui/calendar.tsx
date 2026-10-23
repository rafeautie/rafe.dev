import type * as React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '~/lib/utils';
import { buttonVariants } from '~/components/ui/button';

// shadcn's Calendar: react-day-picker styled with the site's tokens.
function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	...props
}: React.ComponentProps<typeof DayPicker>) {
	const defaults = getDefaultClassNames();

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn('group/calendar p-2 [--cell-size:--spacing(8)]', className)}
			classNames={{
				root: cn('w-fit', defaults.root),
				months: cn('relative flex flex-col gap-4 md:flex-row', defaults.months),
				month: cn('flex w-full flex-col gap-4', defaults.month),
				nav: cn(
					'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
					defaults.nav
				),
				button_previous: cn(
					buttonVariants({ variant: 'ghost' }),
					'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
					defaults.button_previous
				),
				button_next: cn(
					buttonVariants({ variant: 'ghost' }),
					'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
					defaults.button_next
				),
				month_caption: cn(
					'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
					defaults.month_caption
				),
				caption_label: cn('text-sm font-medium select-none', defaults.caption_label),
				table: 'w-full border-collapse',
				weekdays: cn('flex', defaults.weekdays),
				weekday: cn(
					'flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none',
					defaults.weekday
				),
				week: cn('mt-2 flex w-full', defaults.week),
				day: cn(
					'group/day relative aspect-square h-full w-full p-0 text-center select-none',
					defaults.day
				),
				today: cn('rounded-md bg-muted text-foreground', defaults.today),
				outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaults.outside),
				disabled: cn('text-muted-foreground opacity-50', defaults.disabled),
				hidden: cn('invisible', defaults.hidden),
				...classNames
			}}
			components={{
				Chevron: ({ orientation, className, ...props }) =>
					orientation === 'left' ? (
						<ChevronLeftIcon className={cn('size-4', className)} {...props} />
					) : (
						<ChevronRightIcon className={cn('size-4', className)} {...props} />
					),
				DayButton: ({ className, modifiers, day, ...props }) => (
					<button
						data-day={day.date.toLocaleDateString()}
						data-selected-single={modifiers.selected || undefined}
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'icon' }),
							'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground',
							defaults.day_button,
							className
						)}
						{...props}
					/>
				)
			}}
			{...props}
		/>
	);
}

export { Calendar };
