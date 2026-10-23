import { createServerFn } from '@tanstack/react-start';
import {
	COMMIT_PREFIX,
	CONTENT_ROOT,
	PHOTOS_DIR,
	PHOTOS_MANIFEST,
	SLUG_PATTERN,
	WRITING_DIR
} from './config';
import { parse as parseYaml } from 'yaml';
import { FENCED_CODE, readFields, splitPost } from './frontmatter';
import {
	type Change,
	Conflict,
	decodeBytes,
	encodeText,
	gitHub,
	type GitHub
} from './github.server';
import { isJpeg, isNormalized } from './jpeg';
import { currentAdmin, markSignedIn, requireToken } from './session.server';

// Everything the admin pages ask of the server. Each handler checks the session
// first (requireToken), then talks to GitHub as Rafe.

export type PhotoEntry = {
	file: string;
	alt: string;
	caption: string;
	location: string;
	date: string;
};

export type PostSummary = {
	slug: string;
	title: string;
	description: string;
	date: string;
	draft: boolean;
};

export type Upload = { name: string; base64: string };

const DATE = /^(\d{4}-\d{2}-\d{2})?$/;
const PHOTO_FILE = /^[A-Za-z0-9._-]+\.jpg$/;
// no SVG: one served from rafe.dev could run script as the site
const POST_ASSET = /^[A-Za-z0-9._-]+\.(jpe?g|png|gif|webp|avif|mp4|webm)$/i;

// Conflicts reach the browser as a plain message it can show.
async function withConflicts<T>(run: () => Promise<T>) {
	try {
		return await run();
	} catch (error) {
		if (error instanceof Conflict) {
			throw new Error(`${error.message}. Reload to get the latest version, then try again.`, {
				cause: error
			});
		}
		throw error;
	}
}

// ---------------------------------------------------------------- validation

function object(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Bad request');
	return input as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
	if (typeof value !== 'string') throw new Error(`Bad request: ${name}`);
	return value;
}

function optionalString(value: unknown, name: string): string | undefined {
	return value === undefined || value === null ? undefined : string(value, name);
}

function slug(value: unknown): string {
	const text = string(value, 'slug');
	if (!SLUG_PATTERN.test(text))
		throw new Error('A post name uses lowercase letters, numbers and dashes, and is not "new"');
	return text;
}

function ref(value: unknown) {
	const text = optionalString(value, 'ref');
	if (text !== undefined && !/^[0-9a-f]{40}$/.test(text)) throw new Error('Bad request: ref');
	return text;
}

function blobSha(value: unknown, name: string): string | null {
	if (value === null) return null;
	const text = string(value, name);
	if (!/^[0-9a-f]{40}$/.test(text)) throw new Error(`Bad request: ${name}`);
	return text;
}

function uploads(value: unknown, pattern: RegExp): Upload[] {
	if (!Array.isArray(value)) throw new Error('Bad request: uploads');
	return value.map((item) => {
		const { name, base64 } = object(item);
		const upload = { name: string(name, 'upload name'), base64: string(base64, 'upload') };
		if (!pattern.test(upload.name)) throw new Error(`Cannot upload ${upload.name}`);
		return upload;
	});
}

function photoEntries(value: unknown): PhotoEntry[] {
	if (!Array.isArray(value)) throw new Error('Bad request: photos');
	const seen = new Set<string>();
	return value.map((item) => {
		const entry = object(item);
		const photo: PhotoEntry = {
			file: string(entry.file, 'file'),
			alt: string(entry.alt, 'alt'),
			caption: string(entry.caption, 'caption'),
			location: string(entry.location, 'location'),
			date: string(entry.date, 'date')
		};
		if (!PHOTO_FILE.test(photo.file)) throw new Error(`Bad photo name ${photo.file}`);
		if (!DATE.test(photo.date)) throw new Error(`Bad date for ${photo.file}`);
		if (seen.has(photo.file)) throw new Error(`${photo.file} is listed twice`);
		seen.add(photo.file);
		return photo;
	});
}

