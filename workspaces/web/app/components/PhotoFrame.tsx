import { useEffect, useRef, useState } from 'react';
import { cn } from '~/lib/utils';
import { getImageUrl } from '~/utils';

export type Photo = { key: string; width: number; height: number };

export function PhotoFrame({ image }: { image: Photo }) {
	const ref = useRef<HTMLImageElement>(null);
	const [loaded, setLoaded] = useState(false);

	// Images that are already cached can finish loading before React attaches
	// the onLoad handler, so reconcile against the element's complete flag.
	useEffect(() => {
		if (ref.current?.complete) {
			setLoaded(true);
		}
	}, []);

	return (
		<div
			className="relative self-center overflow-hidden"
			style={{ aspectRatio: `${image.width} / ${image.height}` }}
		>
			<div
				className={cn(
					'absolute inset-0 bg-neutral-100 transition-opacity duration-700 ease-out',
					loaded ? 'opacity-0' : 'animate-pulse opacity-100'
				)}
			/>
			<img
				ref={ref}
				src={getImageUrl(image.key)}
				alt="Photograph"
				loading="lazy"
				onLoad={() => setLoaded(true)}
				className={cn(
					'h-full w-full object-cover transition-opacity duration-700 ease-out',
					loaded ? 'opacity-100' : 'opacity-0'
				)}
			/>
		</div>
	);
}
