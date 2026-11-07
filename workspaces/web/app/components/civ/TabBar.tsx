import { PANEL, TABS, type TabId } from './labels';

// The tabs along the bottom. Each opens a panel just above; the same tab
// again closes it.

export function TabBar({ open, onToggle }: { open: TabId | null; onToggle: (id: TabId) => void }) {
	return (
		<div className={`pointer-events-auto flex gap-0.5 p-1 text-sm ${PANEL}`}>
			{TABS.map((tab) => (
				<button
					key={tab.id}
					type="button"
					onClick={() => onToggle(tab.id)}
					aria-pressed={open === tab.id}
					className={`cursor-pointer rounded-lg px-3 py-1 ${
						open === tab.id
							? 'bg-foreground/10 text-foreground'
							: 'text-foreground/50 hover:text-foreground'
					}`}
				>
					{tab.name}
				</button>
			))}
		</div>
	);
}
