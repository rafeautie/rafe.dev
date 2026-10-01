import { Menu } from '@base-ui/react/menu';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
	Check,
	ChevronUp,
	Headphones,
	LoaderCircle,
	LocateFixed,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	X
} from 'lucide-react';
import type { RefObject } from 'react';
import { cn } from '~/lib/utils';
import { SPEEDS, useReadAloud, VOICES } from '~/lib/read-aloud';

// Listening to a post: a headphones toggle beside the date, and while it
// reads, a player floating at the foot of the window to pause, skip, stop,
// change the voice or speed, and follow along. The voice runs on the reader's
// own device (lib/read-aloud.worker.ts).
export function ReadAloud({
	target,
	className
}: {
	target: RefObject<HTMLElement | null>;
	className?: string;
}) {
	const reader = useReadAloud();
	const { state } = reader;
	const active = state === 'loading' || state === 'playing' || state === 'paused';

	function trigger() {
		if (state === 'playing') reader.pause();
		else if (state === 'paused') reader.resume();
		else if (state !== 'loading' && target.current) reader.start(target.current);
	}

	const label =
		state === 'error'
			? 'Couldn’t load the voice, try again'
			: state === 'loading'
				? 'Loading voice'
				: state === 'playing'
					? 'Pause reading'
					: state === 'paused'
						? 'Resume reading'
						: 'Listen';

	return (
		<MotionConfig reducedMotion="user">
			<button
				type="button"
				onClick={trigger}
				disabled={state === 'loading'}
				aria-label={label}
				aria-pressed={active}
				title={label}
				className={cn(
					'-m-1.5 grid cursor-pointer place-items-center rounded-md p-1.5 text-foreground/50 transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-foreground/50',
					active && 'text-foreground',
					state === 'error' && 'text-red-500/80',
					className
				)}
			>
				{state === 'playing' ? (
					<Bars />
				) : state === 'loading' ? (
					<LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
				) : (
					<Headphones aria-hidden="true" className="size-4" />
				)}
			</button>
			<AnimatePresence>{active && <Player reader={reader} />}</AnimatePresence>
		</MotionConfig>
	);
}

const round =
	'grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors';
const quiet = 'text-foreground/60 hover:bg-foreground/5 hover:text-foreground';
const groupLabel = 'px-3 pt-2 pb-1 text-xs text-foreground/40';

function speedLabel(speed: number) {
	return `${speed}×`;
}

