import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEMO_URL } from '~/components/shmoney/constants';
import { Screenshot, type ScreenName } from '~/components/shmoney/Screenshot';

// The real shmoney app embedded on the page: its renderer, IPC handlers and an
// in-memory SQLite database with sample data, all running in the demo iframe.
// Nothing leaves the visitor's browser.

// the demo lays out for a desktop window; it renders at this size and scales
// to the column. The screenshots are shot at the same size, so the one shown
// while an embed boots is pixel for pixel what replaces it.
const APP_WIDTH = 1280;
const APP_HEIGHT = 800;
const DEMO_ORIGIN = new URL(DEMO_URL).origin;

// Every embed is a whole app with its own database, so only the few nearest
// the viewport run at once. An embed starts booting within a screen of the
// viewport, so it is usually ready by the time it scrolls in.
const MAX_LIVE = 3;
const embeds = new Map<ScreenName, Element>();
let live: ScreenName[] = [];
const listeners = new Set<() => void>();
let frame = 0;

function distance(element: Element): number {
	const { top, bottom } = element.getBoundingClientRect();
	if (bottom < 0) return -bottom;
	if (top > window.innerHeight) return top - window.innerHeight;
	return 0;
}

function update(): void {
	frame = 0;
	const next = [...embeds]
		.map(([name, element]) => ({ name, gap: distance(element) }))
		.filter(({ gap }) => gap < window.innerHeight)
		.sort((a, b) => a.gap - b.gap)
		.slice(0, MAX_LIVE)
		.map(({ name }) => name);
	// embeds that stay live keep their iframe (and whatever the visitor did in it)
	if (next.length === live.length && next.every((name) => live.includes(name))) return;
	live = next;
	listeners.forEach((listener) => listener());
}

function schedule(): void {
	if (!frame) frame = requestAnimationFrame(update);
}

function track(name: ScreenName, element: Element): () => void {
	if (embeds.size === 0) {
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
	}
	embeds.set(name, element);
	schedule();
	return () => {
		embeds.delete(name);
		if (embeds.size === 0) {
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', schedule);
		}
		schedule();
	};
}

function useLive(name: ScreenName): boolean {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => live.includes(name),
		() => false
	);
}

// a desktop layout scaled onto a phone is unusable, so small screens keep the
// screenshot
function useWide(): boolean {
	return useSyncExternalStore(
		(listener) => {
			const query = window.matchMedia('(min-width: 768px)');
			query.addEventListener('change', listener);
			return () => query.removeEventListener('change', listener);
		},
		() => window.matchMedia('(min-width: 768px)').matches,
		() => false
	);
}

export function LiveDemo({
	name,
	alt,
	eager = false
}: {
	name: ScreenName;
	alt: string;
	eager?: boolean;
}) {
	const box = useRef<HTMLDivElement>(null);
	const wide = useWide();
	const live = useLive(name) && wide;
	const [scale, setScale] = useState(0);

	useEffect(() => {
		if (!wide || !box.current) return;
		return track(name, box.current);
	}, [name, wide]);

	useLayoutEffect(() => {
		const element = box.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / APP_WIDTH));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={box}
			className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm"
		>
			<Screenshot
				name={name}
				alt={alt}
				sizes="(min-width: 1024px) 960px, 100vw"
				eager={eager}
				className="absolute inset-0 rounded-none border-0 shadow-none"
			/>
			{live && <DemoFrame name={name} alt={alt} scale={scale} />}
		</div>
	);
}

function DemoFrame({ name, alt, scale }: { name: ScreenName; alt: string; scale: number }) {
	const frame = useRef<HTMLIFrameElement>(null);
	const [ready, setReady] = useState(false);

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

	return (
		<iframe
			ref={frame}
			title={`shmoney live demo: ${alt}`}
			src={`${DEMO_URL}/?screen=${name}&theme=light`}
			width={APP_WIDTH}
			height={APP_HEIGHT}
			style={{ transform: `scale(${scale})` }}
			className="absolute top-0 left-0 origin-top-left border-0 bg-white transition-opacity duration-300 data-[ready=false]:opacity-0"
			data-ready={ready}
		/>
	);
}
