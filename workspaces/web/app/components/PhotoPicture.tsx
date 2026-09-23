import type { ComponentProps } from 'react';
import type { Picture } from '~/photos';

// One <source> per format the build emitted, AVIF first, so the browser takes
// the smallest it can decode. width/height come from the build, which reserves
// the photo's real aspect ratio before any pixels arrive.
export function PhotoPicture({
	picture,
	sizes,
	...img
}: { picture: Picture; sizes: string } & Omit<
	ComponentProps<'img'>,
	'src' | 'srcSet' | 'sizes' | 'width' | 'height'
>) {
	return (
		<picture>
			{Object.entries(picture.sources).map(([format, srcSet]) => (
				<source key={format} type={`image/${format}`} srcSet={srcSet} sizes={sizes} />
			))}
			<img src={picture.img.src} width={picture.img.w} height={picture.img.h} {...img} />
		</picture>
	);
}