function Player({ reader }: { reader: ReturnType<typeof useReadAloud> }) {
	const { state, progress, segment, total, speed, follow } = reader;
	const voice = VOICES.find((voice) => voice.id === reader.voice) ?? VOICES[0];
	const loading = state === 'loading';

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
			<motion.div
				role="region"
				aria-label="Read aloud"
				initial={{ opacity: 0, y: 16, scale: 0.96 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 16, scale: 0.96 }}
				transition={{ type: 'spring', duration: 0.45, bounce: 0.15 }}
				className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-foreground/10 bg-background/85 p-1.5 text-sm text-foreground shadow-lg shadow-black/5 backdrop-blur-md"
			>
				<button
					type="button"
					aria-label="Previous passage"
					title="Previous passage (←)"
					onClick={reader.previous}
					className={cn(round, quiet, 'size-8')}
				>
					<SkipBack aria-hidden="true" className="size-4 fill-current" />
				</button>
				<button
					type="button"
					aria-label={state === 'playing' ? 'Pause' : 'Play'}
					disabled={loading}
					onClick={state === 'playing' ? reader.pause : reader.resume}
					className={cn(round, 'bg-foreground text-background disabled:cursor-default')}
				>
					{loading ? (
						<LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
					) : state === 'playing' ? (
						<Pause aria-hidden="true" className="size-4 fill-current" />
					) : (
						<Play aria-hidden="true" className="size-4 translate-x-px fill-current" />
					)}
				</button>
				<button
					type="button"
					aria-label="Next passage"
					title="Next passage (→)"
					onClick={reader.next}
					className={cn(round, quiet, 'size-8')}
				>
					<SkipForward aria-hidden="true" className="size-4 fill-current" />
				</button>

				{/* on a phone, only while loading: the bar would crowd the pill */}
				<div
					className={cn(
						'w-24 items-center justify-center px-2',
						loading ? 'flex' : 'hidden sm:flex'
					)}
					role="status"
				>
					{loading ? (
						<span className="text-foreground/60 tabular-nums">
							{progress > 0 && progress < 1 ? `Loading ${Math.round(progress * 100)}%` : 'Loading'}
						</span>
					) : (
						// how far through the post
						<span className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
							<span className="sr-only">
								Passage {segment + 1} of {total}
							</span>
							<span
								aria-hidden="true"
								className="block h-full rounded-full bg-foreground/50 transition-[width] duration-500 ease-out"
								style={{ width: `${((segment + 1) / Math.max(total, 1)) * 100}%` }}
							/>
						</span>
					)}
				</div>

				{/* Voice and speed. It stays open on a choice, so voices can be
				    tried one after another. */}
				<Menu.Root modal={false}>
					<Menu.Trigger
						aria-label={`Voice ${voice.name}, speed ${speedLabel(speed)}`}
						className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 whitespace-nowrap transition-colors hover:bg-foreground/5 data-popup-open:bg-foreground/5"
					>
						{voice.name}
						<span className="text-foreground/40 tabular-nums">{speedLabel(speed)}</span>
						<ChevronUp aria-hidden="true" className="size-3.5 text-foreground/50" />
					</Menu.Trigger>
					<Menu.Portal>
						<Menu.Positioner side="top" sideOffset={10} className="z-50">
							<Menu.Popup className="w-52 origin-(--transform-origin) rounded-2xl border border-foreground/10 bg-background p-1 text-sm text-foreground shadow-lg shadow-black/5 transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
								<Menu.Group>
									<Menu.GroupLabel className={groupLabel}>Voice</Menu.GroupLabel>
									<Menu.RadioGroup
										value={reader.voice}
										onValueChange={(value) => reader.configure({ voice: value })}
									>
										{VOICES.map((option) => (
											<Menu.RadioItem
												key={option.id}
												value={option.id}
												closeOnClick={false}
												className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 outline-none select-none data-highlighted:bg-foreground/5"
											>
												<span className="flex-1">{option.name}</span>
												<span className="text-xs text-foreground/40">{option.accent}</span>
												<span className="grid size-3.5 place-items-center">
													<Menu.RadioItemIndicator>
														<Check aria-hidden="true" className="size-3.5" />
													</Menu.RadioItemIndicator>
												</span>
											</Menu.RadioItem>
										))}
									</Menu.RadioGroup>
								</Menu.Group>
								<Menu.Separator className="mx-3 my-1 h-px bg-foreground/10" />
								<Menu.Group>
									<Menu.GroupLabel className={groupLabel}>Speed</Menu.GroupLabel>
									<Menu.RadioGroup
										value={speed}
										onValueChange={(value) => reader.configure({ speed: value })}
										className="flex gap-0.5 px-1 pb-1"
									>
										{SPEEDS.map((option) => (
											<Menu.RadioItem
												key={option}
												value={option}
												closeOnClick={false}
												className="flex-1 cursor-pointer rounded-lg py-1.5 text-center text-xs tabular-nums outline-none select-none data-highlighted:not-data-checked:bg-foreground/5 data-checked:bg-foreground data-checked:text-background"
											>
												{speedLabel(option)}
											</Menu.RadioItem>
										))}
									</Menu.RadioGroup>
								</Menu.Group>
							</Menu.Popup>
						</Menu.Positioner>
					</Menu.Portal>
				</Menu.Root>

				<button
					type="button"
					aria-label="Follow along"
					aria-pressed={follow}
					title={follow ? 'Following along' : 'Follow along'}
					onClick={() => reader.configure({ follow: !follow })}
					className={cn(round, follow ? 'bg-foreground/5 text-foreground' : quiet)}
				>
					<LocateFixed aria-hidden="true" className="size-4" />
				</button>
				<button type="button" aria-label="Stop" onClick={reader.stop} className={cn(round, quiet)}>
					<X aria-hidden="true" className="size-4" />
				</button>
			</motion.div>
		</div>
	);
}

// A small level meter, moving while the voice speaks, in place of the headphones
function Bars() {
	return (
		<span aria-hidden="true" className="flex size-4 items-center justify-center gap-[2px]">
			{[0, 1, 2].map((bar) => (
				<span
					key={bar}
					className="listening-bar h-full w-[2px] rounded-full bg-current"
					style={{ animationDelay: `${bar * -0.35}s` }}
				/>
			))}
		</span>
	);
}
