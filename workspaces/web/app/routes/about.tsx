import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { PhotoPicture } from '~/components/PhotoPicture';
import { SlashNav } from '~/components/SlashNav';
import { absoluteUrl, getPhoto } from '~/photos';

const FEATURE = getPhoto('DSCF0740.jpg');
const THUMBS = ['DSCF0770.jpg', 'DSCF0784.jpg', 'DSCF0754.jpg'].map(getPhoto);

// The feature spans the page inside its p-8 padding; the three below share a
// 3-column grid with gap-6 between them.
const FEATURE_SIZES = 'calc(100vw - 4rem)';
const THUMB_SIZES = 'calc((100vw - 7rem) / 3)';

export const Route = createFileRoute('/about')({
	head: () => ({
		meta: [
			{ title: 'About | Rafe Autie' },
			{
				name: 'description',
				content:
					'Learn more about Rafe Autie, a developer based in California specializing in mobile interfaces and front-end architecture, with a passion for photography.'
			},
			{ property: 'og:type', content: 'profile' },
			{ property: 'og:url', content: 'https://rafe.dev/about' },
			{ property: 'og:title', content: 'About | Rafe Autie' },
			{
				property: 'og:description',
				content:
					'Based in California, I am a developer specializing in mobile interfaces and front-end architecture.'
			},
			{ property: 'og:image', content: absoluteUrl(FEATURE.socialImage) },
			{ property: 'twitter:card', content: 'summary_large_image' },
			{ property: 'twitter:url', content: 'https://rafe.dev/about' },
			{ property: 'twitter:title', content: 'About | Rafe Autie' },
			{
				property: 'twitter:description',
				content:
					'Based in California, I am a developer specializing in mobile interfaces and front-end architecture.'
			},
			{ property: 'twitter:image', content: absoluteUrl(FEATURE.socialImage) }
		]
	}),
	component: AboutPage
});

function AboutPage() {
	return (
		<div className="flex flex-col gap-8 p-8 text-base text-black">
			<div className="space-y-2">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					about
				</SlashNav>
				<Link href="mailto:rafe@rafe.dev">rafe@rafe.dev</Link>
			</div>
			<div className="flex max-w-4xl flex-col gap-8">
				<p>
					Based in California, I am a developer specializing in mobile interfaces and front-end
					architecture. I believe the best digital experiences feel as intentional as a
					well-composed photograph.
				</p>
				<p>
					When I'm not behind a screen, I'm usually lost in a National Park with a camera in my
					hand, chasing light and documenting the rugged beauty of the West.
				</p>
			</div>
			<div className="flex flex-col gap-6">
				{/* Usually the largest thing on screen, so it is the LCP candidate. */}
				<PhotoPicture
					picture={FEATURE.picture}
					sizes={FEATURE_SIZES}
					alt={FEATURE.alt}
					fetchPriority="high"
					decoding="async"
				/>
				<div className="grid grid-cols-3 gap-6">
					{THUMBS.map((photo) => (
						<PhotoPicture
							key={photo.file}
							picture={photo.picture}
							sizes={THUMB_SIZES}
							alt={photo.alt}
							loading="lazy"
							decoding="async"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
