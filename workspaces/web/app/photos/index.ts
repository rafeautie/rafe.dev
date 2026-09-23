import manifest from './photos.json';

// The gallery is photos.json plus the JPEG masters beside it. Add photos with
// `pnpm add-photo`; order and metadata are edited in photos.json by hand. The
// build encodes every master into AVIF and WebP srcsets under hashed asset
// names, which public/_headers caches as immutable.
export type Picture = {
	sources: Record<string, string>;
	img: { src: string; w: number; h: number };
};

export type Photo = {
	file: string;
	alt: string;
	caption: string;
	location: string;
	// ISO yyyy-mm-dd, or '' when unknown.
	date: string;
	picture: Picture;
	// Root-relative JPEG for og:image, which scrapers render at roughly 1200px
	// wide and which several do not accept as AVIF or WebP.
	socialImage: string;
};

// 2048 is the widest anything paints: the lightbox, full screen on a large
// display. The grid and the hero top out below it.
//
// One import per format because quality is per import, and sharp's defaults
// (AVIF 50, WebP 80) visibly smooth away grass, foliage and shadow detail at
// 1:1. AVIF 75 is close to the master while still smaller than WebP 90.
const AVIF = import.meta.glob<Picture>('./*.jpg', {
	query: '?w=640;1024;1600;2048&format=avif&quality=75&as=picture',
	import: 'default',
	eager: true
});

const WEBP = import.meta.glob<Picture>('./*.jpg', {
	query: '?w=640;1024;1600;2048&format=webp&quality=90&as=picture',
	import: 'default',
	eager: true
});

function buildPicture(path: string): Picture | undefined {
	const avif = AVIF[path];
	const webp = WEBP[path];
	if (!avif || !webp) return undefined;
	// AVIF first: the browser takes the first <source> it can decode.
	return { sources: { ...avif.sources, ...webp.sources }, img: webp.img };
}

const SOCIAL_IMAGES = import.meta.glob<string>('./*.jpg', {
	query: '?w=1200&format=jpg',
	import: 'default',
	eager: true
});

export const PHOTOS: Photo[] = manifest.map((entry) => {
	const picture = buildPicture(`./${entry.file}`);
	const socialImage = SOCIAL_IMAGES[`./${entry.file}`];
	// scripts/photos.test.mjs keeps the two in sync; this is the error if it was
	// skipped.
	if (!picture || !socialImage) throw new Error(`photos.json lists missing ${entry.file}`);
	return { ...entry, picture, socialImage };
});

export function getPhoto(file: string): Photo {
	const photo = PHOTOS.find((candidate) => candidate.file === file);
	if (!photo) throw new Error(`No photo named ${file}`);
	return photo;
}

// og:image must be absolute.
export function absoluteUrl(path: string) {
	return new URL(path, 'https://rafe.dev').href;
}
