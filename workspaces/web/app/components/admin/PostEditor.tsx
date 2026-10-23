import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
	BoldIcon,
	CodeIcon,
	Heading2Icon,
	Heading3Icon,
	ImagePlusIcon,
	ItalicIcon,
	LinkIcon,
	ListIcon,
	ListOrderedIcon,
	MinusIcon,
	Redo2Icon,
	SquareCodeIcon,
	StrikethroughIcon,
	TextQuoteIcon,
	Undo2Icon
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Toggle } from '~/components/ui/toggle';
import { postExtensions } from './post-schema';

// The visual editor for a post's body. It shows the post styled as /writing
// shows it, and reads and writes the same Markdown the file holds. The page
// puts the body (PostBody) in the article with the formatting bar
// (EditorToolbar) above it.

export function usePostEditor({
	markdown,
	onChange,
	resolveSrc,
	onImages
}: {
	// the body to show; replacing it (another version) resets the editor
	markdown: string;
	onChange: (markdown: string) => void;
	resolveSrc: (src: string) => string;
	// files dropped, pasted or picked: returns the relative paths to insert
	onImages: (files: File[]) => Promise<string[]>;
}) {
	// the editor is built once, so it reaches the latest callbacks through refs
	const resolver = useRef(resolveSrc);
	const imagesHandler = useRef(onImages);
	const changeHandler = useRef(onChange);
	useLayoutEffect(() => {
		resolver.current = resolveSrc;
		imagesHandler.current = onImages;
		changeHandler.current = onChange;
	});

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			// read only when an image is drawn, never during render
			// eslint-disable-next-line react-hooks/refs
			...postExtensions(resolver),
			Markdown,
			Placeholder.configure({ placeholder: 'Write something' })
		],
		content: markdown,
		contentType: 'markdown',
		editorProps: {
			attributes: {
				class: 'post prose max-w-none prose-neutral sm:prose-lg min-h-64 focus:outline-none'
			},
			handleDrop: (view, event, _slice, moved) => {
				const files = imageFiles(event.dataTransfer);
				if (moved || !files.length) return false;
				event.preventDefault();
				const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
				insertImages(files, at);
				return true;
			},
			handlePaste: (_view, event) => {
				const files = imageFiles(event.clipboardData);
				if (!files.length) return false;
				event.preventDefault();
				insertImages(files);
				return true;
			}
		},
		onUpdate: ({ editor }) => changeHandler.current(editor.getMarkdown())
	});

	async function insertImages(files: File[], at?: number) {
		if (!editor) return;
		const paths = await imagesHandler.current(files);
		const nodes = paths.map((src) => ({ type: 'image', attrs: { src, alt: '' } }));
		if (!nodes.length) return;
		if (at === undefined) editor.chain().focus().insertContent(nodes).run();
		else editor.chain().focus().insertContentAt(at, nodes).run();
	}

	// another version picked, or edits made as Markdown: show them
	useEffect(() => {
		if (!editor || editor.getMarkdown() === markdown) return;
		editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
	}, [editor, markdown]);

	return { editor, insertImages };
}

export function PostBody({ editor }: { editor: Editor | null }) {
	return <EditorContent editor={editor} />;
}

