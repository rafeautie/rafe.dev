import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileCodeIcon } from 'lucide-react';
import { Link } from '~/components/Link';
import { BuildBadge, useBuildWatch } from '~/components/admin/BuildStatus';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { EditorToolbar, PostBody, usePostEditor } from '~/components/admin/PostEditor';
import { PreviewCard, StatusCard, VersionsCard } from '~/components/admin/PostPanels';
import { AdminHeader, ControlsRail, ProblemBadge } from '~/components/admin/AdminHeader';
import { keepsMarkdown } from '~/components/admin/post-schema';
import { LATEST } from '~/components/admin/VersionSelect';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Toggle } from '~/components/ui/toggle';
import { deletePost, getPost, getPostVersions, savePost } from '~/lib/admin/api';
import { rawUrl, SLUG_PATTERN, WRITING_DIR } from '~/lib/admin/config';
import { preparePostImage, type Prepared } from '~/lib/admin/files';
import { joinPost, type PostFields, readFields, splitPost } from '~/lib/admin/frontmatter';
import { errorMessage } from '~/lib/admin/format';
import { requireAdmin } from '~/lib/admin/guard';
import { postStats } from '~/lib/admin/post-stats';
import { today } from '~/lib/admin/time';
import { clearUnsaved, readUnsaved, writeUnsaved } from '~/lib/admin/unsaved';

