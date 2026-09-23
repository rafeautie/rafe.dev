// Copies the shmoney app screenshots from a sibling checkout of the shmoney repo.
// Run after reshooting them there; the build derives the AVIF/WebP variants.
import { copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = resolve(process.argv[2] ?? join(root, '../../../shmoney/docs/screenshots'));
const target = join(root, 'app/components/shmoney/screenshots');

const files = readdirSync(source).filter((file) => file.endsWith('.png'));
for (const file of files) {
	copyFileSync(join(source, file), join(target, file));
}
process.stdout.write(`Copied ${files.length} screenshots from ${source}\n`);