function imageFiles(data: DataTransfer | null) {
	return [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/'));
}

// The formatting bar: text styles, lists and blocks, images, undo. `end` sits
// at its right edge (the Markdown switch).
export function EditorToolbar({
	editor,
	onImages,
	end
}: {
	editor: Editor | null;
	onImages: (files: File[]) => void;
	end?: ReactNode;
}) {
	const state = useEditorState({
		editor,
		selector: ({ editor }) =>
			editor && {
				h2: editor.isActive('heading', { level: 2 }),
				h3: editor.isActive('heading', { level: 3 }),
				bold: editor.isActive('bold'),
				italic: editor.isActive('italic'),
				strike: editor.isActive('strike'),
				code: editor.isActive('code'),
				link: editor.isActive('link'),
				href: String(editor.getAttributes('link').href ?? ''),
				bullet: editor.isActive('bulletList'),
				ordered: editor.isActive('orderedList'),
				quote: editor.isActive('blockquote'),
				codeBlock: editor.isActive('codeBlock'),
				canUndo: editor.can().undo(),
				canRedo: editor.can().redo()
			}
	});
	const picker = useRef<HTMLInputElement>(null);
	const chain = () => editor!.chain().focus();

	const tool = (label: string, icon: ReactNode, pressed: boolean | undefined, run: () => void) => (
		<Toggle
			key={label}
			size="sm"
			aria-label={label}
			title={label}
			pressed={Boolean(pressed)}
			disabled={!editor}
			onPressedChange={run}
		>
			{icon}
		</Toggle>
	);

	return (
		<div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background p-1 shadow-xs">
			<div className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto [&>*]:shrink-0">
				{editor ? (
					<>
						{tool('Heading', <Heading2Icon />, state?.h2, () =>
							chain().toggleHeading({ level: 2 }).run()
						)}
						{tool('Subheading', <Heading3Icon />, state?.h3, () =>
							chain().toggleHeading({ level: 3 }).run()
						)}
						<Divider />
						{tool('Bold', <BoldIcon />, state?.bold, () => chain().toggleBold().run())}
						{tool('Italic', <ItalicIcon />, state?.italic, () => chain().toggleItalic().run())}
						{tool('Strikethrough', <StrikethroughIcon />, state?.strike, () =>
							chain().toggleStrike().run()
						)}
						{tool('Inline code', <CodeIcon />, state?.code, () => chain().toggleCode().run())}
						<LinkButton editor={editor} active={Boolean(state?.link)} href={state?.href ?? ''} />
						<Divider />
						{tool('Bulleted list', <ListIcon />, state?.bullet, () =>
							chain().toggleBulletList().run()
						)}
						{tool('Numbered list', <ListOrderedIcon />, state?.ordered, () =>
							chain().toggleOrderedList().run()
						)}
						{tool('Quote', <TextQuoteIcon />, state?.quote, () => chain().toggleBlockquote().run())}
						{tool('Code block', <SquareCodeIcon />, state?.codeBlock, () =>
							chain().toggleCodeBlock().run()
						)}
						{tool('Divider line', <MinusIcon />, false, () => chain().setHorizontalRule().run())}
						<input
							ref={picker}
							type="file"
							accept="image/*"
							multiple
							hidden
							onChange={(event) => {
								const files = [...(event.target.files ?? [])];
								event.target.value = '';
								if (files.length) onImages(files);
							}}
						/>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Add image"
							title="Add image"
							onClick={() => picker.current?.click()}
						>
							<ImagePlusIcon />
						</Button>
						<Divider />
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Undo"
							title="Undo"
							disabled={!state?.canUndo}
							onClick={() => chain().undo().run()}
						>
							<Undo2Icon />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Redo"
							title="Redo"
							disabled={!state?.canRedo}
							onClick={() => chain().redo().run()}
						>
							<Redo2Icon />
						</Button>
					</>
				) : (
					<span className="px-1.5 text-sm text-foreground/50">Editing as Markdown</span>
				)}
			</div>
			{end && <div className="shrink-0">{end}</div>}
		</div>
	);
}

function Divider() {
	return <span aria-hidden className="mx-1 h-5 w-px bg-foreground/10" />;
}

function LinkButton({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState('');

	function apply() {
		const url = value.trim();
		const chain = editor.chain().focus().extendMarkRange('link');
		(url ? chain.setLink({ href: url }) : chain.unsetLink()).run();
		setOpen(false);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (next) setValue(href);
				setOpen(next);
			}}
		>
			<PopoverTrigger render={<Toggle size="sm" aria-label="Link" title="Link" pressed={active} />}>
				<LinkIcon />
			</PopoverTrigger>
			<PopoverContent className="w-72" side="bottom" align="center">
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						apply();
					}}
				>
					<Input
						autoFocus
						type="url"
						placeholder="https://"
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
					<Button type="submit" size="default">
						{value.trim() ? 'Link' : 'Remove'}
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	);
}
