import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FileCodeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from '~/components/Link';
import { BuildBadge, useBuildWatch } from '~/components/admin/BuildStatus';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { DatePicker } from '~/components/admin/DatePicker';
import { EditorToolbar, PostBody, usePostEditor } from '~/components/admin/PostEditor';
import { AdminHeader, ControlsRail } from '~/components/admin/AdminHeader';
import { keepsMarkdown } from '~/components/admin/post-schema';
import { LATEST, VersionSelect } from '~/components/admin/VersionSelect';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import { Toggle } from '~/components/ui/toggle';
import { deletePost, getPost, getPostVersions, savePost } from '~/lib/admin/api';
import { rawUrl, SLUG_PATTERN, WRITING_DIR } from '~/lib/admin/config';
import { preparePostImage, type Prepared } from '~/lib/admin/files';
import { joinPost, type PostFields, readFields, splitPost } from '~/lib/admin/frontmatter';
import { requireAdmin } from '~/lib/admin/guard';
import { today } from '~/lib/admin/time';
import { clearUnsaved, readUnsaved, writeUnsaved } from '~/lib/admin/unsaved';
import { cn } from '~/lib/utils';

// One post: its fields, its body in the visual editor, its versions, and
// Publish. /admin/writing/new starts a post.
export const Route = createFileRoute('/admin/writing/$slug')({
	// built: the commit just published, whose build the page follows
	validateSearch: (search: Record<string, unknown>): { built?: string } =>
		typeof search.built === 'string' ? { built: search.built } : {},
	beforeLoad: requireAdmin,
	loader: async ({ params }) => {
		// new, or an address no post could have
		if (!SLUG_PATTERN.test(params.slug)) return { post: null, versions: [] };
		const [post, versions] = await Promise.all([
			getPost({ data: { slug: params.slug } }),
			getPostVersions({ data: { slug: params.slug } })
		]);
		return { post, versions };
	},
	component: PostPage
});

function PostPage() {
	const { slug } = Route.useParams();
	const { post, versions } = Route.useLoaderData();
	if (slug !== 'new' && !post) {
		return (
			<div className="mx-auto max-w-4xl">
				<Path slug={slug} title="not found" />
				<p className="mt-16 text-foreground/60 sm:mt-24">There is no post called {slug}.</p>
			</div>
		);
	}
	// a fresh editor for each version of the file on GitHub
	return <PostForm key={`${slug}:${post?.sha}`} slug={slug} post={post} versions={versions} />;
}

function Path({ slug, title }: { slug: string; title: string }) {
	return (
		<AdminHeader
			path={[
				<Link key="rafe" href="/">
					rafe
				</Link>,
				<Link key="admin" href="/admin">
					admin
				</Link>,
				<Link key="writing" href="/admin/writing">
					writing
				</Link>,
				title || (slug === 'new' ? 'new post' : slug)
			]}
		/>
	);
}

type Loaded = NonNullable<ReturnType<typeof Route.useLoaderData>['post']>;
// version: the older version being edited, if any, so a restore still brings
// back its images after a reload
type Draft = { yaml: string; fields: PostFields; body: string; slug: string; version?: string };

const NEW_FIELDS: PostFields = {
	title: '',
	description: '',
	date: '',
	updated: '',
	draft: true,
	image: '',
	imageAlt: ''
};

function fromSource(source: string, slug: string): Draft {
	const { yaml, body } = splitPost(source);
	return { yaml, fields: readFields(yaml), body, slug };
}

