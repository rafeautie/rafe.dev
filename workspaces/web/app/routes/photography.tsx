import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { loadPhotos } from '~/gallery-store';
import { PhotoGallery } from '~/components/PhotoGallery';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { getImageUrl } from '../utils';

// The gallery measures each photo's real aspect ratio on the client (see
// PhotoGallery), so the loader hands over keys and metadata but no dimensions.
const getPhotos = createServerFn().handler(async () => {
	const photos = await loadPhotos();
	return { photos: photos.filter(({ hidden }) => !hidden) };
});

export const Route = createFileRoute('/photography')({
	loader: () => getPhotos(),
	head: ({ loaderData }) => {
		const firstPhoto = loaderData?.photos?.[0];
		const firstImg = firstPhoto ? getImageUrl(firstPhoto.key) : undefined;

		return {
			meta: [
				{ title: 'Photography | Rafe Autie' },
				{
					name: 'description',
					content:
						'A curated selection of photographs by Rafe Autie, showcasing moments captured through the lens in the American West.'
				},
				{ property: 'og:type', content: 'website' },
				{ property: 'og:url', content: 'https://rafe.dev/photography' },
				{ property: 'og:title', content: 'Photography | Rafe Autie' },
				{
					property: 'og:description',
					content:
						'A curated selection of photographs by Rafe Autie, showcasing moments captured through the lens.'
				},
				...(firstImg ? [{ property: 'og:image', content: firstImg }] : []),
				{ property: 'twitter:card', content: 'summary_large_image' },
				{ property: 'twitter:url', content: 'https://rafe.dev/photography' },
				{ property: 'twitter:title', content: 'Photography | Rafe Autie' },
				{
					property: 'twitter:description',
					content:
						'A curated selection of photographs by Rafe Autie, showcasing moments captured through the lens.'
				},
				...(firstImg ? [{ property: 'twitter:image', content: firstImg }] : [])
			]
		};
	},
	component: PhotographyPage
});

function PhotographyPage() {
	const { photos } = Route.useLoaderData();

	return (
		<div className="flex flex-col gap-8 p-8 text-black">
			<SlashNav className="text-xl font-medium">
				<Link href="/">rafe</Link>
				photography
			</SlashNav>
			<PhotoGallery photos={photos} />
		</div>
	);
}
