// Pre-commit hook (.githooks/pre-commit). Photos dropped into app/photos by
// hand, rather than through `pnpm add-photo`, are normalized here before the
// commit lands, because once a camera original is in the public history its
// EXIF and full resolution are there for good.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });

const top = git(['rev-parse', '--show-toplevel']).trim();
// Resolved without importing photo-lib, so a commit that touches nothing in
// app/photos does not need sharp installed.
const photosDir = relative(top, join(import.meta.dirname, '../app/photos')).replaceAll('\\', '/');

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--', photosDir])
	.split('\0')
	.filter(Boolean);
if (!staged.length) process.exit(0);

const { PHOTO_EXT, inspect, isImageFile, isNormalized, normalize } =
	await import('./photo-lib.mjs');
const images = staged.filter(isImageFile);
if (!images.length) process.exit(0);

// Converting a PNG or HEIC would rename it, and photos.json would then point at
// a file that is not there. add-photo handles the rename and the manifest.
const wrongType = images.filter((path) => !path.endsWith(PHOTO_EXT));
if (wrongType.length) {
	process.stderr.write(
		`Photos must be ${PHOTO_EXT}. Add these with \`pnpm add-photo\` instead:\n` +
			wrongType.map((path) => `  ${path}\n`).join('')
	);
	process.exit(1);
}

for (const path of images) {
	// The staged blob, not the working tree, is what is about to be committed.
	const input = execFileSync('git', ['show', `:${path}`], { cwd: top, maxBuffer: 1 << 30 });
	if (isNormalized(await inspect(input))) continue;

	writeFileSync(join(top, path), await normalize(input));
	git(['add', '--', path], { cwd: top });
	process.stdout.write(`Resized and stripped metadata from ${path}\n`);
}
