import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Link } from '~/components/Link';
import { AdminHeader } from '~/components/admin/AdminHeader';
import { BuildLine, useBuildWatch } from '~/components/admin/BuildStatus';
import { ConfirmDialog } from '~/components/admin/ConfirmDialog';
import { DatePicker } from '~/components/admin/DatePicker';
import { PostEditor } from '~/components/admin/PostEditor';
import { LATEST, VersionSelect } from '~/components/admin/VersionSelect';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
import { deletePost, getPost, getPostVersions, savePost } from '~/lib/admin/api';
import { rawUrl, SLUG_PATTERN, WRITING_DIR } from '~/lib/admin/config';
import { preparePostImage, type Prepared } from '~/lib/admin/files';
import { joinPost, type PostFields, readFields, splitPost } from '~/lib/admin/frontmatter';
import { requireAdmin } from '~/lib/admin/guard';
import { today } from '~/lib/admin/time';
import { clearUnsaved, readUnsaved, writeUnsaved } from '~/lib/admin/unsaved';

// One post: its fields, its body in the visual editor, its versions, and
// Publish. /admin/writing/new starts a post.
export const Route = createFileRoute('/admin/writing/$slug')({
	// built: the commit just published, whose build the page follows
	validateSearch: (search: Record<string, unknown>): { built?: string } =>
		typeof search.built === 'string' ? { built: search.built } : {},
	beforeLoad: requireAdmin,
	loader: async ({ params }) => {
		if (params.slug === 'new') return { post: null, versions: [] };
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
			<div className="mx-auto max-w-2xl">
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
type Draft = { yaml: string; fields: PostFields; body: string; slug: string };

const NEW_FIELDS: PostFields = { title: '', description: '', date: '', updated: '', draft: true };

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
	const [saving, setSaving] = useState(false);
	const [confirm, setConfirm] = useState<null | 'delete' | { version: string }>(null);
	const watch = useBuildWatch();

	const postSlug = isNew ? newSlug : slug;
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
		load(saved.value);
		setDirty(true);
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
	}

	function changed(next: Partial<Draft> = {}) {
		setDirty(true);
		writeUnsaved<Draft>(storageKey, {
			sha: post?.sha ?? null,
			value: {
				yaml,
				fields: next.fields ?? fields,
				body: current.current,
				slug: next.slug ?? newSlug
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
			clearUnsaved(storageKey);
		} catch (error) {
			toast.error(message(error));
		}
	}

	const existing = new Set([...(post?.files ?? []), ...uploads.keys()]);

	async function addImages(files: File[]) {
		const paths: string[] = [];
		const added = new Map(uploads);
		for (const file of files) {
			try {
				const prepared = await preparePostImage(file, (name) => existing.has(name) || added.has(name));
				added.set(prepared.name, prepared);
				paths.push(prepared.name);
			} catch (error) {
				toast.error(message(error));
			}
		}
		setUploads(added);
		return paths;
	}

	function resolveSrc(src: string) {
		if (!src || /^([a-z][a-z\d+.-]*:|\/)/i.test(src)) return src;
		const name = src.replace(/^\.\//, '');
		const upload = uploads.get(name);
		if (upload) return upload.url;
		return postSlug ? rawUrl(`${folder}/${name}`, viewRef || undefined) : src;
	}

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
			return toast.error('The post address uses lowercase letters, numbers and dashes');
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
		<div className="mx-auto max-w-2xl">
			<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
				<div className="min-w-0 flex-1">
					<Path slug={slug} title={fields.title} />
				</div>
				<div className="flex flex-col items-end gap-1.5">
					<div className="flex items-center gap-3">
						{!isNew && (
							<VersionSelect
								versions={versions}
								value={version}
								disabled={saving}
								onChange={(next) => (dirty ? setConfirm({ version: next }) : showVersion(next))}
							/>
						)}
						<Button onClick={publish} disabled={!dirty || saving} className="px-3.5">
							{fields.draft ? 'Save draft' : 'Publish'}
						</Button>
					</div>
					<BuildLine
						build={watch.build}
						liveHref={fields.draft ? undefined : `/writing/${postSlug}`}
					/>
				</div>
			</div>

			<div className="mt-16 sm:mt-24">
				<Input
					aria-label="Title"
					placeholder="Title"
					value={fields.title}
					onChange={(event) => setField('title', event.target.value)}
					className="h-auto rounded-none border-0 px-0 py-0 text-4xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-4xl sm:text-5xl md:sm:text-5xl dark:bg-transparent"
				/>
				<div className="mt-3 flex flex-wrap items-center gap-x-3 text-sm">
					<DatePicker
						value={fields.date}
						onChange={(value) => setField('date', value)}
						placeholder={fields.draft ? 'No date yet' : 'Today'}
					/>
					{fields.date && (
						<DatePicker
							value={fields.updated}
							onChange={(value) => setField('updated', value)}
							placeholder="Add an updated date"
						/>
					)}
				</div>
				<Input
					aria-label="Description"
					placeholder="A line about the post"
					value={fields.description}
					onChange={(event) => setField('description', event.target.value)}
					className="mt-3 h-auto rounded-none border-0 px-0 py-0 text-lg text-foreground/60 shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
				/>
				<div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-foreground/60">
					<Label className="font-normal">
						<Switch checked={fields.draft} onCheckedChange={(value) => setField('draft', value)} />
						Draft
					</Label>
					{isNew && (
						<Label className="font-normal">
							rafe.dev/writing/
							<Input
								aria-label="Post address"
								value={newSlug}
								onChange={(event) => {
									setSlugTouched(true);
									setNewSlug(event.target.value);
									changed({ slug: event.target.value });
								}}
								className="h-7 w-48"
							/>
						</Label>
					)}
				</div>
			</div>

			<div className="mt-10 border-t border-foreground/10 pt-10">
				<PostEditor
					markdown={body}
					resolveSrc={resolveSrc}
					onImages={addImages}
					onChange={(markdown) => {
						current.current = markdown;
						changed();
					}}
				/>
			</div>

			<footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/10 pt-6 text-sm text-foreground/50">
				<p>
					{fields.draft ? 'Draft' : 'Published'}
					{dirty && ' · unsaved edits are kept in this browser'}
				</p>
				{!isNew && (
					<Button
						variant="ghost"
						size="sm"
						className="-mx-2.5 text-destructive"
						disabled={saving}
						onClick={() => setConfirm('delete')}
					>
						Delete post
					</Button>
				)}
			</footer>

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

function message(error: unknown) {
	return error instanceof Error ? error.message : 'Something went wrong';
}
