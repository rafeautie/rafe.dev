import { useCallback, useEffect, useRef, useState } from 'react';
import { getImageUrl } from '~/utils';

// How many images load eagerly and reveal together as the first screen.
const EAGER_COUNT = 4;
// Neutral ratio for the skeleton box before the real pixels have been measured.
const PLACEHOLDER_RATIO = 3 / 2;

export function PhotoGallery({ imageKeys }: { imageKeys: string[] }) {
	const eagerCount = Math.min(EAGER_COUNT, imageKeys.length);
	const measured = useRef(0);
	const [eagerReady, setEagerReady] = useState(false);

	// Reveal the first screen as a single block once every eager image has been
	// measured, rather than letting them pop in one at a time.
	const onEagerMeasured = useCallback(() => {
		measured.current += 1;
		if (measured.current >= eagerCount) {
			setEagerReady(true);
		}
	}, [eagerCount]);

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2">
			{imageKeys.map((key, index) => {
				const eager = index < EAGER_COUNT;
				return (
					<PhotoFrame
						key={key}
						imageKey={key}
						eager={eager}
						canReveal={eager ? eagerReady : true}
						onMeasured={eager ? onEagerMeasured : undefined}
					/>
				);
			})}
		</div>
	);
}

function PhotoFrame({
	imageKey,
	eager,
	canReveal,
	onMeasured
}: {
	imageKey: string;
	eager: boolean;
	canReveal: boolean;
	onMeasured?: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const started = useRef(false);
	const [ratio, setRatio] = useState<number | null>(null);
	// Eager images start loading immediately; the rest wait until they approach
	// the viewport so the page settles top-to-bottom as you scroll.
	const [active, setActive] = useState(eager);

	useEffect(() => {
		if (active || !ref.current) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setActive(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '300px' }
		);
		observer.observe(ref.current);
		return () => observer.disconnect();
	}, [active]);

	useEffect(() => {
		if (!active || started.current) return;
		started.current = true;

		// Measure the real pixels off-document so the frame can reserve the exact
		// box before it paints — the frame is sized to the photo, never the photo
		// to the frame. The browser serves the same URL from cache on render.
		const loader = new Image();
		if (eager) loader.setAttribute('fetchpriority', 'high');
		const finish = (value: number) => {
			setRatio(value);
			onMeasured?.();
		};
		loader.onload = () =>
			finish(
				loader.naturalWidth && loader.naturalHeight
					? loader.naturalWidth / loader.naturalHeight
					: PLACEHOLDER_RATIO
			);
		loader.onerror = () => finish(PLACEHOLDER_RATIO);
		loader.src = getImageUrl(imageKey);
	}, [active, eager, imageKey, onMeasured]);

	const reveal = ratio !== null && canReveal;

	return (
		<div
			ref={ref}
			className="self-center overflow-hidden"
			style={{ aspectRatio: String(ratio ?? PLACEHOLDER_RATIO) }}
		>
			{reveal && (
				<img src={getImageUrl(imageKey)} alt="Photograph" className="h-full w-full object-cover" />
			)}
		</div>
	);
}
