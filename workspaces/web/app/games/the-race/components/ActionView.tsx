import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import type { ComponentProps } from 'react';
import type { Card as GameCard } from '../engine/types';
import { effectiveValue } from '../engine/cards';
import { cardLabel } from './PlayingCard';
import { cn } from '~/lib/utils';

interface ActionConfig {
	label: string;
	onClick?: () => void;
	disabled?: boolean;
	variant?: ComponentProps<typeof Button>['variant'];
}

interface ActionViewProps {
	actions: ActionConfig[];
	selectedCards?: GameCard[];
	className?: string;
}

function DottedRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline">
			<span className="text-xs font-light tracking-widest">{label}</span>
			<span className="mx-2 flex-1 border-b border-dashed border-white/30" />
			<span className="text-xs font-light tabular-nums">{value}</span>
		</div>
	);
}

export function ActionView({ actions, selectedCards = [], className }: ActionViewProps) {
	const paired = selectedCards.length > 1;
	const total = selectedCards.reduce((sum, c) => sum + effectiveValue(c, paired), 0);
	const cardsSummary = selectedCards.length > 0 ? selectedCards.map(cardLabel).join(', ') : '—';
	const totalSummary = selectedCards.length > 0 ? String(total) : '—';

	return (
		<Card variant="the-race-bg" className={className}>
			<CardHeader className="text-lg font-bold tracking-wide uppercase">Race Actions</CardHeader>
			<CardContent className="flex flex-1 flex-col justify-between gap-5">
				<div className="flex w-full flex-col gap-2 rounded-xl border border-dashed border-white/20 bg-the-race-bg-from p-3">
					<DottedRow label="Selected" value={cardsSummary} />
					<DottedRow label="Effect" value={totalSummary} />
				</div>
				{actions.length > 0 && (
					<div className="grid grid-cols-2 gap-3">
						{actions.map(({ label, onClick, disabled, variant = 'the-race-white' }) => (
							<Button
								key={label}
								variant={variant}
								onClick={onClick}
								disabled={disabled}
								size="lg"
								className={cn('flex h-15 w-full', actions.length === 1 && 'col-span-2')}
							>
								{label}
							</Button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
