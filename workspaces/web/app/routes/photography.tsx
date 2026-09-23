import { createFileRoute } from '@tanstack/react-router';
import { PhotoGallery } from '~/components/PhotoGallery';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { absoluteUrl, PHOTOS } from '~/photos';

export const Route = createFileRoute('/photography')({
	head: () => {
		const firstImg = PHOTOS[0] ? absoluteUrl(PHOTOS[0].socialImage) : undefined;

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
	return (
		<div className="flex flex-col gap-8 p-8 text-black">
			<SlashNav className="text-xl font-medium">
				<Link href="/">rafe</Link>
				photography
			</SlashNav>
			<PhotoGallery photos={PHOTOS} />
		</div>
	);
}
