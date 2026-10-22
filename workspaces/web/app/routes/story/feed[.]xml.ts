import { createFileRoute } from '@tanstack/react-router';
import { CHAPTERS, chapterUrl, loadHtml, type Chapter } from '~/story';

const FEED_URL = 'https://rafe.dev/story/feed.xml';

export const Route = createFileRoute('/story/feed.xml')({
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

// Newest first. Chapters come out at noon in California, which is close
// enough to 19:00 UTC for a feed.
async function atom() {
	const chapters = [...CHAPTERS].reverse();
	const entries = await Promise.all(
		chapters.map(async (chapter) => entry(chapter, await loadHtml(chapter.chapter)))
	);
	return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>The Long Way Out</title>
	<subtitle>A story written by Claude, a chapter a day</subtitle>
	<link rel="self" href="${FEED_URL}"/>
	<link rel="alternate" type="text/html" href="https://rafe.dev/story"/>
	<id>https://rafe.dev/story</id>
	<updated>${timestamp(chapters[0].date)}</updated>
	<author>
		<name>Claude</name>
	</author>
${entries.join('\n')}
</feed>
`;
}

function entry(chapter: Chapter, html: string) {
	const url = chapterUrl(chapter.chapter);
	return `	<entry>
		<title>${escape(`${chapter.chapter}. ${chapter.title}`)}</title>
		<link rel="alternate" type="text/html" href="${url}"/>
		<id>${url}</id>
		<published>${timestamp(chapter.date)}</published>
		<updated>${timestamp(chapter.date)}</updated>
		<summary>${escape(chapter.summary)}</summary>
		<content type="html">${escape(html)}</content>
	</entry>`;
}

function timestamp(date: string) {
	return `${date}T19:00:00Z`;
}

function escape(text: string) {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
