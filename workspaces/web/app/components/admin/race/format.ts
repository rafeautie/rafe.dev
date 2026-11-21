import { timeAgo } from '~/lib/admin/time';
import type { RaceAdminView } from '~/lib/race/admin';
import { CONDITIONS, ROSTER } from '~/lib/race/roster';
import { cn } from '~/lib/utils';

// How /admin/race writes numbers, times, cars and table cells (parts.tsx has
// the pieces built from them).

export type View = RaceAdminView;
export type Act = (run: () => Promise<unknown>) => Promise<void>;

export const NUMBER = new Intl.NumberFormat('en-US');
export const PERCENT = new Intl.NumberFormat('en-US', {
	style: 'percent',
	maximumFractionDigits: 0
});

export const carName = (id: string) => ROSTER.find((car) => car.id === id)?.name ?? id;
export const carColor = (id: string) =>
	ROSTER.find((car) => car.id === id)?.color ?? 'currentColor';
export const time = (at: number) => timeAgo(new Date(at).toISOString());
export const condition = (id: string) => (CONDITIONS[id]?.label ?? id).toLowerCase();

export const cell = 'px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4';
export const number = cn(cell, 'text-right');
