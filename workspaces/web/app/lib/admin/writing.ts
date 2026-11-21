import { createServerFn } from '@tanstack/react-start';
import { WRITING_DIR } from './config';
import { type PostFields, readFields, splitPost } from './frontmatter';
import { gitHub } from './github.server';
import { type PostStats, postStats } from './post-stats';
import { requireToken } from './session.server';
import type { Commit } from './types';

// The writing list's view of every post: its fields, how long it is, what it
// still lacks and when its folder last changed. Kept apart from api.ts, which
// the other admin pages share.

export type PostOverview = PostFields &
	PostStats & {
		slug: string;
		// the file's blob today, which unsaved edits in the browser are tied to
		sha: string;
		// the newest commit to touch the post's folder
		changed: Commit | null;
	};

export const listPostOverviews = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const { files } = await github.contentTree(await github.head());
	const pattern = new RegExp(`^${WRITING_DIR}/([^/]+)/index\\.md$`);

	async function overview(slug: string, sha: string): Promise<PostOverview> {
		const [source, history] = await Promise.all([
			github.blobText(sha),
			// one commit is enough; a post with no readable history still lists
			github.history(`${WRITING_DIR}/${slug}`, 1).catch(() => [])
		]);
		const { yaml, body } = splitPost(source);
		return { slug, sha, ...readFields(yaml), ...postStats(body), changed: history[0] ?? null };
	}

	return Promise.all(
		[...files].flatMap(([path, sha]) => {
			const match = path.match(pattern);
			return match ? [overview(match[1], sha)] : [];
		})
	);
});
