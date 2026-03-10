import { createFileRoute } from '@tanstack/react-router';
import { getImageUrl } from '../utils';

export const Route = createFileRoute('/about')({
	head: () => ({
		meta: [
			{ title: 'About | Rafe Autie' },
			{
				name: 'description',
				content:
					'Learn more about Rafe Autie, a developer based in California specializing in mobile interfaces and front-end architecture, with a passion for photography.'
			},
			{ property: 'og:type', content: 'profile' },
			{ property: 'og:url', content: 'https://rafe.dev/about' },
			{ property: 'og:title', content: 'About | Rafe Autie' },
			{
				property: 'og:description',
				content:
					'Based in California, I am a developer specializing in mobile interfaces and front-end architecture.'
			},
			{ property: 'og:image', content: getImageUrl('DSCF0740.JPEG') },
			{ property: 'twitter:card', content: 'summary_large_image' },
			{ property: 'twitter:url', content: 'https://rafe.dev/about' },
			{ property: 'twitter:title', content: 'About | Rafe Autie' },
			{
				property: 'twitter:description',
				content:
					'Based in California, I am a developer specializing in mobile interfaces and front-end architecture.'
			},
			{ property: 'twitter:image', content: getImageUrl('DSCF0740.JPEG') }
		]
	}),
	component: AboutPage
});

function AboutPage() {
	return (
		<div className="flex flex-col gap-8 p-8 text-xl text-black">
			<div className="space-y-2">
				<p className="text-4xl font-semibold tracking-wide">
					<a href="/">rafe / about</a>
				</p>
				<a href="mailto:rafe@rafe.dev">rafe@rafe.dev</a>
			</div>
			<div className="flex max-w-4xl flex-col gap-8">
				<p>
					Based in California, I am a developer specializing in mobile interfaces and front-end
					architecture. I believe the best digital experiences feel as intentional as a
					well-composed photograph.
				</p>
				<p>
					When I'm not behind a screen, I'm usually lost in a National Park with a camera in my
					hand, chasing light and documenting the rugged beauty of the West.
				</p>
			</div>
			<div className="flex flex-col gap-6">
				<img src={getImageUrl('DSCF0740.JPEG')} alt="Yosemite Valley" />
				<div className="grid grid-cols-3 gap-6">
					<img src={getImageUrl('DSCF0770.JPEG')} alt="Yosemite Lodge" />
					<img src={getImageUrl('DSCF0784.JPEG')} alt="Yosemite Abandoned Gas Station" />
					<img src={getImageUrl('DSCF0754.JPEG')} alt="Half Dome and a Plane" />
				</div>
			</div>
		</div>
	);
}