// One post: its body in the visual editor, the widest thing on the page, with
// cards beside it for its status, its link preview and its versions, and
// Publish in the rail. /admin/writing/new starts a post.
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
	const [confirm, setConfirm] = useState<null | 'delete' | 'discard' | { version: string }>(null);
	const watch = useBuildWatch();
	// what last went wrong, shown in the rail until dismissed or the next publish
	const [problem, setProblem] = useState<string | null>(null);

	const postSlug = isNew ? newSlug : slug;
	// the visual editor only for bodies it can write back unchanged
	const lossless = useMemo(() => keepsMarkdown(body), [body]);
	const [asMarkdown, setAsMarkdown] = useState(false);
	const markdownMode = asMarkdown || !lossless;
	const folder = `${WRITING_DIR}/${postSlug}`;
	// the body's length and missing alt text, recounted shortly after typing
	// stops rather than on every keystroke
	const [stats, setStats] = useState(() => postStats(initial.body));
	const recountTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	function recount() {
		clearTimeout(recountTimer.current);
		recountTimer.current = setTimeout(() => setStats(postStats(current.current)), 400);
	}
	useEffect(() => () => clearTimeout(recountTimer.current), []);

	// a publish that brought the page here
	useEffect(() => {
		if (built) watch.start(built);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [built]);

	function load(draft: Draft) {
		setYaml(draft.yaml);
		setFields(draft.fields);
		setBody(draft.body);
		current.current = draft.body;
		setStats(postStats(draft.body));
		if (isNew) setNewSlug(draft.slug);
	}

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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function discard() {
		clearUnsaved(storageKey);
		load(initial);
		setVersion(LATEST);
		setViewRef(post?.ref ?? '');
		setUploads(new Map());
		setDirty(false);
		setEdited(false);
		setSlugTouched(false);
		setProblem(null);
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
			setProblem(null);
			clearUnsaved(storageKey);
		} catch (error) {
			setProblem(errorMessage(error));
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
				setProblem(errorMessage(error));
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
			recount();
			changed();
		}
	});

	function switchMode(toMarkdown: boolean) {
		if (!toMarkdown && !keepsMarkdown(current.current)) {
			return setProblem(
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
		setProblem(null);
		const finalFields: PostFields = {
			...fields,
			// a post going out for the first time gets today's date
			date: fields.date || (fields.draft ? '' : today())
		};
		if (!finalFields.title.trim()) return setProblem('Give the post a title first');
		if (!finalFields.draft && !finalFields.description.trim()) {
			return setProblem('Add a description before publishing; it shows under the title');
		}
		if (!SLUG_PATTERN.test(postSlug)) {
			return setProblem(
				'The post address uses lowercase letters, numbers and dashes, and is not "new"'
			);
		}
		if (finalFields.updated && finalFields.updated < finalFields.date) {
			return setProblem('The updated date is before the post date');
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
			await router.navigate({
				to: '/admin/writing/$slug',
				params: { slug: postSlug },
				search: { built: commit },
				replace: true
			});
			await router.invalidate();
		} catch (error) {
			setProblem(errorMessage(error));
		} finally {
			setSaving(false);
		}
	}

	async function remove() {
		setProblem(null);
		setSaving(true);
		try {
			await deletePost({ data: { slug, expected: post?.sha ?? null } });
			clearUnsaved(storageKey);
			await router.navigate({ to: '/admin/writing' });
		} catch (error) {
			setProblem(errorMessage(error));
			setSaving(false);
		}
	}

	return (
		// a container, so the cards move beside the post by the room the page
		// has, whether the admin sidebar is open or folded
		<div className="@container mx-auto max-w-6xl">
			<Path slug={slug} title={fields.title} />
			<ControlsRail
				status={
					<>
						<BuildBadge build={watch.build} />
						<Badge variant={fields.draft ? 'outline' : 'secondary'}>
							{fields.draft ? 'Draft' : 'Published'}
						</Badge>
						{version !== LATEST && <span>an older version</span>}
						{dirty && <span>unsaved, kept in this browser</span>}
						<ProblemBadge text={problem} onDismiss={() => setProblem(null)} />
					</>
				}
			>
				{dirty && (
					<Button variant="ghost" disabled={saving} onClick={() => setConfirm('discard')}>
						Discard
					</Button>
				)}
				<Button onClick={publish} disabled={!dirty || saving} className="px-3.5">
					{fields.draft ? 'Save draft' : 'Publish'}
				</Button>
			</ControlsRail>

			<div className="mt-8 grid gap-8 sm:mt-10 @4xl:grid-cols-[minmax(0,1fr)_17rem] @4xl:gap-10 @5xl:grid-cols-[minmax(0,1fr)_19rem]">
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
					<div className="mt-6 pb-16 @4xl:pb-24">
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
										recount();
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
				{/* under the post on narrow screens, two abreast where they fit */}
				<aside className="grid content-start items-start gap-4 @xl:grid-cols-2 @4xl:grid-cols-1">
					<StatusCard
						fields={fields}
						setField={setField}
						slug={isNew ? null : slug}
						stats={stats}
						busy={saving}
						onDelete={isNew ? undefined : () => setConfirm('delete')}
						address={
							isNew && (
								<div className="flex flex-col gap-1.5 py-1">
									<span className="text-foreground/50">address</span>
									<div className="flex min-w-0 items-center gap-1 text-foreground/50">
										<span className="shrink-0">/writing/</span>
										<Input
											aria-label="Post address"
											value={newSlug}
											onChange={(event) => {
												setSlugTouched(true);
												setNewSlug(event.target.value);
												changed({ slug: event.target.value });
											}}
											className="h-8 min-w-0"
										/>
									</div>
								</div>
							)
						}
					/>
					<PreviewCard
						fields={fields}
						setField={setField}
						images={images}
						imageSrc={
							uploads.get(fields.image)?.url ??
							rawUrl(`${folder}/${fields.image}`, viewRef || undefined)
						}
					/>
					{!isNew && versions.length > 0 && (
						<VersionsCard
							versions={versions}
							value={version}
							disabled={saving}
							onChange={(next) => (edited ? setConfirm({ version: next }) : showVersion(next))}
						/>
					)}
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
				open={confirm === 'discard'}
				onOpenChange={(open) => !open && setConfirm(null)}
				title="Discard your changes?"
				description="The post goes back to how it is on GitHub, and the copy kept in this browser is deleted."
				confirm="Discard"
				destructive
				onConfirm={discard}
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
