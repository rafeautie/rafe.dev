import { cn } from '~/lib/utils';

export function Wordmark({ className }: { className?: string }) {
	return <span className={cn('font-semibold tracking-tight', className)}>shmoney</span>;
}