// "Hello, World!" -> hello-world
function toSlug(title: string) {
	return title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function PostForm({
	slug,
	post,
	versions
}: {
	slug: string;
	post: Loaded | null;
	versions: ReturnType<typeof Route.useLoaderData>['versions'];
}) {
	const router = useRouter();
	const { built } = Route.useSearch();
	const isNew = slug === 'new';
	const storageKey = `post:${slug}`;

	const initial = post
		? fromSource(post.source, slug)
		: { yaml: '', fields: NEW_FIELDS, body: '', slug: '' };
	const [yaml, setYaml] = useState(initial.yaml);
	const [fields, setFields] = useState(initial.fields);
	// what the editor is showing: changes only when a version or saved edits load
	const [body, setBody] = useState(initial.body);
	// what the editor holds now
	const current = useRef(initial.body);
	const [newSlug, setNewSlug] = useState('');
	const [slugTouched, setSlugTouched] = useState(false);
	const [version, setVersion] = useState(LATEST);
	const [viewRef, setViewRef] = useState(post?.ref ?? '');
	const [uploads, setUploads] = useState<Map<string, Prepared>>(new Map());
	const [dirty, setDirty] = useState(false);
	// edited by hand since the version on screen loaded; only then does showing
	// another version need a confirm
	const [edited, setEdited] = useState(false);
	const [saving, setSaving] = useState(false);
	const [confirm, setConfirm] = useState<null | 'delete' | { version: string }>(null);
	const watch = useBuildWatch();

	const postSlug = isNew ? newSlug : slug;
	// the visual editor only for bodies it can write back unchanged
	const lossless = useMemo(() => keepsMarkdown(body), [body]);
	const [asMarkdown, setAsMarkdown] = useState(false);
	const markdownMode = asMarkdown || !lossless;
	const folder = `${WRITING_DIR}/${postSlug}`;

	// a publish that brought the page here
	useEffect(() => {
		if (built) watch.start(built);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [built]);

	// edits left from last time, if they were made on this same version
	useEffect(() => {
		const saved = readUnsaved<Draft>(storageKey);
		if (!saved || saved.sha !== (post?.sha ?? null)) return;
		// browser storage is only readable once the page is running
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setDirty(true);
		setEdited(true);
		load(saved.value);
		if (saved.value.version && saved.value.version !== LATEST) {
			setVersion(saved.value.version);
			setViewRef(saved.value.version);
		}
		toast('Brought back your unsaved edits', {
			action: { label: 'Discard', onClick: discard }
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function load(draft: Draft) {
		setYaml(draft.yaml);
		setFields(draft.fields);
		setBody(draft.body);
		current.current = draft.body;
		if (isNew) setNewSlug(draft.slug);
	}

	function discard() {
		clearUnsaved(storageKey);
		load(initial);
		setVersion(LATEST);
		setViewRef(post?.ref ?? '');
		setUploads(new Map());
		setDirty(false);
		setEdited(false);
	}

	function changed(next: Partial<Draft> = {}) {
		setDirty(true);
		setEdited(true);
		writeUnsaved<Draft>(storageKey, {
			sha: post?.sha ?? null,
			value: {
				yaml,
				fields: next.fields ?? fields,
				body: current.current,
				slug: next.slug ?? newSlug,
				version
			}
		});
	}

	function setField<K extends keyof PostFields>(key: K, value: PostFields[K]) {
		const next = { ...fields, [key]: value };
		setFields(next);
		if (isNew && key === 'title' && !slugTouched) {
			const derived = toSlug(String(value));
			setNewSlug(derived);
			changed({ fields: next, slug: derived });
		} else {
			changed({ fields: next });
		}
	}

	async function showVersion(next: string) {
		try {
			const loaded = await getPost({
				data: { slug, ref: next === LATEST ? undefined : next }
			});
			if (!loaded) throw new Error('That version could not be read');
			load(fromSource(loaded.source, slug));
			setVersion(next);
			setViewRef(loaded.ref);
			// an older version on screen is a change worth publishing
			setDirty(next !== LATEST);
			setEdited(false);
			clearUnsaved(storageKey);
		} catch (error) {
			toast.error(message(error));
		}
	}

	// names in the folder or already taken by an upload, this visit
	const taken = useRef(new Set(post?.files ?? []));
	// what the editor draws for each upload; the editor asks for it as soon as
	// an image goes in, before the uploads state has caught up
	const uploadUrls = useRef(new Map<string, string>());

	async function addImages(files: File[]) {
		const paths: string[] = [];
		for (const file of files) {
			try {
				const prepared = await preparePostImage(file, (name) => taken.current.has(name));
				taken.current.add(prepared.name);
				uploadUrls.current.set(prepared.name, prepared.url);
				// added one at a time, so drops that overlap all land
				setUploads((previous) => new Map(previous).set(prepared.name, prepared));
				paths.push(prepared.name);
			} catch (error) {
				toast.error(message(error));
			}
		}
		return paths;
	}

	function resolveSrc(src: string) {
		if (!src || /^([a-z][a-z\d+.-]*:|\/)/i.test(src)) return src;
		const name = src.replace(/^\.\//, '');
		const upload = uploadUrls.current.get(name);
		if (upload) return upload;
		return postSlug ? rawUrl(`${folder}/${name}`, viewRef || undefined) : src;
	}

	const { editor, insertImages } = usePostEditor({
		markdown: body,
		resolveSrc,
		onImages: addImages,
		onChange: (markdown) => {
			current.current = markdown;
			changed();
		}
	});

	function switchMode(toMarkdown: boolean) {
		if (!toMarkdown && !keepsMarkdown(current.current)) {
			return toast.error(
				'The visual editor would lose part of this Markdown (a table or inline HTML, say)'
			);
		}
		setBody(current.current);
		setAsMarkdown(toMarkdown);
	}

	// images in the post's folder, for the link preview
	// (plus whatever the post names now, written however it is)
	const images = [
		...new Set([
			...[...(post?.files ?? []), ...uploads.keys()].filter((name) =>
				/\.(jpe?g|png|gif|webp|avif)$/i.test(name)
			),
			...(fields.image ? [fields.image] : [])
		])
	];

	async function publish() {
		const finalFields: PostFields = {
			...fields,
			// a post going out for the first time gets today's date
			date: fields.date || (fields.draft ? '' : today())
		};
		if (!finalFields.title.trim()) return toast.error('Give the post a title first');
		if (!finalFields.draft && !finalFields.description.trim()) {
			return toast.error('Add a description before publishing; it shows under the title');
		}
		if (!SLUG_PATTERN.test(postSlug)) {
			return toast.error(
				'The post address uses lowercase letters, numbers and dashes, and is not "new"'
			);
		}
		if (finalFields.updated && finalFields.updated < finalFields.date) {
			return toast.error('The updated date is before the post date');
		}
		const source = joinPost(yaml, finalFields, current.current);
		const used = [...uploads.values()].filter((upload) => source.includes(upload.name));

		setSaving(true);
		try {
			const { commit } = await savePost({
				data: {
					slug: postSlug,
					source,
					expected: post?.sha ?? null,
					uploads: used.map(({ name, base64 }) => ({ name, base64 })),
					restoreFrom: version === LATEST ? undefined : version
				}
			});
			clearUnsaved(storageKey);
			if (isNew) clearUnsaved('post:new');
			toast.success(finalFields.draft ? 'Draft saved' : 'Published');
			await router.navigate({
				to: '/admin/writing/$slug',
				params: { slug: postSlug },
				search: { built: commit },
				replace: true
			});
			await router.invalidate();
		} catch (error) {
			toast.error(message(error));
		} finally {
			setSaving(false);
		}
	}

	async function remove() {
		setSaving(true);
		try {
			await deletePost({ data: { slug, expected: post?.sha ?? null } });
			clearUnsaved(storageKey);
			toast.success('Post deleted');
			await router.navigate({ to: '/admin/writing' });
		} catch (error) {
			toast.error(message(error));
			setSaving(false);
		}
	}

	return (
		<div className="mx-auto max-w-4xl">
			<Path slug={slug} title={fields.title} />
			<ControlsRail
				status={
					<>
						<BuildBadge build={watch.build} />
						<Badge variant={fields.draft ? 'outline' : 'secondary'}>
							{fields.draft ? 'Draft' : 'Published'}
						</Badge>
						{dirty && <span>unsaved, kept in this browser</span>}
					</>
				}
			>
				{!isNew && (
					<VersionSelect
						versions={versions}
						value={version}
						disabled={saving}
						onChange={(next) => (edited ? setConfirm({ version: next }) : showVersion(next))}
					/>
				)}
				<Button onClick={publish} disabled={!dirty || saving} className="px-3.5">
					{fields.draft ? 'Save draft' : 'Publish'}
				</Button>
			</ControlsRail>

			<div className="mt-10 grid gap-10 sm:mt-12 lg:grid-cols-[minmax(0,1fr)_16rem]">
				<article className="min-w-0">
					<div>
						<Input
							aria-label="Title"
							placeholder="Title"
							value={fields.title}
							onChange={(event) => setField('title', event.target.value)}
							className="h-auto rounded-none border-0 px-0 py-0 text-4xl font-semibold tracking-tight shadow-none focus-visible:ring-0 sm:text-5xl md:text-4xl md:sm:text-5xl dark:bg-transparent"
						/>
						<Input
							aria-label="Description"
							placeholder="A line about the post"
							value={fields.description}
							onChange={(event) => setField('description', event.target.value)}
							className="mt-3 h-auto rounded-none border-0 px-0 py-0 text-lg text-foreground/60 shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
						/>
					</div>
					{/* the formatting bar rides along under the rail while the post scrolls */}
					<div className="z-10 mt-8 bg-background py-2 lg:sticky lg:top-[57px]">
						<EditorToolbar
							editor={markdownMode ? null : editor}
							onImages={insertImages}
							end={
								<Toggle
									size="sm"
									pressed={markdownMode}
									title={
										lossless
											? 'Edit the Markdown directly'
											: 'This post uses Markdown the visual editor would lose'
									}
									onPressedChange={switchMode}
								>
									<FileCodeIcon />
									Markdown
								</Toggle>
							}
						/>
					</div>
					<div className="mt-6 pb-24">
						{markdownMode ? (
							<>
								{!lossless && (
									<p className="mb-4 text-sm text-foreground/50">
										This post uses Markdown the visual editor would lose (a table or inline HTML,
										say), so it opens as Markdown.
									</p>
								)}
								<Textarea
									key={body}
									aria-label="Post body in Markdown"
									defaultValue={body}
									onChange={(event) => {
										current.current = event.target.value;
										changed();
									}}
									className="min-h-96 font-mono text-sm"
								/>
							</>
						) : (
							<PostBody editor={editor} />
						)}
					</div>
				</article>
				<aside>
					<section
						aria-labelledby="post-settings"
						className="rounded-lg border border-foreground/10 p-4 sm:p-5 lg:sticky lg:top-24"
					>
						<h2 id="post-settings" className="text-sm font-medium">
							Post settings
						</h2>
						<div className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-1">
							<Setting label="Address">
								{isNew ? (
									<div className="flex items-center gap-1 text-foreground/50">
										rafe.dev/writing/
										<Input
											aria-label="Post address"
											value={newSlug}
											onChange={(event) => {
												setSlugTouched(true);
												setNewSlug(event.target.value);
												changed({ slug: event.target.value });
											}}
											className="h-8"
										/>
									</div>
								) : (
									<p className="flex h-8 items-center text-foreground/60">
										rafe.dev/writing/{slug}
									</p>
								)}
							</Setting>
							<Setting label="Draft" hint="Drafts are saved to GitHub but stay off the site.">
								<div className="flex h-8 items-center">
									<Switch
										aria-label="Draft"
										checked={fields.draft}
										onCheckedChange={(value) => setField('draft', value)}
									/>
								</div>
							</Setting>
							<Setting label="Published">
								<DatePicker
									value={fields.date}
									onChange={(value) => setField('date', value)}
									placeholder={fields.draft ? 'Not yet' : 'Today, when published'}
									className="mx-0 w-full justify-start border border-input"
								/>
							</Setting>
							<Setting
								label="Updated"
								action={
									fields.updated && (
										<Button
											variant="ghost"
											size="xs"
											className="-my-1 text-foreground/50"
											onClick={() => setField('updated', '')}
										>
											Clear
										</Button>
									)
								}
							>
								<DatePicker
									value={fields.updated}
									onChange={(value) => setField('updated', value)}
									placeholder="Never"
									className="mx-0 w-full justify-start border border-input"
								/>
							</Setting>
							<Setting
								label="Link preview image"
								hint="Shown when the post is shared. Without one, a photo from the site is used."
								className="sm:col-span-2 lg:col-span-1"
							>
								<div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
									<Select
										items={[
											{ value: NO_IMAGE, label: 'Site photo' },
											...images.map((name) => ({ value: name, label: name }))
										]}
										value={fields.image || NO_IMAGE}
										onValueChange={(value) =>
											setField('image', value && value !== NO_IMAGE ? String(value) : '')
										}
									>
										<SelectTrigger
											className="w-full sm:w-56 lg:w-full"
											aria-label="Link preview image"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_IMAGE}>Site photo</SelectItem>
											{images.map((name) => (
												<SelectItem key={name} value={name}>
													{name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{fields.image && (
										<Input
											aria-label="Link preview alt text"
											placeholder="Describe the image"
											value={fields.imageAlt}
											onChange={(event) => setField('imageAlt', event.target.value)}
											className="h-8 flex-1"
										/>
									)}
								</div>
							</Setting>
						</div>
						{!isNew && (
							<div className="mt-5 flex justify-end border-t border-foreground/10 pt-4">
								<Button
									variant="ghost"
									size="sm"
									className="-mx-2.5 text-destructive"
									disabled={saving}
									onClick={() => setConfirm('delete')}
								>
									Delete post
								</Button>
							</div>
						)}
					</section>
				</aside>
			</div>

			<ConfirmDialog
				open={confirm === 'delete'}
				onOpenChange={(open) => !open && setConfirm(null)}
				title="Delete this post?"
				description="It comes off the site, along with its images. It stays in the version history on GitHub."
				confirm="Delete"
				destructive
				onConfirm={remove}
			/>
			<ConfirmDialog
				open={typeof confirm === 'object' && confirm !== null}
				onOpenChange={(open) => !open && setConfirm(null)}
				title="Show another version?"
				description="Your unpublished edits will be replaced by that version."
				confirm="Show it"
				onConfirm={() => {
					if (typeof confirm === 'object' && confirm) showVersion(confirm.version);
				}}
			/>
		</div>
	);
}

const NO_IMAGE = 'none';

function Setting({
	label,
	hint,
	action,
	className,
	children
}: {
	label: string;
	hint?: string;
	// beside the label, at the right
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<div className="flex items-center justify-between gap-2">
				<span className="text-foreground/50">{label}</span>
				{action}
			</div>
			{children}
			{hint && <span className="text-xs text-foreground/40">{hint}</span>}
		</div>
	);
}

function message(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong';
}
