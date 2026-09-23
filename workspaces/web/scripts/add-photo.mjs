// Adds photos to the gallery straight from the camera:
//   pnpm add-photo ~/Pictures/DSCF1234.JPG [...more]
// Each is resized and stripped (see photo-lib.mjs), copied into app/photos and
// appended to photos.json with its capture date. Alt text, caption and location
// are left for you to fill in; gallery order is the order of photos.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	PHOTOS_DIR,
	captureDate,
	newEntry,
	normalize,
	readManifest,
	toPhotoFile,
	writeManifest
} from './photo-lib.mjs';

const sources = process.argv.slice(2);
if (!sources.length) {
	process.stderr.write('Usage: pnpm add-photo <image> [...images]\n');
	process.exit(1);
}

const photos = readManifest();
const taken = new Set(photos.map(({ file }) => file));

for (const source of sources) {
	const file = toPhotoFile(source);
	// A collision would silently replace a photo already in the gallery.
	if (taken.has(file) || existsSync(join(PHOTOS_DIR, file))) {
		process.stderr.write(`${file} already exists. Rename ${source} and try again.\n`);
		process.exit(1);
	}

	const input = readFileSync(source);
	const date = await captureDate(input);
	writeFileSync(join(PHOTOS_DIR, file), await normalize(input));

	photos.push(newEntry(file, date));
	taken.add(file);
	process.stdout.write(`Added ${file}${date ? ` (${date})` : ''}\n`);
}

writeManifest(photos);
process.stdout.write('Fill in alt text, caption and location in app/photos/photos.json.\n');
