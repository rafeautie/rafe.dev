import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '~/lib/utils';
import type { TurnPrompt } from '../engine/raceView';

interface TurnBannerProps {
	prompt: TurnPrompt;
	className?: string;
}

// The headline between the standings and the log: what the viewer should be
// doing right now, or what they're waiting on. Copy comes from the pure
// turnPrompt projection; this only renders (and cross-fades) it.
export function TurnBanner({ prompt, className }: TurnBannerProps) {
	return (
		<div
			className={cn(
				'flex flex-col items-center justify-center gap-1.5 px-4 text-center',
				className
			)}
		>
			<AnimatePresence mode="wait">
				<motion.span
					key={prompt.title}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.2, ease: 'easeInOut' }}
					className="text-3xl font-extrabold tracking-wide text-the-race-white-from uppercase"
				>
					{prompt.title}
				</motion.span>
			</AnimatePresence>
			<AnimatePresence mode="wait">
				{prompt.subtitle && (
					<motion.span
						key={prompt.subtitle}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.2, ease: 'easeInOut' }}
						className="text-[15px] text-white/60"
					>
						{prompt.subtitle}
					</motion.span>
				)}
			</AnimatePresence>
		</div>
	);
}
