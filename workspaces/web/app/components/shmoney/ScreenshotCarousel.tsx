import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
	type CarouselApi
} from '~/components/ui/carousel';

const SCREENSHOTS = [
	{
		src: '/shmoney/transactions.png',
		alt: 'shmoney transactions view with net worth, search and filters, and a categorized transaction list',
		description: 'Every account and transaction in one searchable, filterable list.'
	},
	{
		src: '/shmoney/budget.png',
		alt: 'shmoney envelope budget view',
		description: 'Envelope budgets you fill each month and drain as you spend.'
	},
	{
		src: '/shmoney/accounts.png',
		alt: 'shmoney accounts overview',
		description: 'All your accounts and balances at a glance.'
	},
	{
		src: '/shmoney/report-detail.png',
		alt: 'shmoney spending report detail',
		description: 'Reports that break down exactly where the money went.'
	},
	{
		src: '/shmoney/activity.png',
		alt: 'shmoney activity log of reversible changes',
		description: 'An activity log where every change can be undone.'
	},
	{
		src: '/shmoney/settings-llm.png',
		alt: 'shmoney settings for the offline AI categorization model',
		description: 'Offline AI categorization, configured entirely on your machine.'
	}
];

const AUTOPLAY_DELAY = 12000;
const MIN_SCALE = 0.9;
const MIN_OPACITY = 0.45;
const MAX_SHADOW_ALPHA = 0.35;

// Distance from `progress` to `snap` in snap-spacing units, accounting for the
// shortest path around the loop seam.
function wrappedDistance(snap: number, progress: number) {
	const diff = Math.abs(snap - progress);
	return Math.min(diff, 1 - diff);
}

// The snap the scroll position is currently closest to.
function nearestSnap(api: NonNullable<CarouselApi>) {
	const progress = api.scrollProgress();
	const snaps = api.scrollSnapList();
	const spacing = snaps.length > 1 ? Math.abs(snaps[1] - snaps[0]) : 1;
	let index = 0;
	let distance = Infinity;
	snaps.forEach((snap, snapIndex) => {
		const snapDistance = wrappedDistance(snap, progress);
		if (snapDistance < distance) {
			distance = snapDistance;
			index = snapIndex;
		}
	});
	return { index, distance, spacing };
}

// Continuously scale each slide and fade its shadow based on how far it sits
// from the center snap, so the tween tracks the scroll position frame by frame
// instead of stepping when a new slide is selected.
function tweenSlides(api: NonNullable<CarouselApi>) {
	const engine = api.internalEngine();
	const progress = api.scrollProgress();
	const snaps = api.scrollSnapList();
	const spacing = snaps.length > 1 ? Math.abs(snaps[1] - snaps[0]) : 1;

	snaps.forEach((snap, index) => {
		let diff = snap - progress;

		// When looping, measure against the slide's wrapped position.
		if (engine.options.loop) {
			for (const loopItem of engine.slideLooper.loopPoints) {
				const target = loopItem.target();
				if (index === loopItem.index && target !== 0) {
					if (Math.sign(target) === -1) diff = snap - (1 + progress);
					if (Math.sign(target) === 1) diff = snap + (1 - progress);
				}
			}
		}

		const distance = Math.min(Math.abs(diff) / spacing, 1);
		const img = api.slideNodes()[index]?.querySelector('img');
		if (!img) return;
		img.style.transform = `scale(${1 - (1 - MIN_SCALE) * distance})`;
		img.style.opacity = `${1 - (1 - MIN_OPACITY) * distance}`;
		img.style.boxShadow = `0 24px 60px -24px rgb(0 0 0 / ${MAX_SHADOW_ALPHA * (1 - distance)})`;
	});
}

