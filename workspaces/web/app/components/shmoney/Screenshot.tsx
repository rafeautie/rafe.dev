import { DEMO_URL } from '~/components/shmoney/constants';
import { cn } from '~/lib/utils';

// Shot from the live demo by the shmoney repo's release workflow and deployed
// next to it, so the page and the demo always show the same build and data.
// Names match the demo's screens.json.
export type ScreenName =
	| 'accounts'
	| 'activity'
	| 'budget'
	| 'chat'
	| 'report-detail'
	| 'reports'
	| 'settings-llm'
	| 'transactions';

const WIDTHS = [640, 960, 1280, 1920];

const srcSet = (name: ScreenName, format: 'avif' | 'webp'): string =>
	WIDTHS.map((w) => `${DEMO_URL}/screenshots/${name}-${w}.${format} ${w}w`).join(', ');

export function Screenshot({
	name,
	alt,
	sizes,
	eager = false,
	className
}: {
	name: ScreenName;
	alt: string;
	sizes: string;
	eager?: boolean;
	className?: string;
}) {
	return (
		<picture>
			<source type="image/avif" srcSet={srcSet(name, 'avif')} sizes={sizes} />
			<source type="image/webp" srcSet={srcSet(name, 'webp')} sizes={sizes} />
			<img
				src={`${DEMO_URL}/screenshots/${name}-1280.webp`}
				alt={alt}
				width={2560}
				height={1600}
				loading={eager ? 'eager' : 'lazy'}
				fetchPriority={eager ? 'high' : undefined}
				decoding="async"
				className={cn('w-full rounded-lg border border-black/10 shadow-sm', className)}
			/>
		</picture>
	);
}
