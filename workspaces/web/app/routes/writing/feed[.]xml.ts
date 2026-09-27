import { createFileRoute } from '@tanstack/react-router';
import { loadHtml, POSTS, type Post } from '~/writing';

const FEED_URL = 'https://rafe.dev/writing/feed.xml';

export const Route = createFileRoute('/writing/feed.xml')({
	server: {
		handlers: {
			GET: async () =>
				new Response(await atom(), {
					headers: {
						'Content-Type': 'application/atom+xml; charset=utf-8',
						'Cache-Control': 'public, max-age=3600'
					}
				})
		}
	}
});

async function atom() {
	const entries = await Promise.all(POSTS.map(async (post) => entry(post, await loadHtml(post))));
	// Atom requires an updated time even with nothing in the feed.
	const updated = POSTS[0] ? timestamp(POSTS[0].date) : new Date().toISOString();
	return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Rafe Autie</title>
	<subtitle>Writing on building software</subtitle>
	<link rel="self" href="${FEED_URL}"/>
	<link rel="alternate" type="text/html" href="https://rafe.dev/writing"/>
	<id>https://rafe.dev/writing</id>
	<updated>${updated}</updated>
	<author>
		<name>Rafe Autie</name>
		<uri>https://rafe.dev</uri>
	</author>
${entries.join('\n')}
</feed>
`;
}

function entry(post: Post, html: string) {
	return `	<entry>
		<title>${escape(post.title)}</title>
		<link rel="alternate" type="text/html" href="${post.url}"/>
		<id>${post.url}</id>
		<published>${timestamp(post.date)}</published>
		<updated>${timestamp(post.date)}</updated>
		<summary>${escape(post.description)}</summary>
		<content type="html">${escape(absolutize(stripAnchors(html), post.url))}</content>
	</entry>`;
}

// Heading anchors show on hover on the site; a reader would print a bare #.
function stripAnchors(html: string) {
	return html.replace(/<a class="anchor"[^>]*>#<\/a>/g, '');
}

function timestamp(date: string) {
	return `${date}T00:00:00Z`;
}

// Readers resolve a post's relative URLs against the feed, if at all.
function absolutize(html: string, base: string) {
	return html.replace(/\b(src|href|srcset)="([^"]*)"/g, (_, attr: string, value: string) => {
		const candidates = attr === 'srcset' ? value.split(', ') : [value];
		const urls = candidates.map((candidate) =>
			candidate.replace(/^\S+/, (url) => new URL(url, base).href)
		);
		return `${attr}="${urls.join(', ')}"`;
	});
}

function escape(text: string) {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
