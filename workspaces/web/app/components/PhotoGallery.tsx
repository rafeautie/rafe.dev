import { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { getImageUrl } from '~/utils';

// The first few photos paint the initial screen, so they skip lazy loading.
const EAGER_COUNT = 6;
// Neutral ratio reserving space until the real pixels arrive.
const PLACEHOLDER_RATIO = '3 / 2';
const GRID_WIDTHS = [640, 1024, 1600];
const GRID_SIZES = '(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw';
const LIGHTBOX_WIDTH = 2048;

export function PhotoGallery({ imageKeys }: { imageKeys: string[] }) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	return (
		<>
			<div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
				{imageKeys.map((key, index) => (
					<GalleryPhoto
						key={key}
						imageKey={key}
						eager={index < EAGER_COUNT}
						onOpen={() => setOpenIndex(index)}
					/>
				))}
			</div>
			<Lightbox imageKeys={imageKeys} openIndex={openIndex} onOpenChange={setOpenIndex} />
		</>
	);
}

function GalleryPhoto({
	imageKey,
	eager,
	onOpen
}: {
	imageKey: string;
	eager: boolean;
	onOpen: () => void;
}) {
	const [ratio, setRatio] = useState<string | null>(null);

	const measure = (img: HTMLImageElement | null) => {
		if (img?.naturalWidth && img.naturalHeight) {
			setRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
		}
	};

	return (
		<button
			type="button"
			onClick={onOpen}
			data-photo-button
			className="mb-3 block w-full cursor-pointer break-inside-avoid"
		>
			<img
				// The ref covers images that finished loading before hydration,
				// where onLoad never fires.
				ref={(img) => {
					if (img?.complete) measure(img);
				}}
				src={getImageUrl(imageKey, 1024)}
				srcSet={GRID_WIDTHS.map((width) => `${getImageUrl(imageKey, width)} ${width}w`).join(', ')}
				sizes={GRID_SIZES}
				alt="Photograph"
				loading={eager ? 'eager' : 'lazy'}
				decoding="async"
				className="w-full object-cover"
				style={{ aspectRatio: ratio ?? PLACEHOLDER_RATIO }}
				onLoad={(event) => measure(event.currentTarget)}
			/>
		</button>
	);
}

function Lightbox({
	imageKeys,
	openIndex,
	onOpenChange
}: {
	imageKeys: string[];
	openIndex: number | null;
	onOpenChange: (index: number | null) => void;
}) {
	const imageKey = openIndex !== null ? imageKeys[openIndex] : null;
	const lastIndex = useRef(0);
	useEffect(() => {
		if (openIndex !== null) lastIndex.current = openIndex;
	}, [openIndex]);

	const step = (delta: number) => {
		if (openIndex === null) return;
		onOpenChange((openIndex + delta + imageKeys.length) % imageKeys.length);
	};

	return (
		<Dialog open={imageKey !== null} onOpenChange={(open) => !open && onOpenChange(null)}>
			<DialogContent
				className="block h-dvh w-screen max-w-none rounded-none bg-background p-0 ring-0 sm:max-w-none"
				onKeyDown={(event) => {
					if (event.key === 'ArrowLeft') step(-1);
					if (event.key === 'ArrowRight') step(1);
				}}
				// There is no Radix trigger to restore focus to, so send it back
				// to the photo that opened the lightbox.
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					document.querySelectorAll<HTMLElement>('[data-photo-button]')[lastIndex.current]?.focus();
				}}
			>
				<DialogTitle className="sr-only">Photograph</DialogTitle>
				<DialogDescription className="sr-only">Fullscreen photograph view</DialogDescription>
				{imageKey && (
					<img
						src={getImageUrl(imageKey, LIGHTBOX_WIDTH)}
						alt="Photograph"
						className="h-full w-full object-contain"
						onClick={() => onOpenChange(null)}
					/>
				)}
				{imageKeys.length > 1 && (
					<>
						<Button
							variant="ghost"
							size="icon-sm"
							className="absolute inset-y-0 left-2 my-auto"
							onClick={() => step(-1)}
						>
							<ChevronLeftIcon />
							<span className="sr-only">Previous photo</span>
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							className="absolute inset-y-0 right-2 my-auto"
							onClick={() => step(1)}
						>
							<ChevronRightIcon />
							<span className="sr-only">Next photo</span>
						</Button>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
