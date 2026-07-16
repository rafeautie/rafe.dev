import type { ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
	return <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">{children}</p>;
}
