import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button, type buttonVariants } from '~/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from '~/components/ui/dialog';
import { cn } from '~/lib/utils';

interface HowToPlayProps {
	/** Trigger button styling. Defaults to a subtle icon button that fits the dark race theme. */
	variant?: VariantProps<typeof buttonVariants>['variant'];
	size?: VariantProps<typeof buttonVariants>['size'];
	className?: string;
	/** Trigger label. Omit for an icon-only button. */
	label?: string;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
	return (
		<li className="flex gap-3">
			<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-the-race-red-from to-the-race-red-to text-xs font-bold text-the-race-white-from">
				{n}
			</span>
			<div className="space-y-1">
				<p className="font-bold tracking-wide text-the-race-white-from">{title}</p>
				<p className="text-the-race-white-to/80">{children}</p>
			</div>
		</li>
	);
}

function Term({ children }: { children: ReactNode }) {
	return <span className="font-semibold text-the-race-white-from">{children}</span>;
}

export function HowToPlay({
	variant = 'the-race-bg',
	size = 'lg',
	className,
	label
}: HowToPlayProps) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant={variant}
					size={label ? size : 'icon-lg'}
					className={cn('font-bold tracking-wide', className)}
					aria-label="How to play"
					title="How to play"
				>
					<HelpCircle />
					{label}
				</Button>
			</DialogTrigger>
			<DialogContent className="flex max-h-[min(600px,85dvh)] flex-col gap-0 overflow-hidden bg-linear-to-b from-[oklch(0.24_0.01_50)] to-[oklch(0.22_0.01_50)] p-0 text-the-race-white-from ring-white/10 sm:max-w-2xl">
				<DialogHeader className="shrink-0 border-b border-white/10 bg-[oklch(0.24_0.01_50)] px-5 pt-5 pb-4">
					<DialogTitle className="text-xl font-black tracking-tight">How to Play</DialogTitle>
					<DialogDescription className="text-the-race-white-to/80">
						An F1 racing game played with cards. Outscore your rivals over a full season to be
						crowned Drivers' Champion.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 scrollbar-none space-y-5 overflow-y-auto px-5 pt-4 pb-5 text-sm leading-relaxed">
					<ol className="space-y-4">
						<Step n={1} title="You drive a car">
							Each player controls one car (or a whole two-car team in a 2-player game). You hold a
							hand of cards valued <Term>1–12</Term>, plus the occasional <Term>Redline</Term>.
							Cards are your only fuel — running out of cards is what brings the race to an end.
						</Step>

						<Step n={2} title="Qualifying">
							Every car secretly plays one card. Once everyone has locked in, the cards are revealed
							at once and the <Term>starting grid</Term> is set — highest card takes pole, lowest
							starts at the back.
						</Step>

						<Step n={3} title="Take your turn">
							Cars act in order, <Term>last place first</Term>. On your turn you look at the space
							directly ahead of you:
							<span className="mt-2 block space-y-1.5">
								<span className="block">
									• <Term>Open road ahead?</Term> You may <Term>Extend</Term> (play a 1, 2 or 3 to
									move up one spot) or <Term>Discard</Term> a card to pass.
								</span>
								<span className="block">
									• <Term>A rival directly ahead?</Term> You <Term>must Challenge</Term> them to try
									to overtake.
								</span>
							</span>
						</Step>

						<Step n={4} title="Challenges">
							Both cars secretly commit a card. They're revealed together — higher value wins. If
							the <Term>challenger wins</Term>, the two cars swap places (an <Term>overtake</Term>).
							If the defender wins or it's a tie, positions hold and the challenger's turn ends.
						</Step>

						<Step n={5} title="Redline boost">
							Hold a <Term>Redline</Term> card and you can stack it onto your challenge card for a{' '}
							<Term>+2 boost</Term> — a clutch way to steal a place or defend a hard one. It can
							only be paired during a challenge.
						</Step>

						<Step n={6} title="Finishing the race">
							There's no finish line. Once a car runs out of cards the end is triggered, but the{' '}
							<Term>current round still plays out</Term> — every remaining car takes its turn up to{' '}
							<Term>first place</Term>, and the race ends only after the leader has played. Final
							track positions decide the result, and points are awarded F1-style:{' '}
							<Term>9-6-4-3-2-1</Term> down the order.
						</Step>

						<Step n={7} title="Win the championship">
							A <Term>season</Term> is a series of races. Points carry over between them, and
							whoever tops the standings after the final race is the <Term>Drivers' Champion</Term>.
							Watch for the <Term>Driver of the Day</Term> — awarded to whoever gained the most
							places.
						</Step>
					</ol>

					<p className="rounded-lg bg-white/5 p-3 text-the-race-white-to/80 ring-1 ring-white/10">
						<Term>Tip:</Term> Save your high cards for challenges where you really need to pass or
						defend — burning them too early leaves you stranded when it matters most.
					</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}
