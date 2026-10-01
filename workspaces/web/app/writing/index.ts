import { getPhoto } from '~/photos';
import type { PostMeta } from '../../plugins/markdown';

// A post is app/writing/<slug>/index.md, with its images beside it. The
// frontmatter takes a title, a description, a date (yyyy-mm-dd), and optionally
// an updated date, and an image (a relative path) and imageAlt for link previews.
// plugins/markdown.ts compiles each one at build time.
export type Post = PostMeta & { slug: string; url: string };

const META = import.meta.glob<PostMeta>('./*/index.md', {
	query: '?meta',
	import: 'meta',
	eager: true
});

// lazy, so each post's body is its own chunk
const HTML = import.meta.glob<string>('./*/index.md', { import: 'html' });

// newest first
export const POSTS: Post[] = Object.entries(META)
	.map(([file, meta]) => {
		const slug = file.split('/')[1];
		return { ...meta, slug, url: `https://rafe.dev/writing/${slug}` };
	})
	.sort((a, b) => b.date.localeCompare(a.date));

export function getPost(slug: string): Post | undefined {
	return POSTS.find((post) => post.slug === slug);
}

// when a post last changed
export function lastModified(post: Post): string {
	return post.updated ?? post.date;
}

export function loadHtml(post: Post): Promise<string> {
	return HTML[`./${post.slug}/index.md`]();
}

const DEFAULT_PHOTO = getPhoto('DSCF0740.jpg');

// for posts without an image of their own
export const DEFAULT_IMAGE: NonNullable<PostMeta['image']> = {
	src: DEFAULT_PHOTO.socialImage,
	width: 1200,
	height: Math.round((1200 * DEFAULT_PHOTO.picture.img.h) / DEFAULT_PHOTO.picture.img.w),
	alt: DEFAULT_PHOTO.alt
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export function formatDate(date: string) {
	return DATE_FORMAT.format(new Date(date));
}
