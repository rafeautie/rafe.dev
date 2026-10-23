import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { BoldIcon, Heading2Icon, ImagePlusIcon, ItalicIcon, LinkIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Toggle } from '~/components/ui/toggle';
import { postExtensions } from './post-schema';

// The visual editor for a post's body. It shows the post styled as /writing
// shows it, and reads and writes the same Markdown the file holds.

export function PostEditor({
	markdown,
	onChange,
	resolveSrc,
	onImages
}: {
	// the body to show; replacing it (another version) resets the editor
	markdown: string;
	onChange: (markdown: string) => void;
	resolveSrc: (src: string) => string;
	// files dropped or pasted in: returns the relative paths to insert
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

	// another version picked: show it
	useEffect(() => {
		if (!editor || editor.getMarkdown() === markdown) return;
		editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
	}, [editor, markdown]);

	const picker = useRef<HTMLInputElement>(null);

	return (
		<>
			{editor && <FormattingBar editor={editor} />}
			<EditorContent editor={editor} />
			<div className="mt-8">
				<input
					ref={picker}
					type="file"
					accept="image/*"
					multiple
					hidden
					onChange={(event) => {
						const files = [...(event.target.files ?? [])];
						event.target.value = '';
						if (files.length) insertImages(files);
					}}
				/>
				<Button
					variant="ghost"
					size="sm"
					className="-mx-2.5 text-foreground/50"
					onClick={() => picker.current?.click()}
				>
					<ImagePlusIcon />
					add image
				</Button>
			</div>
		</>
	);
}

function imageFiles(data: DataTransfer | null) {
	return [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/'));
}

// Over selected text: bold, italic, heading and link.
function FormattingBar({ editor }: { editor: Editor }) {
	const state = useEditorState({
		editor,
		selector: ({ editor }) => ({
			bold: editor.isActive('bold'),
			italic: editor.isActive('italic'),
			heading: editor.isActive('heading', { level: 2 }),
			link: editor.isActive('link'),
			href: String(editor.getAttributes('link').href ?? '')
		})
	});

	return (
		<BubbleMenu
			editor={editor}
			options={{ placement: 'top', offset: 8 }}
			className="flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
		>
			<Toggle
				size="sm"
				aria-label="Bold"
				pressed={state.bold}
				onPressedChange={() => editor.chain().focus().toggleBold().run()}
			>
				<BoldIcon />
			</Toggle>
			<Toggle
				size="sm"
				aria-label="Italic"
				pressed={state.italic}
				onPressedChange={() => editor.chain().focus().toggleItalic().run()}
			>
				<ItalicIcon />
			</Toggle>
			<Toggle
				size="sm"
				aria-label="Heading"
				pressed={state.heading}
				onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
			>
				<Heading2Icon />
			</Toggle>
			<LinkButton editor={editor} active={state.link} href={state.href} />
		</BubbleMenu>
	);
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
			<PopoverTrigger render={<Toggle size="sm" aria-label="Link" pressed={active} />}>
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
