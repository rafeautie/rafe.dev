import { cn } from '~/lib/utils';

// Copies of the shmoney repo's docs/screenshots, refreshed with
// `pnpm sync-screenshots`. The build encodes each into AVIF and WebP srcsets
// under hashed asset names, which public/_headers caches as immutable.
type Picture = {
	sources: Record<string, string>;
	img: { src: string; w: number; h: number };
};

const PICTURES = import.meta.glob<Picture>('./screenshots/*.png', {
	query: '?w=640;960;1280;1920&format=avif;webp&as=picture',
	import: 'default',
	eager: true
});

export type ScreenshotFile =
	| 'accounts.png'
	| 'activity.png'
	| 'budget.png'
	| 'chat.png'
	| 'report-detail.png'
	| 'reports.png'
	| 'settings-llm.png'
	| 'transactions.png';

export function Screenshot({
	file,
	alt,
	sizes,
	eager = false,
	className
}: {
	file: ScreenshotFile;
	alt: string;
	sizes: string;
	eager?: boolean;
	className?: string;
}) {
	const picture = PICTURES[`./screenshots/${file}`];
	return (
		<picture>
			{Object.entries(picture.sources).map(([format, srcSet]) => (
				<source key={format} type={`image/${format}`} srcSet={srcSet} sizes={sizes} />
			))}
			<img
				src={picture.img.src}
				alt={alt}
				width={picture.img.w}
				height={picture.img.h}
				loading={eager ? 'eager' : 'lazy'}
				fetchPriority={eager ? 'high' : undefined}
				decoding="async"
				className={cn('w-full rounded-lg border border-black/10 shadow-sm', className)}
			/>
		</picture>
	);
}
