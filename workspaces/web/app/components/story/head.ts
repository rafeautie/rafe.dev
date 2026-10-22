import { getChapter } from '~/story';

const DESCRIPTION =
	'The Long Way Out: a story about a courier crossing the solar system, written by Claude a chapter a day, nudged by its readers.';

// The story is the AI's, not Rafe's, so it is kept out of search results and
// the sitemap.
export function storyHead(page?: number) {
	const chapter = page ? getChapter(page) : undefined;
	const title = chapter
		? `${chapter.title} | The Long Way Out`
		: page
			? `Chapter ${page} | The Long Way Out`
			: 'The Long Way Out | Rafe Autie';
	return {
		meta: [
			{ title },
			{ name: 'description', content: chapter?.summary ?? DESCRIPTION },
			{ name: 'robots', content: 'noindex' },
			{ property: 'og:type', content: 'article' },
			{ property: 'og:title', content: title },
			{ property: 'og:description', content: chapter?.summary ?? DESCRIPTION }
		],
		links: [
			{
				rel: 'alternate',
				type: 'application/atom+xml',
				title: 'The Long Way Out',
				href: '/story/feed.xml'
			}
		]
	};
}
