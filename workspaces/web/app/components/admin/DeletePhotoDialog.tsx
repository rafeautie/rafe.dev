import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import type { Photo } from '~/gallery-manifest';
import { getImageUrl } from '~/utils';

export function DeletePhotoDialog({
	photo,
	onCancel,
	onConfirm
}: {
	photo: Photo | null;
	onCancel: () => void;
	onConfirm: (key: string) => void;
}) {
	return (
		<Dialog open={photo !== null} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Delete photo?</DialogTitle>
					<DialogDescription>
						This removes the file from the bucket permanently. It cannot be undone.
					</DialogDescription>
				</DialogHeader>
				{photo && (
					<div className="flex items-center gap-3">
						<img
							src={getImageUrl(photo.key, 160)}
							alt=""
							className="size-16 shrink-0 rounded-lg object-cover"
						/>
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">{photo.key}</p>
							{photo.caption && (
								<p className="truncate text-sm text-muted-foreground">{photo.caption}</p>
							)}
						</div>
					</div>
				)}
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button variant="destructive" onClick={() => photo && onConfirm(photo.key)}>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
