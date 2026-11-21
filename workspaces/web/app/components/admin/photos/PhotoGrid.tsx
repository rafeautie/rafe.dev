import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors
} from '@dnd-kit/core';
import {
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useId, useRef } from 'react';
import { PhotoPicture } from '~/components/PhotoPicture';
import { COLUMN_CLASS, COLUMNS_CLASS, toColumns } from '~/components/photo-grid';
import type { PhotoEntry } from '~/lib/admin/api';
import { PHOTOS_DIR, rawUrl } from '~/lib/admin/config';
import { cn } from '~/lib/utils';
import { BUILT, type Source, shortDate } from './photo-source';

// The photos page's grid: the gallery's order as what it is, a list, on equal
// squares that hold still while dragging, each with what it says about itself
// underneath. The real gallery deals that list into 1, 2 or 3 columns of
// uneven heights, which Preview shows without letting it be dragged.

// A photo as the browser can show it: the build's own sizes when the site has
// it, the file just picked when it is new, and the file on GitHub otherwise.
export function Thumb({
	source,
	sizes,
	className
}: {
	source: Source;
	sizes: string;
	className?: string;
}) {
	const built = BUILT.get(source.file);
	if (source.upload) {
		return (
			<img
				src={source.upload.url}
				width={source.upload.width}
				height={source.upload.height}
				alt=""
				className={className}
			/>
		);
	}
	if (built) {
		return (
			<PhotoPicture
				picture={built.picture}
				sizes={sizes}
				alt=""
				loading="lazy"
				className={className}
			/>
		);
	}
	return (
		<img
			src={rawUrl(`${PHOTOS_DIR}/${source.file}`, source.ref)}
			alt=""
			loading="lazy"
			className={className}
		/>
	);
}

export type TileState = 'new' | 'edited' | null;

export function SortableGrid({
	photos,
	source,
	selected,
	state,
	onSelect,
	onMove
}: {
	photos: PhotoEntry[];
	source: (file: string) => Source;
	selected: string | null;
	state: (file: string) => TileState;
	onSelect: (file: string) => void;
	onMove: (from: string, to: string) => void;
}) {
	const dndId = useId();
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		// press and hold, so a swipe still scrolls the page
		useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	function onDragEnd({ active, over }: DragEndEvent) {
		if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
	}

	return (
		<DndContext
			id={dndId}
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={onDragEnd}
		>
			<SortableContext items={photos.map((photo) => photo.file)} strategy={rectSortingStrategy}>
				{/* columns follow the card's width, not the window's: the inspector
				    and the sidebar both take from it */}
				<ol className="grid grid-cols-2 gap-x-3 gap-y-4 @md/grid:grid-cols-3 @2xl/grid:grid-cols-4 @4xl/grid:grid-cols-5">
					{photos.map((photo, index) => (
						<Tile
							key={photo.file}
							photo={photo}
							position={index + 1}
							source={source(photo.file)}
							selected={photo.file === selected}
							state={state(photo.file)}
							onSelect={() => onSelect(photo.file)}
						/>
					))}
				</ol>
			</SortableContext>
		</DndContext>
	);
}

function Tile({
	photo,
	position,
	source,
	selected,
	state,
	onSelect
}: {
	photo: PhotoEntry;
	position: number;
	source: Source;
	selected: boolean;
	state: TileState;
	onSelect: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: photo.file
	});
	const meta = [photo.location, shortDate(photo.date)].filter(Boolean).join(' · ');
	const node = useRef<HTMLLIElement | null>(null);

	// stepping through photos in the editor keeps the one open in view
	useEffect(() => {
		if (selected) node.current?.scrollIntoView({ block: 'nearest' });
	}, [selected]);

	return (
		<li
			ref={(element) => {
				node.current = element;
				setNodeRef(element);
			}}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				'relative min-w-0 touch-manipulation scroll-mt-20 scroll-mb-4',
				isDragging && 'z-10'
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				aria-label={`${position}. ${photo.alt || photo.file}. Drag to move, or open to edit.`}
				aria-current={selected || undefined}
				className="group/tile block w-full cursor-grab rounded-md text-left outline-none active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<span
					className={cn(
						'relative block aspect-square overflow-hidden rounded-md bg-muted ring-offset-2 ring-offset-card transition-shadow group-focus-visible/tile:ring-3 group-focus-visible/tile:ring-ring/50',
						selected && 'ring-2 ring-foreground',
						isDragging && 'opacity-80 shadow-lg'
					)}
				>
					<Thumb
						source={source}
						sizes="(min-width: 768px) 200px, 45vw"
						className="pointer-events-none size-full object-cover select-none"
					/>
					<span className="absolute top-1.5 left-1.5 rounded-sm bg-background/80 px-1 text-xs text-foreground/70 tabular-nums">
						{position}
					</span>
					{state && (
						<span className="absolute top-1.5 right-1.5 rounded-sm bg-background/80 px-1 text-xs text-foreground/70">
							{state}
						</span>
					)}
				</span>
				<span className="mt-1.5 block truncate text-xs">
					{photo.alt || <span className="text-destructive">no alt text</span>}
				</span>
				<span className="block truncate text-xs text-foreground/50">
					{meta || 'no place or date'}
				</span>
			</button>
		</li>
	);
}

// The real gallery's layout (photo-grid.ts), read-only.
export function Preview({
	photos,
	columns,
	source
}: {
	photos: PhotoEntry[];
	columns: number;
	source: (file: string) => Source;
}) {
	const dealt = toColumns(photos, columns);
	return (
		<div
			className={cn(
				COLUMNS_CLASS,
				columns === 1 && 'mx-auto max-w-sm',
				columns === 2 && 'mx-auto max-w-2xl'
			)}
		>
			{dealt.map((column, index) => (
				<div key={index} className={COLUMN_CLASS}>
					{column.map((photo) => (
						<Thumb
							key={photo.file}
							source={source(photo.file)}
							sizes={`${Math.round(100 / columns)}vw`}
							className="block h-auto w-full"
						/>
					))}
				</div>
			))}
		</div>
	);
}
