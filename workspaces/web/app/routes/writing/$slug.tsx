import { createFileRoute, notFound } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { absoluteUrl } from '~/photos';
import {
	DEFAULT_IMAGE,
	formatDate,
	getPost,
	loadHtml,
	transitionName,
	VIEW_TRANSITIONS
} from '~/writing';

export const Route = createFileRoute('/writing/$slug')({
	loader: async ({ params }) => {
		const post = getPost(params.slug);
		if (!post) throw notFound();
		return { post, html: await loadHtml(post) };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { post } = loaderData;
		const image = post.image ?? DEFAULT_IMAGE;
		const imageUrl = absoluteUrl(image.src);
		return {
			meta: [
				{ title: `${post.title} | Rafe Autie` },
				{ name: 'description', content: post.description },
				{ name: 'author', content: 'Rafe Autie' },
				{ property: 'og:type', content: 'article' },
				{ property: 'og:url', content: post.url },
				{ property: 'og:title', content: post.title },
				{ property: 'og:description', content: post.description },
				{ property: 'og:image', content: imageUrl },
				{ property: 'og:image:width', content: String(image.width) },
				{ property: 'og:image:height', content: String(image.height) },
				{ property: 'og:image:alt', content: image.alt },
				{ property: 'article:published_time', content: post.date },
				{ property: 'article:author', content: 'https://rafe.dev/about' },
				{ property: 'twitter:card', content: 'summary_large_image' },
				{ property: 'twitter:url', content: post.url },
				{ property: 'twitter:title', content: post.title },
				{ property: 'twitter:description', content: post.description },
				{ property: 'twitter:image', content: imageUrl },
				{ property: 'twitter:image:alt', content: image.alt }
			],
			links: [{ rel: 'canonical', href: post.url }],
			styles: [VIEW_TRANSITIONS]
		};
	},
	component: PostPage
});

function PostPage() {
	const { post, html } = Route.useLoaderData();

	return (
		<div className="px-6 py-8 text-base text-black sm:px-8">
			<div className="mx-auto max-w-2xl">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					<Link href="/writing">writing</Link>
				</SlashNav>
				<article className="mt-16 sm:mt-24">
					<header>
						<time dateTime={post.date} className="text-sm text-black/50">
							{formatDate(post.date)}
						</time>
						{/* matched on the index, which morphs into these */}
						<h1
							style={{ viewTransitionName: transitionName(post, 'title') }}
							className="mt-3 w-fit text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
						>
							{post.title}
						</h1>
						<p
							style={{ viewTransitionName: transitionName(post, 'description') }}
							className="mt-5 w-fit text-lg text-pretty text-black/60"
						>
							{post.description}
						</p>
					</header>
					<div
						className="post prose mt-12 max-w-none prose-neutral sm:prose-lg"
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				</article>
				<footer className="mt-24 flex items-center justify-between gap-4 border-t border-black/10 pt-8 text-sm text-black/60">
					<p>
						Written by{' '}
						<Link href="/about" className="text-black">
							Rafe Autie
						</Link>
					</p>
					<Link href="/writing" className="hover:text-black">
						More writing
					</Link>
				</footer>
			</div>
		</div>
	);
}
