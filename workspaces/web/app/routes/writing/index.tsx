import { createFileRoute } from '@tanstack/react-router';
import { RssIcon } from 'lucide-react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';
import { absoluteUrl } from '~/photos';
import { DEFAULT_IMAGE, formatDate, POSTS } from '~/writing';

const DESCRIPTION = 'Long-form writing by Rafe Autie on building software.';

export const Route = createFileRoute('/writing/')({
	head: () => ({
		meta: [
			{ title: 'Writing | Rafe Autie' },
			{ name: 'description', content: DESCRIPTION },
			{ property: 'og:type', content: 'website' },
			{ property: 'og:url', content: 'https://rafe.dev/writing' },
			{ property: 'og:title', content: 'Writing | Rafe Autie' },
			{ property: 'og:description', content: DESCRIPTION },
			{ property: 'og:image', content: absoluteUrl(DEFAULT_IMAGE.src) },
			{ property: 'twitter:card', content: 'summary_large_image' },
			{ property: 'twitter:url', content: 'https://rafe.dev/writing' },
			{ property: 'twitter:title', content: 'Writing | Rafe Autie' },
			{ property: 'twitter:description', content: DESCRIPTION },
			{ property: 'twitter:image', content: absoluteUrl(DEFAULT_IMAGE.src) }
		],
		links: [{ rel: 'canonical', href: 'https://rafe.dev/writing' }]
	}),
	component: WritingPage
});

function WritingPage() {
	return (
		<div className="px-6 py-8 text-base text-foreground sm:px-8">
			<div className="mx-auto max-w-2xl">
				<div className="flex items-center justify-between gap-4">
					<SlashNav className="text-xl font-medium">
						<Link href="/">rafe</Link>
						writing
					</SlashNav>
					<div className="flex items-center gap-5">
						<Link href="/writing/feed.xml" className="inline-flex items-center gap-1.5 text-sm">
							<RssIcon className="size-4" />
							Feed
						</Link>
						<ThemeToggle />
					</div>
				</div>
				{POSTS.length ? (
					<ol className="mt-16 flex flex-col gap-12 sm:mt-24">
						{POSTS.map((post) => (
							<li key={post.slug}>
								{/* a whole entry is far wider than a nav link, so the same scale reads larger */}
								<Link href={`/writing/${post.slug}`} className="block hover:scale-[1.004]">
									<article>
										<time dateTime={post.date} className="text-sm text-foreground/50">
											{formatDate(post.date)}
										</time>
										<h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">
											{post.title}
										</h2>
										<p className="mt-2 text-pretty text-foreground/60">{post.description}</p>
									</article>
								</Link>
							</li>
						))}
					</ol>
				) : (
					<p className="mt-16 text-foreground/60 sm:mt-24">Nothing here yet.</p>
				)}
			</div>
		</div>
	);
}
