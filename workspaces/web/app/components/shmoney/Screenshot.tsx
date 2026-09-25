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
	| 'goals'
	| 'report-detail'
	| 'reports'
	| 'savings-goals-report'
	| 'settings-llm'
	| 'transactions';

const WIDTHS = [640, 960, 1280, 1920];

// WebP only: the release workflow's AVIFs are 4:4:4 (AV1 High profile), which
// iOS Safari advertises support for but can't decode, leaving a broken image.
const srcSet = (name: ScreenName): string =>
	WIDTHS.map((w) => `${DEMO_URL}/screenshots/${name}-${w}.webp ${w}w`).join(', ');

export function Screenshot({
	name,
	alt,
	sizes,
	eager = false,
	className,
	onLoad
}: {
	name: ScreenName;
	alt: string;
	sizes: string;
	eager?: boolean;
	className?: string;
	onLoad?: () => void;
}) {
	return (
		<picture>
			<source type="image/webp" srcSet={srcSet(name)} sizes={sizes} />
			<img
				src={`${DEMO_URL}/screenshots/${name}-1280.webp`}
				alt={alt}
				width={2560}
				height={1600}
				loading={eager ? 'eager' : 'lazy'}
				fetchPriority={eager ? 'high' : undefined}
				decoding="async"
				onLoad={onLoad}
				className={cn('w-full rounded-lg border border-black/10 shadow-sm', className)}
			/>
		</picture>
	);
}
