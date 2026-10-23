import type { ReactNode } from 'react';
import { SlashNav } from '~/components/SlashNav';

// Every admin page's header: the slash path on the left, each segment a link
// one level up, and the page's controls on the right. On a phone the controls
// wrap under the path.
export function AdminHeader({ path, children }: { path: ReactNode[]; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
			<SlashNav className="min-w-0 text-xl font-medium [overflow-wrap:anywhere]">{path}</SlashNav>
			{children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
		</div>
	);
}
