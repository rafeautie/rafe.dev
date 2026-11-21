import { timeAgo } from '~/lib/admin/time';

// "5 minutes ago", as a <time>. The server draws it a moment before the
// browser takes the page over, sometimes across a minute, and in its own time
// zone for an older date; the browser's own reading is the right one, so the
// difference is expected rather than reported as a hydration mismatch.
export function TimeAgo({
	at,
	prefix,
	className
}: {
	at: string | number;
	/** words before it, inside the same element: "edited ", "changed " */
	prefix?: string;
	className?: string;
}) {
	return (
		<time dateTime={new Date(at).toISOString()} className={className} suppressHydrationWarning>
			{prefix}
			{timeAgo(at)}
		</time>
	);
}
