import { createContext, useContext, useRef } from 'react';
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	type ColumnDef,
	type Row
} from '@tanstack/react-table';
import { EyeIcon, EyeOffIcon, GripVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow
} from '~/components/ui/table';
import type { Photo } from '~/gallery-manifest';
import { getImageUrl } from '~/utils';
import { cn } from '~/lib/utils';

// Callbacks travel to the cells through table meta so the column defs can live
// at module scope, which is what keeps the table instance stable across
// renders.
type PhotoTableMeta = {
	disabled: boolean;
	onEdit: (photo: Photo) => void;
	onToggleHidden: (photo: Photo) => void;
	onDelete: (photo: Photo) => void;
};

const meta = (table: { options: { meta?: unknown } }) => table.options.meta as PhotoTableMeta;

// The handle lives in a column cell but the sortable node is the whole row, so
// the row hands its drag listeners down through context rather than the cell
// registering a second sortable under the same id.
const RowDragContext = createContext<Pick<
	ReturnType<typeof useSortable>,
	'attributes' | 'listeners'
> | null>(null);

const columns: ColumnDef<Photo>[] = [
	{
		id: 'drag',
		header: () => <span className="sr-only">Reorder</span>,
		cell: () => <DragHandle />
	},
	{
		id: 'position',
		header: '#',
		cell: ({ row }) => (
			<span className="text-xs text-muted-foreground tabular-nums">{row.index + 1}</span>
		)
	},
	{
		accessorKey: 'key',
		header: 'Photo',
		cell: ({ row }) => (
			<div className="flex items-center gap-3">
				<img
					src={getImageUrl(row.original.key, 160)}
					alt=""
					loading="lazy"
					className={cn(
						'size-12 shrink-0 rounded-lg object-cover',
						row.original.hidden && 'opacity-40'
					)}
				/>
				<div className="min-w-0">
					<p className="max-w-48 truncate font-medium" title={row.original.key}>
						{row.original.key}
					</p>
					<p className="max-w-48 truncate text-muted-foreground">
						{row.original.alt || 'No alt text'}
					</p>
				</div>
			</div>
		)
	},
	{
		accessorKey: 'caption',
		header: 'Caption',
		cell: ({ getValue }) => (
			<span className="block max-w-48 truncate" title={getValue<string>()}>
				{getValue<string>()}
			</span>
		)
	},
	{
		accessorKey: 'location',
		header: 'Location',
		cell: ({ getValue }) => (
			<span className="block max-w-32 truncate" title={getValue<string>()}>
				{getValue<string>()}
			</span>
		)
	},
	{
		accessorKey: 'date',
		header: 'Date',
		cell: ({ getValue }) => <span className="tabular-nums">{getValue<string>()}</span>
	},
	{
		accessorKey: 'hidden',
		header: 'Status',
		cell: ({ getValue }) =>
			getValue<boolean>() ? (
				<Badge variant="secondary">Hidden</Badge>
			) : (
				<Badge variant="outline">Visible</Badge>
			)
	},
	{
		id: 'actions',
		header: () => <span className="sr-only">Actions</span>,
		cell: ({ row, table }) => {
			const { disabled, onEdit, onToggleHidden, onDelete } = meta(table);
			const photo = row.original;
			return (
				<div className="flex justify-end gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={(event) => {
							event.stopPropagation();
							onEdit(photo);
						}}
					>
						<PencilIcon />
						<span className="sr-only">Edit {photo.key}</span>
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={(event) => {
							event.stopPropagation();
							onToggleHidden(photo);
						}}
					>
						{photo.hidden ? <EyeOffIcon /> : <EyeIcon />}
						<span className="sr-only">{photo.hidden ? 'Show' : 'Hide'} photo</span>
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={disabled}
						onClick={(event) => {
							event.stopPropagation();
							onDelete(photo);
						}}
					>
						<Trash2Icon className="text-destructive" />
						<span className="sr-only">Delete {photo.key}</span>
					</Button>
				</div>
			);
		}
	}
];

function DragHandle() {
	const drag = useContext(RowDragContext);
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="cursor-grab text-muted-foreground active:cursor-grabbing"
			{...drag?.attributes}
			{...drag?.listeners}
			onClick={(event) => event.stopPropagation()}
		>
			<GripVerticalIcon />
			<span className="sr-only">Reorder</span>
		</Button>
	);
}

export function PhotoTable({
	photos,
	disabled,
	onChange,
	onEdit,
	onDelete
}: {
	photos: Photo[];
	disabled: boolean;
	onChange: (photos: Photo[]) => void;
	onEdit: (photo: Photo) => void;
	onDelete: (photo: Photo) => void;
}) {
	// Ending a drag arms this, and the click the browser delivers right after
	// the drop consumes it, so dropping a row never opens the edit dialog. The
	// next pointerdown clears it in case a drop ended somewhere no click
	// followed.
	const suppressNextClick = useRef(false);

	const table = useReactTable({
		data: photos,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (photo) => photo.key,
		meta: {
			disabled,
			onEdit,
			onToggleHidden: (photo: Photo) =>
				onChange(photos.map((p) => (p.key === photo.key ? { ...p, hidden: !p.hidden } : p))),
			onDelete
		} satisfies PhotoTableMeta
	});

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	// Rows are uniform enough that the classic sortable preview works: rows
	// slide out of the way with transforms while dragging, and the array is
	// only rewritten on drop.
	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		suppressNextClick.current = true;
		if (!over || active.id === over.id) return;
		const from = photos.findIndex((photo) => photo.key === active.id);
		const to = photos.findIndex((photo) => photo.key === over.id);
		if (from === -1 || to === -1) return;
		onChange(arrayMove(photos, from, to));
	};

	const handleRowPointerDown = () => {
		suppressNextClick.current = false;
	};

	const handleRowClick = (photo: Photo) => {
		if (suppressNextClick.current) {
			suppressNextClick.current = false;
			return;
		}
		onEdit(photo);
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragEnd={handleDragEnd}
			onDragCancel={() => {
				suppressNextClick.current = true;
			}}
		>
			<div className="rounded-xl border border-input">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id} className="hover:bg-transparent">
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						<SortableContext
							items={photos.map((photo) => photo.key)}
							strategy={verticalListSortingStrategy}
						>
							{table.getRowModel().rows.map((row) => (
								<DraggableRow
									key={row.id}
									row={row}
									onPointerDownCapture={handleRowPointerDown}
									onClick={() => handleRowClick(row.original)}
								/>
							))}
						</SortableContext>
					</TableBody>
				</Table>
			</div>
		</DndContext>
	);
}

function DraggableRow({
	row,
	onPointerDownCapture,
	onClick
}: {
	row: Row<Photo>;
	onPointerDownCapture: () => void;
	onClick: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: row.original.key
	});

	return (
		<RowDragContext.Provider value={{ attributes, listeners }}>
			<TableRow
				ref={setNodeRef}
				style={{ transform: CSS.Transform.toString(transform), transition }}
				className={cn(
					'cursor-pointer',
					isDragging && 'relative z-10 bg-muted shadow-lg',
					row.original.hidden && 'text-muted-foreground'
				)}
				onPointerDownCapture={onPointerDownCapture}
				onClick={onClick}
			>
				{row.getVisibleCells().map((cell) => (
					<TableCell key={cell.id}>
						{flexRender(cell.column.columnDef.cell, cell.getContext())}
					</TableCell>
				))}
			</TableRow>
		</RowDragContext.Provider>
	);
}
