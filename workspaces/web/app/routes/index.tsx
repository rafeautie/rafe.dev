import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { AVIF_CEILING_WIDTH, buildSrcSet, getImageUrl, SOCIAL_IMAGE_WIDTH } from '../utils';

// The hero is object-contain inside a viewport box, so a phone paints it at a
// fraction of the width a desktop does. Serving one size to both meant mobile
// downloading several times what it could display. Topping out at the AVIF
// ceiling keeps every candidate on the cheap side of the codec cliff.
const HERO_WIDTHS = [640, 1024, AVIF_CEILING_WIDTH];
// Contained, so the painted width never exceeds the viewport. An upper bound is
// the best that can be stated here: the real width depends on each photo's
// aspect ratio, which is not known until the pixels land.
const HERO_SIZES = '100vw';

// The bucket holds more than photographs: gallery.json, the manifest the
// photography route reads, sits alongside them. Handing that key to the image
// transform returns a 415 and the hero renders blank, so drawing is restricted
// to things that are actually images.
const PHOTO_KEY = /\.(jpe?g|png|webp|avif)$/i;

const getRandomPhoto = createServerFn().handler(async () => {
	const objectData = await env.PHOTOS.list();
	const photos = objectData?.objects?.filter(({ key }) => PHOTO_KEY.test(key)) ?? [];

	if (!photos.length) {
		return { key: '' };
	}

	const randomIndex = Math.floor(Math.random() * photos.length);
	return { key: photos[randomIndex]?.key ?? '' };
});

export const Route = createFileRoute('/')({
	loader: () => getRandomPhoto(),
	head: ({ loaderData }) => {
		const img = loaderData?.key ? getImageUrl(loaderData.key, SOCIAL_IMAGE_WIDTH) : '';
		return {
			// No hand-written preload for the hero. It is a real <img> in the
			// server-rendered markup, and React emits a matching rel=preload for it
			// automatically because of fetchPriority="high" — one that restates the
			// srcset, so it cannot drift out of sync with the element the way a
			// hand-maintained hint would.
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
	const { key } = Route.useLoaderData();

	return (
		<div className="flex w-full flex-col items-center justify-center">
			{/* The padding is what the photo is contained within, so it sits on this
			    element and the image fills what is left. This is the content box the
			    old background-origin: content-box was measuring against. */}
			<div className="relative h-dvh w-full p-10 sm:p-15">
				{key && (
					<img
						src={getImageUrl(key, AVIF_CEILING_WIDTH)}
						srcSet={buildSrcSet(key, HERO_WIDTHS)}
						sizes={HERO_SIZES}
						// Decorative: the photo rotates per request and carries no
						// caption here, and the nav below is the page's actual content.
						alt=""
						fetchPriority="high"
						decoding="async"
						className="h-full w-full object-contain"
					/>
				)}
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
