import type { ReactNode } from 'react';
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';

// "Are you sure?" before something that cannot be taken back from the page.
export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirm,
	destructive,
	onConfirm
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: ReactNode;
	confirm: string;
	destructive?: boolean;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						variant={destructive ? 'destructive' : 'default'}
						onClick={() => {
							onOpenChange(false);
							onConfirm();
						}}
					>
						{confirm}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
