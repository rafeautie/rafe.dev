import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { getImageUrl } from '../utils';

const getPhotos = createServerFn().handler(async () => {
	const objectData = await env.PHOTOS.list();

	if (!objectData) {
		return { images: [] as { key: string }[] };
	}

	return { images: objectData.objects.map(({ key }) => ({ key })) };
});

export const Route = createFileRoute('/photography')({
	loader: () => getPhotos(),
	head: ({ loaderData }) => {
		const firstImg =
			loaderData?.images && loaderData.images.length > 0
				? getImageUrl(loaderData.images[0]!.key)
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
	const { images } = Route.useLoaderData();

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2">
			{images.map((image) => (
				<img
					key={image.key}
					src={getImageUrl(image.key)}
					alt="Photograph"
					className="self-center object-contain"
					loading="lazy"
				/>
			))}
		</div>
	);
}
