import { env } from 'cloudflare:workers';

// The daily job saves a chapter by committing it to the repo, which deploys
// the site like any other change. These are GitHub's Git Data calls, so the
// chapter and the notes land in one commit.

const API = 'https://api.github.com';

async function github<T>(method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${API}/repos/${env.STORY_REPO}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': 'rafe.dev story',
			'X-GitHub-Api-Version': '2022-11-28',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!response.ok) {
		throw new GitHubError(
			response.status,
			`GitHub ${method} ${path}: ${response.status} ${await response.text()}`
		);
	}
	return response.json() as Promise<T>;
}

class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

// The branch's head commit, made from main first if the branch is new (a
// test branch, say).
async function head(branch: string): Promise<string> {
	try {
		const ref = await github<{ object: { sha: string } }>('GET', `/git/ref/heads/${branch}`);
		return ref.object.sha;
	} catch (error) {
		if (!(error instanceof GitHubError) || error.status !== 404 || branch === 'main') throw error;
		const sha = await head('main');
		await github('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
		return sha;
	}
}

// Whether a file is already on the branch, so a rerun never writes a chapter
// twice.
export async function exists(path: string): Promise<boolean> {
	try {
		await github('GET', `/contents/${path}?ref=${encodeURIComponent(env.STORY_BRANCH)}`);
		return true;
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return false;
		throw error;
	}
}

export async function readFile(path: string): Promise<string | null> {
	try {
		const file = await github<{ content: string }>(
			'GET',
			`/contents/${path}?ref=${encodeURIComponent(env.STORY_BRANCH)}`
		);
		const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch (error) {
		if (error instanceof GitHubError && error.status === 404) return null;
		throw error;
	}
}

export async function commit(message: string, files: Record<string, string>): Promise<string> {
	const branch = env.STORY_BRANCH;
	const parent = await head(branch);
	const { tree } = await github<{ tree: { sha: string } }>('GET', `/git/commits/${parent}`);
	const created = await github<{ sha: string }>('POST', '/git/trees', {
		base_tree: tree.sha,
		tree: Object.entries(files).map(([path, content]) => ({
			path,
			mode: '100644',
			type: 'blob',
			content
		}))
	});
	const next = await github<{ sha: string }>('POST', '/git/commits', {
		message,
		tree: created.sha,
		parents: [parent]
	});
	// Not forced, so a push to the branch in the meantime fails this rather
	// than being lost.
	await github('PATCH', `/git/refs/heads/${branch}`, { sha: next.sha });
	return next.sha;
}
