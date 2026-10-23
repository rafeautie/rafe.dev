import type { ReactNode } from 'react';
import { SlashNav } from '~/components/SlashNav';

// Every admin page's header: the slash path on the left, each segment a link
// one level up, and links to other pages on the right. Pages that change
// something add the controls rail under it.
export function AdminHeader({ path, children }: { path: ReactNode[]; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
			<SlashNav className="min-w-0 text-xl font-medium [overflow-wrap:anywhere]">{path}</SlashNav>
			{children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
		</div>
	);
}

// The controls rail: one row, the same on every page, that stays at the top
// while the page scrolls. Status (the build, unsaved changes) on the left, the
// page's controls and its main action on the right.
export function ControlsRail({ status, children }: { status?: ReactNode; children?: ReactNode }) {
	return (
		<div className="sticky top-0 z-20 mt-6 border-b border-foreground/10 bg-background">
			<div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-foreground/50">
					{status}
				</div>
				{children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
			</div>
		</div>
	);
}
