import path from 'node:path';
import rehypeShiki from '@shikijs/rehype';
import type { Element, Root } from 'hast';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import sharp from 'sharp';
import { unified } from 'unified';
import type { Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';

// Compiles Markdown with YAML frontmatter at build time, so a page ships HTML
// and never a parser or highlighter. `post.md?meta` exports the frontmatter as
// `meta`; `post.md` exports the rendered body as `html`. They are separate
// modules so listing posts does not pull in every post's body.
//
// Relative images become asset imports and get their intrinsic width and
// height, so they hold their space while loading. Rasters are re-encoded to a
// WebP srcset; SVGs and GIFs are served as they are.

// The article column in routes/writing/$slug.tsx: 42rem, less the page padding
// on narrow screens. 1440 covers it at 2x.
const IMAGE_SIZES = '(min-width: 46rem) 42rem, calc(100vw - 3rem)';
const IMAGE_WIDTHS = [720, 1440];
// What link previews render og:image at.
const SOCIAL_WIDTH = 1200;

const toHast = unified()
	.use(remarkParse)
	.use(remarkGfm)
	// Posts are trusted repo content, so inline HTML (a <video>, say) passes through.
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeSlug)
	.use(rehypeAutolinkHeadings, {
		behavior: 'append',
		// a string, as `true` stringifies to a bare aria-hidden, which does not hide
		properties: { className: ['anchor'], ariaHidden: 'true', tabIndex: -1 },
		content: { type: 'text', value: '#' }
	})
	.use(rehypeShiki, {
		// github-dark rides along as a --shiki-dark variable on each token, for
		// the /writing dark mode (styles/app.css)
		themes: { light: 'github-light', dark: 'github-dark' },
		defaultColor: 'light',
		lazy: true,
		// the site's CSS colors the block; the theme only colors the tokens
		rootStyle: false
	});

const toHtml = unified().use(rehypeStringify, { allowDangerousHtml: true });

export type PostMeta = {
	title: string;
	description: string;
	// ISO yyyy-mm-dd
	date: string;
	// ISO yyyy-mm-dd, for a post revised after it went out
	updated?: string;
	image?: { src: string; width: number; height: number; alt: string };
};

export function markdown(): Plugin {
	return {
		name: 'markdown',
		enforce: 'pre',
		async transform(source, id) {
			const [file, query = ''] = id.split('?');
			if (!file.endsWith('.md')) return;

			const dir = path.dirname(file);
			const { frontmatter, body } = splitFrontmatter(source, file);
			const assets = new Assets();
			const watch = (asset: string) => this.addWatchFile(path.resolve(dir, asset));

			if (new URLSearchParams(query).has('meta')) {
				const meta = await readMeta(frontmatter, file, assets, watch);
				return assets.module('meta', meta);
			}

			const tree = await toHast.run(toHast.parse(body));
			await Promise.all(findImages(tree).map((node) => resolveImage(node, dir, assets, watch)));
			return assets.module('html', toHtml.stringify(tree));
		}
	};
}

// Asset URLs are only known once the bundler has emitted them, so they are
// written into the output as placeholders and swapped for expressions that
// read the imported asset.
class Assets {
	private imports: string[] = [];
	private expressions: string[] = [];

	import(specifier: string): string {
		const name = `asset${this.imports.length}`;
		this.imports.push(`import ${name} from ${JSON.stringify(specifier)};`);
		return name;
	}

	placeholder(expression: string): string {
		return `__asset${this.expressions.push(expression) - 1}__`;
	}

	module(name: string, value: unknown): string {
		const json = JSON.stringify(value).replace(
			/__asset(\d+)__/g,
			(_, index) => `" + ${this.expressions[Number(index)]} + "`
		);
		return `${this.imports.join('\n')}\nexport const ${name} = ${json};\n`;
	}
}

function splitFrontmatter(source: string, file: string) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
	if (!match) throw new Error(`${file}: missing frontmatter`);
	return { frontmatter: parseYaml(match[1]) ?? {}, body: source.slice(match[0].length) };
}

async function readMeta(
	frontmatter: Record<string, unknown>,
	file: string,
	assets: Assets,
	watch: (asset: string) => void
): Promise<PostMeta> {
	const { title, description, date, updated, image, imageAlt } = frontmatter;
	for (const [key, value] of Object.entries({ title, description, date })) {
		if (typeof value !== 'string' || !value) throw new Error(`${file}: frontmatter needs ${key}`);
	}
	for (const [key, value] of Object.entries({ date, updated })) {
		if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
			throw new Error(`${file}: ${key} must be yyyy-mm-dd`);
		}
	}
	const meta: PostMeta = {
		title: title as string,
		description: description as string,
		date: date as string
	};
	if (updated !== undefined) {
		if (String(updated) < meta.date) throw new Error(`${file}: updated is before date`);
		meta.updated = String(updated);
	}
	if (typeof image === 'string') {
		const dir = path.dirname(file);
		const size = await imageSize(path.resolve(dir, image));
		const width = Math.min(size.width, SOCIAL_WIDTH);
		watch(image);
		meta.image = {
			src: assets.placeholder(assets.import(`${relative(image)}?w=${width}`)),
			width,
			height: Math.round((size.height * width) / size.width),
			alt: typeof imageAlt === 'string' ? imageAlt : meta.title
		};
	}
	return meta;
}

function findImages(node: Root | Element, found: Element[] = []): Element[] {
	for (const child of node.children) {
		if (child.type !== 'element') continue;
		if (child.tagName === 'img') found.push(child);
		findImages(child, found);
	}
	return found;
}

async function resolveImage(
	node: Element,
	dir: string,
	assets: Assets,
	watch: (asset: string) => void
) {
	const src = decodeURI(String(node.properties.src ?? ''));
	// URLs with a scheme, and root-relative paths, are left for the browser.
	if (!src || /^([a-z][a-z\d+.-]*:|\/)/i.test(src)) return;

	const size = await imageSize(path.resolve(dir, src));
	watch(src);
	node.properties.loading = 'lazy';
	node.properties.decoding = 'async';

	if (/\.(svg|gif)$/i.test(src)) {
		node.properties.src = assets.placeholder(assets.import(`${relative(src)}?url`));
		node.properties.width = size.width;
		node.properties.height = size.height;
		return;
	}

	const largest = Math.min(size.width, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);
	const widths = [...IMAGE_WIDTHS.filter((width) => width < largest), largest];
	const picture = assets.import(
		`${relative(src)}?w=${widths.join(';')}&format=webp&quality=90&as=picture`
	);
	node.properties.src = assets.placeholder(`${picture}.img.src`);
	node.properties.srcSet = assets.placeholder(`${picture}.sources.webp`);
	node.properties.sizes = IMAGE_SIZES;
	node.properties.width = largest;
	node.properties.height = Math.round((size.height * largest) / size.width);
}

async function imageSize(file: string) {
	const { width, height } = await sharp(file).metadata();
	if (!width || !height) throw new Error(`${file}: could not read image size`);
	return { width, height };
}

// Import specifiers need the ./ that Markdown lets authors leave off.
function relative(src: string) {
	return /^\.\.?\//.test(src) ? src : `./${src}`;
}
