import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEMO_URL } from '~/components/shmoney/constants';
import { Screenshot, type ScreenName } from '~/components/shmoney/Screenshot';
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

// One app for the whole page: changing `screen` navigates it rather than
// reloading, so whatever the visitor did carries over from screen to screen.
export function LiveDemo({ screen, alt }: { screen: ScreenName; alt: string }) {
	const box = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLIFrameElement>(null);
	// a desktop layout scaled onto a phone is unusable, so small screens keep
	// the screenshot
	const wide = useMedia('(min-width: 768px)');
	const [scale, setScale] = useState(0);
	const [ready, setReady] = useState(false);
	const [initial] = useState(screen);

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

	return (
		<div
			ref={box}
			className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm"
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
	);
}
