import { Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DEMO_URL } from '~/components/shmoney/constants';
import { Screenshot, type ScreenName } from '~/components/shmoney/Screenshot';
import { useLenis } from '~/components/shmoney/smooth-scroll';
import { useMedia } from '~/lib/use-media';

// The real shmoney app embedded on the page: its renderer, IPC handlers and an
// in-memory SQLite database with sample data, all running in the demo iframe.
// Nothing leaves the visitor's browser.

// the demo lays out for a desktop window; it renders at this size and scales
// to the column. The screenshots are shot at the same size, so the one shown
// while the embed boots is pixel for pixel what replaces it.
const APP_WIDTH = 1280;
const APP_HEIGHT = 800;
const DEMO_ORIGIN = new URL(DEMO_URL).origin;

const EXPAND_TIMING: KeyframeAnimationOptions = {
	duration: 500,
	easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
};

const CLEAR = 'rgb(0 0 0 / 0)';

// the transform that draws a box laid out at `at` over the rect `over`
function placing(at: DOMRect, over: DOMRect): string {
	return `translate(${over.left - at.left}px, ${over.top - at.top}px) scale(${over.width / at.width})`;
}

// One app for the whole page: changing `screen` navigates it rather than
// reloading, so whatever the visitor did carries over from screen to screen.
export function LiveDemo({ screen, alt }: { screen: ScreenName; alt: string }) {
	const slot = useRef<HTMLDivElement>(null);
	const pop = useRef<HTMLDivElement>(null);
	const box = useRef<HTMLDivElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	// a desktop layout scaled onto a phone is unusable, so small screens keep
	// the screenshot
	const wide = useMedia('(min-width: 768px)');
	const [scale, setScale] = useState(0);
	const [ready, setReady] = useState(false);
	const [initial] = useState(screen);
	const [expanded, setExpanded] = useState(false);
	const moving = useRef(false);
	const lenis = useLenis();

	useLayoutEffect(() => {
		const element = box.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / APP_WIDTH));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// the demo announces itself once its data is seeded and the app has booted;
	// until then the screenshot underneath stands in
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== DEMO_ORIGIN || event.source !== frame.current?.contentWindow) return;
			if (event.data?.type === 'shmoney-demo' && event.data.event === 'ready') setReady(true);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, []);

	// waits for the screen to settle, so scrolling past several stops at once
	// doesn't render each one on the way
	useEffect(() => {
		if (!ready) return;
		const timer = setTimeout(() => {
			frame.current?.contentWindow?.postMessage(
				{ type: 'shmoney-demo', action: 'navigate', screen },
				DEMO_ORIGIN
			);
		}, 150);
		return () => clearTimeout(timer);
	}, [ready, screen]);

	// Expanding lifts the demo into the top layer, over a dimmed page, as a
	// popover. It never moves in the DOM, since moving the iframe would reload
	// it and lose the visitor's changes; the slot keeps its place meanwhile.
	const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const fit = () => {
		if (box.current) flushSync(() => setScale(box.current!.clientWidth / APP_WIDTH));
	};

	// The frame box flies between the two rects and the button follows its
	// corner, moving without scaling, while the page dims or clears behind.
	// Growing, the layout is already at `to` and plays back from `from`;
	// shrinking, it's still at `from` and plays out to `to`, holding there
	// until the popover closes.
	const fly = (
		from: { box: DOMRect; button: DOMRect | undefined },
		to: { box: DOMRect; button: DOMRect | undefined },
		dim: [string, string],
		keep: boolean
	) => {
		const timing = { ...EXPAND_TIMING, fill: keep ? ('forwards' as const) : ('none' as const) };
		const boxMoves = keep
			? [{ transform: 'none' }, { transform: placing(from.box, to.box) }]
			: [{ transform: placing(to.box, from.box) }, { transform: 'none' }];
		const moves = [box.current!.animate(boxMoves, timing)];
		pop.current!.animate([{ backgroundColor: dim[0] }, { backgroundColor: dim[1] }], timing);
		if (button.current && from.button && to.button) {
			const dx = to.button.left - from.button.left;
			const dy = to.button.top - from.button.top;
			moves.push(
				button.current.animate(
					keep
						? [{ translate: '0 0' }, { translate: `${dx}px ${dy}px` }]
						: [{ translate: `${-dx}px ${-dy}px` }, { translate: '0 0' }],
					timing
				)
			);
		}
		return Promise.all(moves.map((move) => move.finished));
	};

	const measure = () => ({
		box: box.current!.getBoundingClientRect(),
		button: button.current?.getBoundingClientRect()
	});

	const expand = () => {
		const element = pop.current;
		if (!element || !box.current || moving.current) return;
		const from = measure();
		element.showPopover();
		flushSync(() => setExpanded(true));
		fit();
		lenis?.stop();
		if (still()) return;
		fly(from, measure(), [CLEAR, getComputedStyle(element).backgroundColor], false);
	};

	const collapse = async () => {
		const element = pop.current;
		if (!element || !box.current || !slot.current || moving.current) return;
		moving.current = true;
		if (!still()) {
			const from = measure();
			// once closed, the box fills the slot and the button keeps its offset
			// from the box's bottom right corner
			const target = slot.current.getBoundingClientRect();
			const button = from.button
				? new DOMRect(
						target.right - (from.box.right - from.button.left),
						target.bottom + (from.button.top - from.box.bottom),
						from.button.width,
						from.button.height
					)
				: undefined;
			await fly(
				from,
				{ box: target, button },
				[getComputedStyle(element).backgroundColor, CLEAR],
				true
			);
		}
		element.hidePopover();
		element.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
		flushSync(() => setExpanded(false));
		fit();
		lenis?.start();
		moving.current = false;
	};

	useEffect(() => {
		if (!expanded) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') collapse();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	return (
		<div ref={slot} className="relative aspect-[16/10] w-full">
			<div
				ref={pop}
				popover="manual"
				// open, the popover is the dimmed page around the demo, so a click
				// on it is a click on the background
				onClick={(event) => {
					if (expanded && event.target === event.currentTarget) collapse();
				}}
				className="group absolute inset-0 m-0 block size-full overflow-visible border-0 bg-transparent p-0 open:fixed open:grid open:max-h-none open:max-w-none open:place-items-center open:bg-black/50"
			>
				<div className="relative size-full group-open:h-[min(calc((100vw-6rem)/1.6),calc(100vh-8rem))] group-open:w-[min(calc(100vw-6rem),calc((100vh-8rem)*1.6))]">
					<div
						ref={box}
						className="relative size-full origin-top-left overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_40px_100px_-30px_rgb(0_0_0/0.3)]"
					>
						{!ready && (
							<Screenshot
								name={screen}
								alt={alt}
								sizes="(min-width: 1280px) 880px, (min-width: 1024px) 960px, 100vw"
								eager
								className="absolute inset-0 rounded-none border-0 shadow-none"
							/>
						)}
						{wide && (
							<iframe
								ref={frame}
								title="shmoney live demo"
								src={`${DEMO_URL}/?screen=${initial}&theme=light`}
								width={APP_WIDTH}
								height={APP_HEIGHT}
								style={{ transform: `scale(${scale})` }}
								className="absolute top-0 left-0 origin-top-left border-0 bg-white data-[ready=false]:opacity-0"
								data-ready={ready}
							/>
						)}
					</div>
					{wide && (
						<button
							ref={button}
							type="button"
							aria-label={expanded ? 'Shrink the demo' : 'Expand the demo'}
							title={expanded ? 'Shrink' : 'Expand'}
							onClick={expanded ? collapse : expand}
							className="absolute -right-2 -bottom-2 grid size-8 cursor-pointer place-items-center rounded-full border border-black/10 bg-white/85 text-black/60 shadow-md backdrop-blur-sm transition-colors hover:bg-white hover:text-black"
						>
							{expanded ? (
								<Minimize2Icon className="size-4" />
							) : (
								<Maximize2Icon className="size-4" />
							)}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