// A photo committed through the admin has to be what the pre-commit hook would
// have committed: the browser resizes and strips it, and this checks it did.
function checkPhoto(upload: Upload) {
	if (!isNormalized(decodeBytes(upload.base64))) {
		throw new Error(`${upload.name} is not a resized JPEG without metadata`);
	}
}

// Post images are re-encoded by the build, but the original is still in the
// public repo, so a JPEG must arrive without its EXIF (GPS, camera serial).
function checkPostAsset(upload: Upload) {
	const bytes = decodeBytes(upload.base64);
	if (isJpeg(bytes) && !isNormalized(bytes)) {
		throw new Error(`${upload.name} still carries camera metadata`);
	}
}

// ---------------------------------------------------------------- session

export const getAdmin = createServerFn({ method: 'GET' }).handler(async () => {
	const admin = await currentAdmin();
	// keeps the public pages' hint in step: set for a sign-in made before it
	// existed, cleared once a sign-in lapses
	markSignedIn(Boolean(admin));
	return admin ? { login: admin.login, avatarUrl: admin.avatarUrl } : null;
});

// ---------------------------------------------------------------- overview

// Where a change is edited in the admin, from the files it touched.
function changeLink(files: string[]) {
	for (const file of files) {
		const post = file.match(new RegExp(`^${WRITING_DIR}/([^/]+)/`));
		if (post) return `/admin/writing/${post[1]}`;
		if (file.startsWith(`${PHOTOS_DIR}/`)) return '/admin/photos';
	}
	return null;
}

export const getOverview = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const [head, commits] = await Promise.all([github.head(), github.history(CONTENT_ROOT, 8)]);
	const [build, links] = await Promise.all([
		github.build(head),
		Promise.all(commits.map(async (commit) => changeLink(await github.changedFiles(commit.sha))))
	]);
	return {
		head,
		build,
		changes: commits.map((commit, index) => ({ ...commit, link: links[index] }))
	};
});

export const getBuild = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => ({ sha: blobSha(object(input).sha, 'sha') ?? '' }))
	.handler(async ({ data }) => gitHub(await requireToken()).build(data.sha));

// ---------------------------------------------------------------- writing

const postDir = (name: string) => `${WRITING_DIR}/${name}`;
const postPath = (name: string) => `${postDir(name)}/index.md`;

export const listPosts = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const { files } = await github.contentTree(await github.head());
	const pattern = new RegExp(`^${WRITING_DIR}/([^/]+)/index\\.md$`);
	const posts = await Promise.all(
		[...files].flatMap(([path, sha]) => {
			const match = path.match(pattern);
			if (!match) return [];
			return [
				github.blobText(sha).then((source): PostSummary => {
					const fields = readFields(splitPost(source).yaml);
					return {
						slug: match[1],
						title: fields.title,
						description: fields.description,
						date: fields.date,
						draft: fields.draft
					};
				})
			];
		})
	);
	// drafts first, then newest first, as /writing lists them
	return posts.sort((a, b) => Number(b.draft) - Number(a.draft) || b.date.localeCompare(a.date));
});

// A post as it stands now, or as it was at an older commit. `sha` is always the
// file's blob on the branch today, since publishing replaces that.
export const getPost = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => {
		const data = object(input);
		return { slug: slug(data.slug), ref: ref(data.ref) };
	})
	.handler(async ({ data }) => {
		const github = gitHub(await requireToken());
		const head = await github.head();
		const now = await github.contentTree(head);
		const then = data.ref ? await github.contentTree(data.ref) : now;
		const blob = then.files.get(postPath(data.slug));
		if (!blob) return null;
		const dir = `${postDir(data.slug)}/`;
		return {
			source: await github.blobText(blob),
			sha: now.files.get(postPath(data.slug)) ?? null,
			ref: data.ref ?? head,
			// the folder's other files today, so a new image does not take a used name
			files: [...now.files.keys()]
				.filter((path) => path.startsWith(dir) && path !== postPath(data.slug))
				.map((path) => path.slice(dir.length))
		};
	});

