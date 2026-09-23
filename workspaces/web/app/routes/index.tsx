import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { PhotoPicture } from '~/components/PhotoPicture';
import { SlashNav } from '~/components/SlashNav';
import { absoluteUrl, getPhoto, PHOTOS } from '~/photos';

// The hero is object-contain inside the padded viewport box below, so the
// padding is the most it can lose. Its real painted width depends on the
// photo's aspect ratio against the viewport's, so this is an upper bound.
const HERO_SIZES = '(min-width: 640px) calc(100vw - 120px), calc(100vw - 80px)';

export const Route = createFileRoute('/')({
	// The photo list is bundled, so drawing one costs nothing. Drawn in the
	// loader rather than the component so the server and the hydrating client
	// agree on which photo it is.
	loader: () => ({ file: PHOTOS[Math.floor(Math.random() * PHOTOS.length)].file }),
	head: ({ loaderData }) => {
		const photo = loaderData ? getPhoto(loaderData.file) : undefined;
		const img = photo ? absoluteUrl(photo.socialImage) : '';
		return {
			// React preloads a fetchPriority="high" <img> by itself, but not one
			// inside <picture>, since it cannot tell which source the browser will
			// pick. The AVIF candidates are the ones worth starting early; the type
			// makes a browser that cannot decode AVIF skip the hint rather than
			// download bytes it will throw away.
			links: photo
				? [
						{
							rel: 'preload',
							as: 'image',
							type: 'image/avif',
							imageSrcSet: photo.picture.sources.avif,
							imageSizes: HERO_SIZES,
							fetchPriority: 'high'
						}
					]
				: [],
			meta: [
				{ title: 'Rafe Autie | Developer & Photographer' },
				{
					name: 'description',
					content:
						'Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture. Exploring the intersection of code and creativity.'
				},
				{ property: 'og:type', content: 'website' },
				{ property: 'og:url', content: 'https://rafe.dev/' },
				{ property: 'og:title', content: 'Rafe Autie | Developer & Photographer' },
				{
					property: 'og:description',
					content:
						'Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture.'
				},
				{ property: 'og:image', content: img },
				{ property: 'twitter:card', content: 'summary_large_image' },
				{ property: 'twitter:url', content: 'https://rafe.dev/' },
				{ property: 'twitter:title', content: 'Rafe Autie | Developer & Photographer' },
				{
					property: 'twitter:description',
					content:
						'Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture.'
				},
				{ property: 'twitter:image', content: img }
			]
		};
	},
	component: HomePage
});

function HomePage() {
	const photo = getPhoto(Route.useLoaderData().file);

	return (
		<div className="flex w-full flex-col items-center justify-center">
			{/* The padding is what the photo is contained within, so it sits on this
			    element and the image fills what is left. This is the content box the
			    old background-origin: content-box was measuring against. */}
			<div className="relative h-dvh w-full p-10 sm:p-15">
				<PhotoPicture
					picture={photo.picture}
					sizes={HERO_SIZES}
					// Decorative: the photo rotates per request and carries no
					// caption here, and the nav below is the page's actual content.
					alt=""
					fetchPriority="high"
					decoding="async"
					className="h-full w-full object-contain"
				/>
				{/* Overlaid rather than a sibling in flow, so the nav stays centred on
				    the viewport whether or not a photo loaded. */}
				<div className="absolute inset-0 flex flex-col items-center justify-center text-[clamp(1rem,2.5vmin,10rem)] font-medium text-background transition-colors duration-500 smh:text-background/0">
					<SlashNav separatorClassName="text-inherit opacity-60">
						<Link href="/about">rafe</Link>
						<Link href="/photography">photography</Link>
						<Link href="/development">development</Link>
					</SlashNav>
				</div>
			</div>
		</div>
	);
}
