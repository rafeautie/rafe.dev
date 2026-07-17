import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { PILL_CLASS } from '~/components/pill';
import type { Photo } from '~/gallery-manifest';
import {
	COLUMNS_CLASS,
	COLUMN_CLASS,
	GRID_SIZES,
	PHOTO_ITEM_CLASS,
	srcSetFor,
	toColumns,
	useColumnCount,
	usePhotoRatio
} from '~/components/photo-grid';
import { getImageUrl } from '~/utils';

// The first few photos paint the initial screen, so they skip lazy loading.
const EAGER_COUNT = 6;
const LIGHTBOX_WIDTH = 2048;

export function PhotoGallery({ photos }: { photos: Photo[] }) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const columnCount = useColumnCount();

	// Dealing into columns reorders the DOM, so each photo carries the position
	// it holds in the manifest. That index is what the lightbox opens on and
	// what eager loading counts, neither of which should follow the DOM.
	const columns = toColumns(
		photos.map((photo, index) => ({ photo, index })),
		columnCount
	);

	return (
		<>
			<div className={COLUMNS_CLASS}>
				{columns.map((column, columnIndex) => (
					<div key={columnIndex} className={COLUMN_CLASS}>
						{column.map(({ photo, index }) => (
							<GalleryPhoto
								key={photo.key}
								photo={photo}
								index={index}
								eager={index < EAGER_COUNT}
								onOpen={() => setOpenIndex(index)}
							/>
						))}
					</div>
				))}
			</div>
			<Lightbox photos={photos} openIndex={openIndex} onOpenChange={setOpenIndex} />
		</>
	);
}

function GalleryPhoto({
	photo,
	index,
	eager,
	onOpen
}: {
	photo: Photo;
	index: number;
	eager: boolean;
	onOpen: () => void;
}) {
	const ratio = usePhotoRatio();

	return (
		<button
			type="button"
			onClick={onOpen}
			data-photo-index={index}
			className={cn(PHOTO_ITEM_CLASS, 'cursor-pointer')}
		>
			<img
				{...ratio}
				src={getImageUrl(photo.key, 1024)}
				srcSet={srcSetFor(photo.key, getImageUrl)}
				sizes={GRID_SIZES}
				alt={photo.alt}
				loading={eager ? 'eager' : 'lazy'}
				decoding="async"
				className="w-full object-cover"
			/>
		</button>
	);
}

// yyyy-mm-dd parses as UTC midnight, so it is formatted in UTC too. Reading it
// back in a negative-offset timezone would otherwise show the previous day.
function formatDate(date: string) {
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return date;
	return parsed.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

// Same easing as the shmoney caption, but quicker: that carousel drifts on
// autoplay, whereas photos are stepped through by hand and a slow crossfade
// leaves the old caption ghosting under the new one.
const CAPTION_EASE = [0.22, 1, 0.36, 1] as const;
const CAPTION_DURATION = 0.4;

function PhotoCaption({ photo }: { photo: Photo }) {
	const meta = [photo.location, photo.date && formatDate(photo.date)].filter(Boolean).join(' · ');
	const hasContent = Boolean(photo.caption || meta);

	return (
		// AnimatePresence so stepping onto a photo with no caption fades the pill
		// out rather than dropping it.
		<AnimatePresence>
			{hasContent && (
				<motion.figcaption
					// layout animates the pill between caption sizes.
					// layoutDependency keeps that to caption swaps, so a window
					// resize reflows instantly instead of sliding the pill.
					layout
					layoutDependency={photo.key}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{
						duration: CAPTION_DURATION,
						ease: CAPTION_EASE,
						layout: { duration: CAPTION_DURATION, ease: CAPTION_EASE }
					}}
					// Centred with inset-x-0 + mx-auto + w-fit rather than a translate
					// transform, which the layout animation would override.
					className={cn(
						PILL_CLASS,
						'pointer-events-none absolute inset-x-0 bottom-6 mx-auto w-fit max-w-[85%] px-5 py-2.5 text-center'
					)}
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={photo.key}
							layout="position"
							layoutDependency={photo.key}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: CAPTION_DURATION, ease: CAPTION_EASE }}
							className="block"
						>
							{photo.caption && <span className="block text-sm font-medium">{photo.caption}</span>}
							{meta && <span className="block text-xs text-muted-foreground">{meta}</span>}
						</motion.span>
					</AnimatePresence>
				</motion.figcaption>
			)}
		</AnimatePresence>
	);
}

function Lightbox({
	photos,
	openIndex,
	onOpenChange
}: {
	photos: Photo[];
	openIndex: number | null;
	onOpenChange: (index: number | null) => void;
}) {
	const photo = openIndex !== null ? photos[openIndex] : null;
	const lastIndex = useRef(0);
	useEffect(() => {
		if (openIndex !== null) lastIndex.current = openIndex;
	}, [openIndex]);

	const step = (delta: number) => {
		if (openIndex === null) return;
		onOpenChange((openIndex + delta + photos.length) % photos.length);
	};

	return (
		<Dialog open={photo !== null} onOpenChange={(open) => !open && onOpenChange(null)}>
			<DialogContent
				className="block h-dvh w-screen max-w-none rounded-none bg-background p-0 ring-0 sm:max-w-none"
				onKeyDown={(event) => {
					if (event.key === 'ArrowLeft') step(-1);
					if (event.key === 'ArrowRight') step(1);
				}}
				// There is no Radix trigger to restore focus to, so send it back
				// to the photo that opened the lightbox. Selected by index rather
				// than DOM position, which the column layout no longer matches.
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					document.querySelector<HTMLElement>(`[data-photo-index="${lastIndex.current}"]`)?.focus();
				}}
			>
				<DialogTitle className="sr-only">{photo?.caption || 'Photograph'}</DialogTitle>
				<DialogDescription className="sr-only">Fullscreen photograph view</DialogDescription>
				{photo && (
					<>
						<img
							src={getImageUrl(photo.key, LIGHTBOX_WIDTH)}
							alt={photo.alt}
							className="h-full w-full object-contain"
							onClick={() => onOpenChange(null)}
						/>
						<PhotoCaption photo={photo} />
					</>
				)}
				{photos.length > 1 && (
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
