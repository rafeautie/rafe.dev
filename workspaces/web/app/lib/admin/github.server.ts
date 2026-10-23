import { Buffer } from 'node:buffer';
import { BRANCH, BUILD_CHECK, CONTENT_ROOT, REPO } from './config';
import type { Build, Commit } from './types';

// The few GitHub REST calls the admin needs, made with the signed-in user's
// token, so commits are authored by Rafe. Plain fetch rather than Octokit keeps
// the Worker small.
const API = 'https://api.github.com';
const REPO_PATH = `/repos/${REPO.owner}/${REPO.name}`;

export class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

// Thrown when a file changed on GitHub after the admin loaded it.
export class Conflict extends Error {}

export type TreeEntry = { path: string; type: 'blob' | 'tree'; sha: string };

export type Change =
	// new text or bytes, base64
	| { path: string; base64: string }
	// an existing blob, by sha: restoring a file from an older version
	| { path: string; sha: string }
	| { path: string; delete: true };

export function encodeText(text: string) {
	return Buffer.from(text, 'utf8').toString('base64');
}

export function decodeText(base64: string) {
	return Buffer.from(base64, 'base64').toString('utf8');
}

export function decodeBytes(base64: string) {
	return new Uint8Array(Buffer.from(base64, 'base64'));
}

// Paths come from the browser, so every one is checked: inside content/, and
// no way back out of it.
export function assertContentPath(path: string) {
	const parts = path.split('/');
	if (
		!path.startsWith(`${CONTENT_ROOT}/`) ||
		parts.some((part) => part === '' || part === '.' || part === '..') ||
		path.includes('\\')
	) {
		throw new Error(`Not a content path: ${path}`);
	}
}

export function gitHub(token: string) {
	async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await fetch(`${API}${path}`, {
			...init,
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${token}`,
				'User-Agent': 'rafe.dev-admin',
				'X-GitHub-Api-Version': '2022-11-28',
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
				...init.headers
			}
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			throw new GitHubError(response.status, body.message ?? response.statusText);
		}
		return (await response.json()) as T;
	}

	const repo = <T>(path: string, init?: RequestInit) => call<T>(`${REPO_PATH}${path}`, init);
	const post = <T>(path: string, body: unknown) =>
		repo<T>(path, { method: 'POST', body: JSON.stringify(body) });

	async function head() {
		const ref = await repo<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
		return ref.object.sha;
	}

	// Every file under content/ at a commit, by path. One call for the lot.
	async function contentTree(commitSha: string) {
		const commit = await repo<{ tree: { sha: string } }>(`/git/commits/${commitSha}`);
		const tree = await repo<{ tree: TreeEntry[]; truncated: boolean }>(
			`/git/trees/${commit.tree.sha}?recursive=1`
		);
		if (tree.truncated) throw new Error('The repository tree is too large to read in one go');
		const files = new Map<string, string>();
		for (const entry of tree.tree) {
			if (entry.type === 'blob' && entry.path.startsWith(`${CONTENT_ROOT}/`)) {
				files.set(entry.path, entry.sha);
			}
		}
		return { treeSha: commit.tree.sha, files };
	}

	async function blobText(sha: string) {
		const blob = await repo<{ content: string }>(`/git/blobs/${sha}`);
		return decodeText(blob.content);
	}

	function toCommit(item: {
		sha: string;
		commit: { message: string; author: { name: string; date: string } | null };
	}): Commit {
		return {
			sha: item.sha,
			message: item.commit.message.split('\n')[0],
			date: item.commit.author?.date ?? '',
			author: item.commit.author?.name ?? ''
		};
	}

	// Newest first: the commits that touched a path (a file or a folder).
	async function history(path: string, count = 30) {
		const items = await repo<Parameters<typeof toCommit>[0][]>(
			`/commits?sha=${BRANCH}&path=${encodeURIComponent(path)}&per_page=${count}`
		);
		return items.map(toCommit);
	}

	async function changedFiles(sha: string) {
		const commit = await repo<{ files?: { filename: string }[] }>(`/commits/${sha}`);
		return (commit.files ?? []).map((file) => file.filename);
	}

	// Cloudflare's build for a commit: building, live or failed. Unknown when the
	// check has not been reported yet or cannot be read.
	async function build(sha: string): Promise<Build> {
		try {
			const { check_runs } = await repo<{
				check_runs: { status: string; conclusion: string | null; html_url: string }[];
			}>(`/commits/${sha}/check-runs?check_name=${encodeURIComponent(BUILD_CHECK)}`);
			const run = check_runs[0];
			if (!run) return { state: 'pending', url: '' };
			if (run.status !== 'completed') return { state: 'building', url: run.html_url };
			return { state: run.conclusion === 'success' ? 'live' : 'failed', url: run.html_url };
		} catch {
			return { state: 'unknown', url: '' };
		}
	}

	// One commit on top of the branch with every change in it, so a post and its
	// images land together. `expected` maps each path the editor loaded to the
	// blob it saw (null: it did not exist); if any has moved on, nothing is
	// written. Files nobody touched may have changed meanwhile, and that is fine.
	async function commit({
		message,
		changes,
		expected
	}: {
		message: string;
		changes: Change[];
		expected: Record<string, string | null>;
	}) {
		for (const change of changes) assertContentPath(change.path);
		const parent = await head();
		const { treeSha, files } = await contentTree(parent);
		for (const [path, sha] of Object.entries(expected)) {
			if ((files.get(path) ?? null) !== sha) {
				throw new Conflict(`${path.slice(CONTENT_ROOT.length + 1)} changed on GitHub`);
			}
		}

		const tree = await Promise.all(
			changes.map(async (change) => {
				const base = { path: change.path, mode: '100644', type: 'blob' };
				if ('delete' in change) return { ...base, sha: null };
				if ('sha' in change) return { ...base, sha: change.sha };
				const blob = await post<{ sha: string }>('/git/blobs', {
					content: change.base64,
					encoding: 'base64'
				});
				return { ...base, sha: blob.sha };
			})
		);
		const newTree = await post<{ sha: string }>('/git/trees', { base_tree: treeSha, tree });
		const created = await post<{ sha: string }>('/git/commits', {
			message,
			tree: newTree.sha,
			parents: [parent]
		});
		try {
			await repo(`/git/refs/heads/${BRANCH}`, {
				method: 'PATCH',
				body: JSON.stringify({ sha: created.sha, force: false })
			});
		} catch (error) {
			// someone pushed in the moment between reading the branch and moving it
			if (error instanceof GitHubError && error.status === 422) {
				throw new Conflict('The site changed on GitHub while saving');
			}
			throw error;
		}
		return created.sha;
	}

	return { head, contentTree, blobText, history, changedFiles, build, commit };
}

export type GitHub = ReturnType<typeof gitHub>;
