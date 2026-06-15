import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { PhotoFrame, type Photo } from '~/components/PhotoFrame';
import { getImageUrl } from '../utils';

// Resolve each photo's intrinsic dimensions up front so the grid can reserve
// exact space and avoid layout shift as images stream in. The JSON metadata is
// tiny and edge-cached by Cloudflare.
const getPhotos = createServerFn().handler(async () => {
	const objectData = await env.PHOTOS.list();

	if (!objectData) {
		return { images: [] as Photo[] };
	}

	const images = await Promise.all(
		objectData.objects.map(async ({ key }): Promise<Photo> => {
			try {
				const res = await fetch(`https://images.rafe.dev/cdn-cgi/image/format=json/${key}`);
				if (res.ok) {
					const data = (await res.json()) as { width?: number; height?: number };
					if (data.width && data.height) {
						return { key, width: data.width, height: data.height };
					}
				}
			} catch {
				// Fall back to a 3:2 frame if metadata can't be fetched.
			}
			return { key, width: 3, height: 2 };
		})
	);

	return { images };
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
				<PhotoFrame key={image.key} image={image} />
			))}
		</div>
	);
}
