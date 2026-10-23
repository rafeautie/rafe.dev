import { mergeAttributes, Node } from '@tiptap/core';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

// What a post body can hold in the visual editor, and a check for Markdown it
// would lose.

type Resolver = { current: (src: string) => string };

// Images keep the relative path the Markdown uses (half-dome.jpg); only what
// the browser draws is swapped for a URL it can load.
const PostImage = Image.extend<ImageOptions & { resolver: Resolver }>({
	addOptions() {
		return {
			...this.parent!(),
			resolver: { current: (src: string) => src }
		};
	},
	renderHTML({ HTMLAttributes }) {
		return [
			'img',
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
				src: this.options.resolver.current(String(HTMLAttributes.src ?? ''))
			})
		];
	}
});

// Raw HTML in a post (a <video>, say) is kept exactly as written: shown as a
// locked block that can be moved or deleted but not edited here. It only ever
// comes from the file, never from pasted HTML, so a paste cannot slip a script
// into a post.
const RawHtml = Node.create({
	name: 'rawHtml',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: true,
	addAttributes() {
		return { html: { default: '' } };
	},
	renderHTML({ node }) {
		const html = String(node.attrs.html);
		const tag = html.match(/^<\s*([a-z][\w-]*)/i)?.[1] ?? 'html';
		return ['div', { class: 'raw-html' }, `<${tag}> block, edit it in GitHub`];
	},
	markdownTokenName: 'html',
	parseMarkdown(token) {
		// inline HTML has no node here; keepsMarkdown sends such posts to plain Markdown
		if (!token.block) return [];
		return { type: 'rawHtml', attrs: { html: String(token.raw ?? '').trim() } };
	},
	renderMarkdown(node) {
		return String(node.attrs?.html ?? '');
	}
});

export function postExtensions(resolver?: Resolver) {
	return [
		StarterKit.configure({
			heading: { levels: [2, 3, 4] },
			link: { openOnClick: false, autolink: true }
		}),
		resolver ? PostImage.configure({ resolver }) : PostImage,
		RawHtml
	];
}

let manager: MarkdownManager | undefined;

// Whether the visual editor can show this Markdown and write it back without
// losing anything (tables, inline HTML, task lists and footnotes it cannot).
// Compared as rendered HTML, so *a* and _a_ count as the same.
export function keepsMarkdown(markdown: string) {
	manager ??= new MarkdownManager({ extensions: postExtensions() });
	const roundTrip = manager.serialize(manager.parse(markdown));
	const html = (text: string) =>
		String(manager!.instance.parse(text, { async: false }))
			.replace(/>\s+</g, '><')
			.trim();
	return html(roundTrip) === html(markdown);
}
