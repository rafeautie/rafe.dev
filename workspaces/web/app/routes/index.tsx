import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { PhotoPicture } from '~/components/PhotoPicture';
import { absoluteUrl, getPhoto, PHOTOS, type Photo } from '~/photos';
import { useSignedIn } from '~/lib/admin/signed-in';
import { POSTS } from '~/writing';

// The hero is fitted inside a mat, so these are upper bounds. From md up the
// mat is the right 3/5 of the page less its padding and the gap,
// (100vw - 180px) * 3/5, less its own 40px inset either side; below md it spans
// the page less 24px padding and a 20px inset either side.
const HERO_SIZES = '(min-width: 768px) calc(60vw - 188px), calc(100vw - 88px)';

// One row per section. The note is a quiet line about what is there now, so
// it should come from the section's own data where there is any.
const SECTIONS = [
	{
		href: '/photography',
		name: 'photography',
		note: `${PHOTOS.length} ${PHOTOS.length === 1 ? 'photo' : 'photos'}`
	},
	{ href: '/development', name: 'development', note: 'apps and experiments' },
	{ href: '/writing', name: 'writing', note: POSTS[0] && `latest: ${POSTS[0].title}` }
];

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

// "yosemite, jan 2026", or as much of it as the photo has. photos.json is
// edited by hand, so a date that does not parse is left out rather than thrown.
function photoCredit(photo: Photo) {
	const date = new Date(photo.date);
	const month = photo.date && !Number.isNaN(date.getTime()) && MONTH_FORMAT.format(date);
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
	const signedIn = useSignedIn();
	const sections = signedIn
		? [...SECTIONS, { href: '/admin', name: 'admin', note: 'edit posts and photos' }]
		: SECTIONS;

	return (
		<div className="grid min-h-dvh w-full grid-rows-[46dvh_1fr] gap-7 p-6 text-foreground md:h-dvh md:min-h-140 md:grid-cols-[2fr_3fr] md:grid-rows-1 md:gap-15 md:p-15">
			<div className="flex flex-col gap-8 md:justify-between">
				<h1 className="text-lg font-medium">rafe autie</h1>
				<nav>
					<ul className="flex flex-col gap-4 md:gap-5.5">
						{sections.map((section) => (
							<li key={section.href}>
								<Link
									href={section.href}
									className="text-[1.375rem] font-medium tracking-tight md:text-[1.625rem]"
								>
									{section.name}
								</Link>
								{section.note && (
									<p className="mt-0.5 text-sm font-medium text-muted-foreground">{section.note}</p>
								)}
							</li>
						))}
					</ul>
				</nav>
				{credit && <p className="text-[0.8125rem] font-medium text-muted-foreground">{credit}</p>}
			</div>
			{/* A fixed mat, so the frame stays put when a refresh swaps a wide
			    photo for a tall one. The photo is absolutely placed so the cell,
			    not the photo, sets the row's size, and is fitted whole, never
			    cropped. */}
			<div className="relative order-first min-h-0 bg-muted md:order-last">
				<div className="absolute inset-5 md:inset-10">
					<PhotoPicture
						picture={photo.picture}
						sizes={HERO_SIZES}
						alt={photo.alt}
						fetchPriority="high"
						decoding="async"
						className="h-full w-full object-contain"
					/>
				</div>
			</div>
		</div>
	);
}
