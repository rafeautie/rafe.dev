import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { PhotoGallery } from '~/components/PhotoFrame';
import { getImageUrl } from '../utils';

// The gallery measures each photo's real aspect ratio on the client (see
// PhotoGallery), so the loader only needs to hand over the object keys.
const getPhotos = createServerFn().handler(async () => {
	const objectData = await env.PHOTOS.list();

	if (!objectData) {
		return { imageKeys: [] as string[] };
	}

	return { imageKeys: objectData.objects.map(({ key }) => key) };
});

export const Route = createFileRoute('/photography')({
	loader: () => getPhotos(),
	head: ({ loaderData }) => {
		const firstImg =
			loaderData?.imageKeys && loaderData.imageKeys.length > 0
				? getImageUrl(loaderData.imageKeys[0]!)
				: undefined;

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
	const { imageKeys } = Route.useLoaderData();

	return <PhotoGallery imageKeys={imageKeys} />;
}
