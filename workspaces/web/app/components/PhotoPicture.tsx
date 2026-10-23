import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { Picture } from '~/photos';

// One <source> per format the build emitted, AVIF first, so the browser takes
// the smallest it can decode. width/height come from the build, which reserves
// the photo's real aspect ratio before any pixels arrive.
//
// With reveal, the photo blurs and fades in once it has both loaded and come
// into view. Lazy loading fetches well ahead of the viewport, so waiting on
// load alone would play most of the gallery's reveals offscreen.
//
// A cached page loads everything at once, so a whole screen would come into
// focus together. Each photo waits a random beat first, so they arrive one by
// one in no particular order.
const REVEAL_MAX_DELAY = 600;

export function PhotoPicture({
	picture,
	sizes,
	reveal = false,
	onLoad,
	...img
}: { picture: Picture; sizes: string; reveal?: boolean } & Omit<
	ComponentProps<'img'>,
	'src' | 'srcSet' | 'sizes' | 'width' | 'height'
>) {
	const ref = useRef<HTMLImageElement>(null);
	const [loaded, setLoaded] = useState(false);
	const [inView, setInView] = useState(false);
	const [shown, setShown] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!reveal || !element) return;
		// A cached photo can finish before hydration, so its load event is gone.
		if (element.complete && element.naturalWidth > 0) setLoaded(true);
		const observer = new IntersectionObserver(([entry]) => {
			if (!entry.isIntersecting) return;
			setInView(true);
			observer.disconnect();
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [reveal]);

	useEffect(() => {
		if (!loaded || !inView) return;
		const timer = setTimeout(() => setShown(true), Math.random() * REVEAL_MAX_DELAY);
		return () => clearTimeout(timer);
	}, [loaded, inView]);

	return (
		<picture>
			{Object.entries(picture.sources).map(([format, srcSet]) => (
				<source key={format} type={`image/${format}`} srcSet={srcSet} sizes={sizes} />
			))}
			<img
				ref={ref}
				src={picture.img.src}
				width={picture.img.w}
				height={picture.img.h}
				data-reveal={reveal ? (shown ? 'shown' : 'waiting') : undefined}
				onLoad={(event) => {
					setLoaded(true);
					onLoad?.(event);
				}}
				{...img}
			/>
		</picture>
	);
}
