import { cn } from '~/lib/utils';
import icon from '~/assets/shmoney/icon.png?w=224&format=webp';

// The shmoney app icon (build/icon.png in the shmoney repo). Its rounded
// corners are part of the image, so callers only set the size.
export function Logo({ className }: { className?: string }) {
	return (
		<img
			src={icon}
			alt=""
			draggable={false}
			className={cn('aspect-square size-8 shrink-0', className)}
		/>
	);
}