export function ScreenshotCarousel() {
	const [api, setApi] = useState<CarouselApi>();
	const [captionIndex, setCaptionIndex] = useState(0);
	const playingRef = useRef(true);
	const elapsedRef = useRef(0);
	const progressBarRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (!api) return;

		const tween = () => tweenSlides(api);

		// Swapping the caption at the faded midpoint re-renders the pill, and its
		// layout animation handles the resize.
		const syncCaption = () => {
			setCaptionIndex(nearestSnap(api).index);
		};

		// Restart the dwell timer whenever a new slide becomes current, whether
		// from the timer itself or from the user navigating.
		const resetTimer = () => {
			elapsedRef.current = 0;
		};

		tween();
		api.on('scroll', tween);
		api.on('scroll', syncCaption);
		api.on('reInit', tween);
		api.on('select', resetTimer);

		// Hand-rolled autoplay: accumulate elapsed time while playing (and not
		// mid-drag), advance after the dwell, and mirror progress into the bar.
		// Pausing simply stops accumulating, so the timer resumes where it left off.
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(now: number) {
			const delta = now - last;
			last = now;
			if (playingRef.current && !api.internalEngine().dragHandler.pointerDown()) {
				elapsedRef.current += delta;
				if (elapsedRef.current >= AUTOPLAY_DELAY) {
					elapsedRef.current = 0;
					api.scrollNext();
				}
			}
			const bar = progressBarRef.current;
			if (bar) {
				bar.style.transform = `scaleX(${Math.min(elapsedRef.current / AUTOPLAY_DELAY, 1)})`;
			}
			frame = requestAnimationFrame(tick);
		});

		return () => {
			api.off('scroll', tween);
			api.off('scroll', syncCaption);
			api.off('reInit', tween);
			api.off('select', resetTimer);
			cancelAnimationFrame(frame);
		};
	}, [api]);

	const pauseAutoplay = () => {
		playingRef.current = false;
	};
	const resumeAutoplay = () => {
		playingRef.current = true;
	};

	return (
		<div>
			<Carousel
				setApi={setApi}
				opts={{ loop: true, align: 'center', duration: 60 }}
				className="-mt-3 -mb-14"
			>
				{/* Vertical padding gives the active slide's shadow room inside the
				    overflow-hidden scroll container; the negative margins above cancel
				    it out so page spacing is unchanged. The wrapper mask fades the
				    peeking side slides toward the edges without dimming the arrows. */}
				<div className="mask-x-from-[calc(100%-9rem)] mask-x-to-100%">
					<CarouselContent className="pt-3 pb-14">
						{SCREENSHOTS.map((shot, index) => (
							<CarouselItem key={shot.src} className="basis-3/4">
								<img
									src={shot.src}
									alt={shot.alt}
									width={1200}
									height={800}
									loading={index === 0 ? 'eager' : 'lazy'}
									draggable={false}
									className="w-full rounded-xl border border-border select-none"
								/>
							</CarouselItem>
						))}
					</CarouselContent>
				</div>
				<CarouselPrevious className="left-3 bg-background/80 backdrop-blur-sm" />
				<CarouselNext className="right-3 bg-background/80 backdrop-blur-sm" />
				{/* Centered via inset-x + mx-auto rather than a translate transform,
				    which the layout animation would override. layoutDependency limits
				    the layout animation to caption swaps, so window resizes reflow
				    instantly instead of sliding the pill around. */}
				<motion.p
					layout
					layoutDependency={captionIndex}
					transition={{ layout: { duration: 1, ease: [0.22, 1, 0.36, 1] } }}
					className="pointer-events-none absolute inset-x-0 bottom-[calc(3.5rem+min(1.9vw,1.5rem))] mx-auto w-fit max-w-[85%] overflow-hidden rounded-full border border-border bg-background/60 px-[1.45em] py-[0.6em] text-center text-[clamp(0.625rem,1.1vw,0.875rem)] whitespace-nowrap text-muted-foreground shadow-lg backdrop-blur-md"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={captionIndex}
							layout="position"
							layoutDependency={captionIndex}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
							className="block truncate"
						>
							{SCREENSHOTS[captionIndex].description}
						</motion.span>
					</AnimatePresence>
				</motion.p>
			</Carousel>
			<div className="mt-5 flex justify-center">
				<div
					onMouseEnter={pauseAutoplay}
					onMouseLeave={resumeAutoplay}
					className="rounded-full border border-border bg-background/60 px-4 py-2.5 shadow-lg backdrop-blur-md transition-colors hover:bg-background/80"
				>
					<span className="block h-1 w-8 overflow-hidden rounded-full bg-border">
						<span
							ref={progressBarRef}
							className="block h-full w-full origin-left bg-foreground/50"
						/>
					</span>
				</div>
			</div>
		</div>
	);
}
