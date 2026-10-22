import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { PhotoPicture } from '~/components/PhotoPicture';
import { absoluteUrl, getPhoto, PHOTOS, type Photo } from '~/photos';
import { POSTS } from '~/writing';

// The hero is fitted inside the right 3/5 of the padded page from sm up, and
// the full padded width above the list below it, so these are upper bounds.
const HERO_SIZES = '(min-width: 640px) calc(60vw - 60px), calc(100vw - 48px)';

// One row per section. The note is a quiet line about what is there now, so
// it should come from the section's own data where there is any.
const SECTIONS = [
	{ href: '/photography', name: 'photography', note: `${PHOTOS.length} photos` },
	{ href: '/development', name: 'development', note: 'apps and experiments' },
	{ href: '/writing', name: 'writing', note: POSTS[0] && `latest: ${POSTS[0].title}` }
];

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

// "yosemite, jan 2026", or as much of it as the photo has
function photoCredit(photo: Photo) {
	const month = photo.date && MONTH_FORMAT.format(new Date(photo.date));
	return [photo.location, month].filter(Boolean).join(', ').toLowerCase();
}

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
				{ name: 'twitter:card', content: 'summary_large_image' },
				{ name: 'twitter:url', content: 'https://rafe.dev/' },
				{ name: 'twitter:title', content: 'Rafe Autie | Developer & Photographer' },
				{
					name: 'twitter:description',
					content:
						'Digital home of Rafe Autie, a developer specializing in mobile interfaces and front-end architecture.'
				},
				{ name: 'twitter:image', content: img }
			]
		};
	},
	component: HomePage
});

function HomePage() {
	const photo = getPhoto(Route.useLoaderData().file);
	const credit = photoCredit(photo);

	return (
		<div className="grid min-h-dvh w-full grid-rows-[46dvh_1fr] gap-7 p-6 text-black sm:h-dvh sm:min-h-140 sm:grid-cols-[minmax(300px,2fr)_3fr] sm:grid-rows-1 sm:gap-15 sm:p-15">
			<nav className="flex flex-col gap-8 sm:justify-between">
				<p className="text-lg font-medium">rafe autie</p>
				<ul className="flex flex-col gap-4 sm:gap-5.5">
					{SECTIONS.map((section) => (
						<li key={section.href}>
							<Link
								href={section.href}
								className="text-[1.375rem] font-medium tracking-tight sm:text-[1.625rem]"
							>
								{section.name}
							</Link>
							{section.note && (
								<p className="mt-0.5 text-sm font-medium text-muted-foreground">{section.note}</p>
							)}
						</li>
					))}
				</ul>
				<p className="text-[0.8125rem] font-medium text-muted-foreground">{credit}</p>
			</nav>
			{/* Absolutely placed so the cell, not the photo, sets the row's size;
			    the photo is then fitted whole inside it, never cropped. */}
			<div className="relative order-first min-h-0 sm:order-last">
				<PhotoPicture
					picture={photo.picture}
					sizes={HERO_SIZES}
					// Decorative: the photo rotates per request, and the credit beside
					// the list says where it was taken.
					alt=""
					fetchPriority="high"
					decoding="async"
					className="absolute inset-0 h-full w-full object-contain"
				/>
			</div>
		</div>
	);
}
