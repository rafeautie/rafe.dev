import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import type { Card } from '../engine/types';
import { cn } from '~/lib/utils';
import { SuitIcon } from './SuitIcon';

export function cardLabel(card: Card): string {
	return card.kind === 'regular' ? String(card.value) : 'R';
}

// The outer wrapper owns the card's footprint (aspect + size) and the 3D
// perspective the flip animates within. The two faces sit absolutely inside it
// and the container rotates on Y to reveal one or the other — so a card mounted
// face down (no `card`) flips to its front the moment a `card` arrives.
const cardSizeVariants = cva('relative aspect-5/7 [perspective:600px]', {
	variants: {
		size: {
			lg: 'h-40 rounded-xl',
			md: 'h-22 rounded-lg',
			sm: 'h-12 rounded-md',
			xs: 'h-9 rounded'
		}
	},
	defaultVariants: { size: 'lg' }
});

// A single face. Both faces fill the wrapper and hide their reverse so the flip
// shows exactly one at a time. (No border *width* here — the original card had
// only coloured borders at zero width, i.e. none; we keep that.)
const faceVariants = cva(
	'absolute inset-0 flex flex-col items-center justify-center rounded-[inherit] transition-all [backface-visibility:hidden]',
	{
		variants: {
			variant: {
				default:
					'bg-linear-to-b from-the-race-white-from to-the-race-white-to border-the-race-bg-from/20 text-the-race-bg-from hover:border-the-race-bg-from/50',
				redline:
					'bg-linear-to-b from-the-race-red-from to-the-race-red-to border-the-race-red-to text-the-race-white-from',
				back: 'bg-linear-to-b from-the-race-bg-to to-the-race-bg-to border-the-race-white-to/40 text-the-race-white-to'
			}
		},
		defaultVariants: { variant: 'default' }
	}
);

const iconVariants = cva('', {
	variants: {
		size: { lg: 'size-5', md: 'size-3.5', sm: 'size-2.5', xs: 'size-2' }
	},
	defaultVariants: { size: 'lg' }
});

const valueVariants = cva('leading-none font-black', {
	variants: {
		size: { lg: 'text-5xl', md: 'text-3xl', sm: 'text-[14px]', xs: 'text-sm' }
	},
	defaultVariants: { size: 'lg' }
});

const ringVariants = cva('ring-the-race-accent', {
	variants: {
		size: { lg: 'ring-4', md: 'ring-2', sm: 'ring-2', xs: 'ring-1' }
	},
	defaultVariants: { size: 'lg' }
});

const cornerVariants = cva('absolute', {
	variants: {
		size: { lg: '', md: '', sm: '', xs: '' },
		corner: {
			'top-left': '',
			'top-right': '',
			'bottom-left': '',
			'bottom-right': ''
		}
	},
	compoundVariants: [
		{ size: 'lg', corner: 'top-left', class: 'top-2 left-2' },
		{ size: 'lg', corner: 'top-right', class: 'top-2 right-2' },
		{ size: 'lg', corner: 'bottom-left', class: 'bottom-2 left-2' },
		{ size: 'lg', corner: 'bottom-right', class: 'right-2 bottom-2' },
		{ size: 'md', corner: 'top-left', class: 'top-1.5 left-1.5' },
		{ size: 'md', corner: 'top-right', class: 'top-1.5 right-1.5' },
		{ size: 'md', corner: 'bottom-left', class: 'bottom-1.5 left-1.5' },
		{ size: 'md', corner: 'bottom-right', class: 'right-1.5 bottom-1.5' },
		{ size: 'sm', corner: 'top-left', class: 'top-1 left-1' },
		{ size: 'sm', corner: 'top-right', class: 'top-1 right-1' },
		{ size: 'sm', corner: 'bottom-left', class: 'bottom-1 left-1' },
		{ size: 'sm', corner: 'bottom-right', class: 'right-1 bottom-1' },
		{ size: 'xs', corner: 'top-left', class: 'top-0.5 left-0.5' },
		{ size: 'xs', corner: 'top-right', class: 'top-0.5 right-0.5' },
		{ size: 'xs', corner: 'bottom-left', class: 'bottom-0.5 left-0.5' },
		{ size: 'xs', corner: 'bottom-right', class: 'right-0.5 bottom-0.5' }
	],
	defaultVariants: { size: 'lg' }
});

type PlayingCardSize = NonNullable<VariantProps<typeof cardSizeVariants>['size']>;

interface PlayingCardProps {
	// When omitted, the card renders face down (its hidden back) — used for
	// opponents' committed-but-unrevealed cards. When a `card` later arrives on
	// the same instance, the back flips over to reveal it.
	card?: Card;
	size?: PlayingCardSize;
	selected?: boolean;
	paired?: boolean;
	isExtendable?: boolean;
	onClick?: () => void;
	disabled?: boolean;
}

export function PlayingCard({
	card,
	size = 'lg',
	selected,
	paired,
	isExtendable,
	onClick,
	disabled
}: PlayingCardProps) {
	const isRedline = card?.kind === 'redline';
	const variant = isRedline ? 'redline' : 'default';
	const showLabels = !!card && size === 'lg' && (isExtendable || isRedline);
	const isDraft = card?.kind === 'regular' && card.value === 3;
	const labelText = isExtendable ? (isDraft ? 'Drft. Ext' : 'Ext') : 'Redline';

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			tabIndex={onClick ? undefined : -1}
			aria-label={card ? undefined : 'Face-down card'}
			className={cn(
				cardSizeVariants({ size }),
				disabled && 'pointer-events-none opacity-50',
				(selected || paired) && ringVariants({ size })
			)}
		>
			<motion.div
				className="relative h-full w-full rounded-[inherit] transform-3d"
				initial={false}
				animate={{ rotateY: card ? 0 : 180 }}
				transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
			>
				{/* Front */}
				<div className={faceVariants({ variant })}>
					{card && (
						<>
							<SuitIcon
								suit={card.suit}
								className={cn(iconVariants({ size }), cornerVariants({ size, corner: 'top-left' }))}
							/>
							{showLabels && (
								<span
									className={cn(
										'text-xs font-bold tracking-tighter uppercase',
										cornerVariants({ size, corner: 'top-right' })
									)}
								>
									{labelText}
								</span>
							)}
							<span className={valueVariants({ size })}>{cardLabel(card)}</span>
							{showLabels && (
								<span
									className={cn(
										'rotate-180 text-xs font-bold tracking-tighter uppercase',
										cornerVariants({ size, corner: 'bottom-left' })
									)}
								>
									{labelText}
								</span>
							)}
							<SuitIcon
								suit={card.suit}
								className={cn(
									'rotate-180',
									iconVariants({ size }),
									cornerVariants({ size, corner: 'bottom-right' })
								)}
							/>
						</>
					)}
				</div>
				{/* Back */}
				<div className={cn(faceVariants({ variant: 'back' }), 'transform-[rotateY(180deg)]')}>
					<span
						className="absolute inset-0 rounded-[inherit] border-3 border-the-race-white-to bg-[repeating-linear-gradient(45deg,currentColor_0,currentColor_3px,transparent_3px,transparent_6px)]"
						aria-hidden
					/>
				</div>
			</motion.div>
		</button>
	);
}
