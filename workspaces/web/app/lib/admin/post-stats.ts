import { FENCED_CODE, type PostFields } from './frontmatter';

// What the writing list and the editor say about a post at a glance: how long
// it is, and what it still lacks before it reads well on the site and when
// shared. Plain counts from the Markdown, so the server and the browser agree.

export type PostStats = {
	words: number;
	// images in the body a screen reader could not describe
	imagesWithoutAlt: number;
};

const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const EMPTY_ALT_IMAGE = /!\[\s*\]\(/g;
// an <img> written as HTML with no alt, or an empty one
const HTML_IMAGE_WITHOUT_ALT = /<img\b(?![^>]*\balt\s*=\s*["'][^"']*\S)[^>]*>/gi;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function postStats(body: string): PostStats {
	const text = body
		// code is not prose, and image and link targets are not words
		.replace(FENCED_CODE, ' ')
		.replace(IMAGE, ' ')
		.replace(/\]\([^)]*\)/g, ']')
		.replace(/<[^>]+>/g, ' ');
	return {
		words: text.match(WORD)?.length ?? 0,
		imagesWithoutAlt:
			(body.match(EMPTY_ALT_IMAGE)?.length ?? 0) + (body.match(HTML_IMAGE_WITHOUT_ALT)?.length ?? 0)
	};
}

// About 230 words a minute, as most reading-time estimates use.
export function readingMinutes(words: number) {
	return Math.max(1, Math.round(words / 230));
}

// What is missing, in a few words each. Publishing refuses a post without a
// title or description; the rest are worth doing but do not block it.
export function postGaps(
	fields: Pick<PostFields, 'title' | 'description' | 'image' | 'imageAlt'>,
	stats: PostStats
): string[] {
	const gaps: string[] = [];
	if (!fields.title.trim()) gaps.push('no title');
	if (!fields.description.trim()) gaps.push('no description');
	if (stats.words === 0) gaps.push('nothing written');
	if (fields.image && !fields.imageAlt.trim()) gaps.push('no preview alt');
	if (stats.imagesWithoutAlt === 1) gaps.push('an image without alt');
	if (stats.imagesWithoutAlt > 1) gaps.push(`${stats.imagesWithoutAlt} images without alt`);
	return gaps;
}