export const getPostVersions = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => ({ slug: slug(object(input).slug) }))
	.handler(async ({ data }) => gitHub(await requireToken()).history(postDir(data.slug)));

// Files a post's markdown names, among those in its folder: images, video.
function referenced(source: string, name: string) {
	return source.includes(name);
}

// What plugins/markdown.ts refuses at build time, refused here instead, so a
// save can never leave main unable to build.
function checkPost(source: string, folder: Set<string>) {
	const { yaml, body } = splitPost(source);
	let front: Record<string, unknown>;
	try {
		front = (parseYaml(yaml) as Record<string, unknown> | null) ?? {};
	} catch {
		throw new Error('The post settings (frontmatter) are not valid YAML');
	}
	const { title, description, date, updated, image, draft } = front;
	const required = draft === true ? { title } : { title, description, date };
	for (const [key, value] of Object.entries(required)) {
		if (typeof value !== 'string' || !value) throw new Error(`The post needs a ${key}`);
	}
	for (const [key, value] of Object.entries({ date, updated })) {
		if (value === undefined || (draft === true && !value)) continue;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`${key} must be yyyy-mm-dd`);
	}
	if (updated !== undefined && String(updated) < String(date ?? '')) {
		throw new Error('The updated date is before the post date');
	}
	// every image the build will look for in the folder (code samples aside)
	const prose = body.replace(FENCED_CODE, '').replace(/`[^`\n]*`/g, '');
	const images = [
		...prose.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g),
		...prose.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)/gi)
	].map((match) => match[1]);
	if (typeof image === 'string') images.push(image);
	for (const src of images) {
		if (/^([a-z][a-z\d+.-]*:|\/)/i.test(src)) continue;
		let name: string;
		try {
			name = decodeURI(src).replace(/^\.\//, '');
		} catch {
			name = src;
		}
		if (!folder.has(name)) {
			throw new Error(`${name} is not in the post's folder; add the image again`);
		}
	}
}

export const savePost = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => {
		const data = object(input);
		return {
			slug: slug(data.slug),
			source: string(data.source, 'source'),
			expected: blobSha(data.expected, 'expected'),
			uploads: uploads(data.uploads, POST_ASSET),
			restoreFrom: ref(data.restoreFrom)
		};
	})
	.handler(async ({ data }) =>
		withConflicts(async () => {
			const github = gitHub(await requireToken());
			data.uploads.forEach(checkPostAsset);
			const dir = postDir(data.slug);
			const { files } = await github.contentTree(await github.head());
			const changes: Change[] = [{ path: postPath(data.slug), base64: encodeText(data.source) }];
			const present = new Set<string>();

			for (const upload of data.uploads) {
				changes.push({ path: `${dir}/${upload.name}`, base64: upload.base64 });
				present.add(upload.name);
			}
			// Keep the folder tidy: drop files the post no longer uses.
			for (const path of files.keys()) {
				if (!path.startsWith(`${dir}/`) || path === postPath(data.slug)) continue;
				const name = path.slice(dir.length + 1);
				if (present.has(name)) continue;
				if (referenced(data.source, name)) present.add(name);
				else changes.push({ path, delete: true });
			}
			// Publishing an older version: bring back images it used that have
			// since been removed.
			if (data.restoreFrom) {
				const old = await github.contentTree(data.restoreFrom);
				for (const [path, sha] of old.files) {
					if (!path.startsWith(`${dir}/`) || path === postPath(data.slug)) continue;
					const name = path.slice(dir.length + 1);
					if (!present.has(name) && referenced(data.source, name)) {
						changes.push({ path, sha });
						present.add(name);
					}
				}
			}

			checkPost(data.source, present);
			const { title, draft } = readFields(splitPost(data.source).yaml);
			const verb =
				data.expected === null
					? 'add'
					: data.restoreFrom
						? 'restore an earlier version of'
						: draft
							? 'save draft'
							: 'update';
			const commit = await github.commit({
				message: `${COMMIT_PREFIX} ${verb} post "${title || data.slug}"`,
				changes,
				expected: { [postPath(data.slug)]: data.expected }
			});
			return { commit };
		})
	);

