import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { getImageUrl } from '../utils';

const getRandomPhoto = createServerFn().handler(async () => {
	const objectData = await env.PHOTOS.list();

	if (!objectData?.objects?.length) {
		return { key: '' };
	}

	const randomIndex = Math.floor(Math.random() * objectData.objects.length);
	return { key: objectData.objects[randomIndex]?.key ?? '' };
});

export const Route = createFileRoute('/')({
	loader: () => getRandomPhoto(),
	head: ({ loaderData }) => {
		const img = loaderData?.key ? getImageUrl(loaderData.key) : '';
		return {
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
	const imageUrl = key ? getImageUrl(key) : '';

	return (
		<div className="flex w-full flex-col items-center justify-center">
			<div
				className="flex h-dvh w-full flex-col items-center justify-center p-10 text-[clamp(1rem,2.5vmin,10rem)] font-medium text-background transition-colors duration-500 sm:p-15 smh:text-background/0"
				style={{
					backgroundImage: `url('${imageUrl}')`,
					backgroundSize: 'contain',
					backgroundPosition: 'center',
					backgroundRepeat: 'no-repeat',
					backgroundOrigin: 'content-box'
				}}
			>
				<SlashNav separatorClassName="text-inherit opacity-60">
					<Link href="/about">rafe</Link>
					<Link href="/photography">photography</Link>
					<Link href="/development">development</Link>
				</SlashNav>
			</div>
		</div>
	);
}
