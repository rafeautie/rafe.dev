import { createFileRoute } from '@tanstack/react-router';
import { lastModified, POSTS } from '~/writing';

// Every indexable page. A new top-level route belongs here too.
const PAGES = ['/', '/development', '/photography', '/shmoney', '/writing'];

export const Route = createFileRoute('/sitemap.xml')({
	server: {
		handlers: {
			GET: () =>
				new Response(sitemap(), {
					headers: {
						'Content-Type': 'application/xml; charset=utf-8',
						'Cache-Control': 'public, max-age=3600'
					}
				})
		}
	}
});

function sitemap() {
	const latestPost = POSTS.map(lastModified).sort().at(-1);
	const urls = [
		...PAGES.map((path) =>
			url(new URL(path, 'https://rafe.dev').href, path === '/writing' ? latestPost : undefined)
		),
		...POSTS.map((post) => url(post.url, lastModified(post)))
	];
	return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

function url(loc: string, lastmod?: string) {
	return `	<url>
		<loc>${loc}</loc>${lastmod ? `\n\t\t<lastmod>${lastmod}</lastmod>` : ''}
	</url>`;
}