export const deletePost = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => {
		const data = object(input);
		return { slug: slug(data.slug), expected: blobSha(data.expected, 'expected') };
	})
	.handler(async ({ data }) =>
		withConflicts(async () => {
			const github = gitHub(await requireToken());
			const dir = postDir(data.slug);
			const { files } = await github.contentTree(await github.head());
			const changes: Change[] = [...files.keys()]
				.filter((path) => path.startsWith(`${dir}/`))
				.map((path) => ({ path, delete: true }));
			const commit = await github.commit({
				message: `${COMMIT_PREFIX} delete post "${data.slug}"`,
				changes,
				expected: { [postPath(data.slug)]: data.expected }
			});
			return { commit };
		})
	);

// ---------------------------------------------------------------- photos

async function readManifest(github: GitHub, files: Map<string, string>) {
	const sha = files.get(PHOTOS_MANIFEST);
	if (!sha) return [];
	return photoEntries(JSON.parse(await github.blobText(sha)));
}

export const getPhotos = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => ({ ref: ref(object(input ?? {}).ref) }))
	.handler(async ({ data }) => {
		const github = gitHub(await requireToken());
		const head = await github.head();
		const now = await github.contentTree(head);
		const then = data.ref ? await github.contentTree(data.ref) : now;
		return {
			photos: await readManifest(github, then.files),
			sha: now.files.get(PHOTOS_MANIFEST) ?? null,
			ref: data.ref ?? head
		};
	});

export const getPhotoVersions = createServerFn({ method: 'GET' }).handler(async () =>
	gitHub(await requireToken()).history(PHOTOS_DIR)
);

export const savePhotos = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => {
		const data = object(input);
		return {
			photos: photoEntries(data.photos),
			expected: blobSha(data.expected, 'expected'),
			uploads: uploads(data.uploads, PHOTO_FILE),
			restoreFrom: ref(data.restoreFrom)
		};
	})
	.handler(async ({ data }) =>
		withConflicts(async () => {
			const github = gitHub(await requireToken());
			data.uploads.forEach(checkPhoto);
			if (!data.photos.length) throw new Error('Keep at least one photo; the home page shows one');
			const { files } = await github.contentTree(await github.head());
			const listed = new Set(data.photos.map((photo) => photo.file));
			const uploaded = new Set(data.uploads.map((upload) => upload.name));
			const changes: Change[] = [
				{
					path: PHOTOS_MANIFEST,
					base64: encodeText(`${JSON.stringify(data.photos, null, '\t')}\n`)
				},
				...data.uploads.map((upload) => ({
					path: `${PHOTOS_DIR}/${upload.name}`,
					base64: upload.base64
				}))
			];

			// photos dropped from the list go from the folder too
			let removed = 0;
			for (const path of files.keys()) {
				const name = path.slice(PHOTOS_DIR.length + 1);
				if (!path.startsWith(`${PHOTOS_DIR}/`) || !name.endsWith('.jpg')) continue;
				if (!listed.has(name) && !uploaded.has(name)) {
					changes.push({ path, delete: true });
					removed++;
				}
			}
			// and every listed photo has to be there, brought back from the
			// version being restored if need be
			const old = data.restoreFrom ? (await github.contentTree(data.restoreFrom)).files : null;
			for (const name of listed) {
				const path = `${PHOTOS_DIR}/${name}`;
				if (files.has(path) || uploaded.has(name)) continue;
				const sha = old?.get(path);
				if (!sha) throw new Error(`${name} is missing`);
				changes.push({ path, sha });
			}

			const parts = [
				data.uploads.length && `add ${data.uploads.length}`,
				removed && `remove ${removed}`
			].filter(Boolean);
			const commit = await github.commit({
				message: `${COMMIT_PREFIX} ${
					parts.length
						? `${parts.join(', ')} photos`
						: data.restoreFrom
							? 'restore an earlier version of the photos'
							: 'update photos'
				}`,
				changes,
				expected: { [PHOTOS_MANIFEST]: data.expected }
			});
			return { commit };
		})
	);
