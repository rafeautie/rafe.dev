// Where the admin reads and writes. Every save is a commit to BRANCH, and
// Cloudflare's build for that branch puts it live.
export const REPO = { owner: 'rafeautie', name: 'rafe.dev' } as const;
export const BRANCH = 'main';

// The only folder the admin may write to. Everything under it is content;
// everything outside it is code.
export const CONTENT_ROOT = 'workspaces/web/content';
export const WRITING_DIR = `${CONTENT_ROOT}/writing`;
export const PHOTOS_DIR = `${CONTENT_ROOT}/photos`;
export const PHOTOS_MANIFEST = `${PHOTOS_DIR}/photos.json`;

// A readable cookie that only says a sign-in may exist, so public pages know
// whether to ask the server and show their admin links. It grants nothing;
// the server checks the real, encrypted one.
export const SIGNED_IN_COOKIE = 'rafe-admin-signed-in';

// Rafe's GitHub account. Anyone else who signs in is turned away.
export const ADMIN_GITHUB_ID = 45886348;

// The check Cloudflare Workers Builds reports on each commit.
export const BUILD_CHECK = 'Workers Builds: rafe-dev';

// Commit messages start with this, so `git log --grep '^content:'` (or a log
// of the content folder) separates content changes from code.
export const COMMIT_PREFIX = 'content:';

// A post's folder name is its URL. "new" is /admin/writing/new, so no post can
// take it.
export const SLUG_PATTERN = /^(?!new$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Images are read straight from the public repo, so a file committed a moment
// ago shows before the site has rebuilt.
export function rawUrl(path: string, ref: string = BRANCH) {
	const encoded = path.split('/').map(encodeURIComponent).join('/');
	return `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${ref}/${encoded}`;
}
