import { PhotoPicture } from '~/components/PhotoPicture';
import { PHOTOS_DIR, rawUrl } from '~/lib/admin/config';
import { BUILT, type Source } from './photo-source';

// A photo as the browser can show it: the build's own sizes when the site has
// it, the file just picked when it is new, and the file on GitHub otherwise.
export function Thumb({
	source,
	sizes,
	alt = '',
	decoding,
	className
}: {
	source: Source;
	sizes: string;
	// the overview names its photos; the photos page leaves them blank
	alt?: string;
	decoding?: 'async';
	className?: string;
}) {
	const built = BUILT.get(source.file);
	if (source.upload) {
		return (
			<img
				src={source.upload.url}
				width={source.upload.width}
				height={source.upload.height}
				alt={alt}
				className={className}
			/>
		);
	}
	if (built) {
		return (
			<PhotoPicture
				picture={built.picture}
				sizes={sizes}
				alt={alt}
				loading="lazy"
				decoding={decoding}
				className={className}
			/>
		);
	}
	return (
		<img
			src={rawUrl(`${PHOTOS_DIR}/${source.file}`, source.ref)}
			alt={alt}
			loading="lazy"
			decoding={decoding}
			className={className}
		/>
	);
}
