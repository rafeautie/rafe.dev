import { createFileRoute, notFound } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';
import { absoluteUrl } from '~/photos';
import { DEFAULT_IMAGE, formatDate, getPost, lastModified, loadHtml } from '~/writing';

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
				{ property: 'article:modified_time', content: lastModified(post) },
				{ property: 'article:author', content: 'https://rafe.dev' },
				{ name: 'twitter:card', content: 'summary_large_image' },
				{ name: 'twitter:url', content: post.url },
				{ name: 'twitter:title', content: post.title },
				{ name: 'twitter:description', content: post.description },
				{ name: 'twitter:image', content: imageUrl },
				{ name: 'twitter:image:alt', content: image.alt }
			],
			links: [{ rel: 'canonical', href: post.url }],
			scripts: [
				{
					type: 'application/ld+json',
					// < escaped so a title cannot close the script tag
					children: JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'BlogPosting',
						headline: post.title,
						description: post.description,
						url: post.url,
						mainEntityOfPage: post.url,
						datePublished: post.date,
						dateModified: lastModified(post),
						image: {
							'@type': 'ImageObject',
							url: imageUrl,
							width: image.width,
							height: image.height
						},
						author: { '@type': 'Person', name: 'Rafe Autie', url: 'https://rafe.dev' }
					}).replaceAll('<', '\\u003c')
				}
			]
		};
	},
	component: PostPage
});

function PostPage() {
	const { post, html } = Route.useLoaderData();

	return (
		<div className="px-6 py-8 text-base text-foreground sm:px-8">
			<div className="mx-auto max-w-2xl">
				<div className="flex items-center justify-between gap-4">
					<SlashNav className="text-xl font-medium">
						<Link href="/">rafe</Link>
						<Link href="/writing">writing</Link>
					</SlashNav>
					<ThemeToggle />
				</div>
				<article className="mt-16 sm:mt-24">
					<header>
						<p className="text-sm text-foreground/50">
							<time dateTime={post.date}>{formatDate(post.date)}</time>
							{post.updated && (
								<>
									{' · updated '}
									<time dateTime={post.updated}>{formatDate(post.updated)}</time>
								</>
							)}
						</p>
						<h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
							{post.title}
						</h1>
						<p className="mt-5 text-lg text-pretty text-foreground/60">{post.description}</p>
					</header>
					<div
						className="post prose mt-12 max-w-none prose-neutral sm:prose-lg"
						dangerouslySetInnerHTML={{ __html: html }}
					/>
				</article>
				<footer className="mt-24 flex items-center justify-between gap-4 border-t border-foreground/10 pt-8 text-sm text-foreground/60">
					<p>
						Written by{' '}
						<Link href="/" className="text-foreground">
							Rafe Autie
						</Link>
					</p>
					<Link href="/writing" className="text-foreground">
						More writing
					</Link>
				</footer>
			</div>
		</div>
	);
}
