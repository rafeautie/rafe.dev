import { useEffect, useState } from 'react';
import { Link } from '~/components/Link';
import { Spinner } from '~/components/ui/spinner';
import { getBuild } from '~/lib/admin/api';
import type { Build } from '~/lib/admin/types';
import { cn } from '~/lib/utils';

const POLL_MS = 6000;
// Cloudflare builds take a minute or two; past this something is stuck.
const GIVE_UP_MS = 10 * 60 * 1000;

// After a publish: follows Cloudflare's build of the new commit until it is
// live or has failed.
export function useBuildWatch() {
	const [watch, setWatch] = useState<{ sha: string; build: Build; since: number } | null>(null);

	useEffect(() => {
		if (!watch || watch.build.state === 'live' || watch.build.state === 'failed') return;
		if (Date.now() - watch.since > GIVE_UP_MS) return;
		const timer = setTimeout(async () => {
			const build = await getBuild({ data: { sha: watch.sha } }).catch(() => watch.build);
			setWatch((current) => (current?.sha === watch.sha ? { ...current, build } : current));
		}, POLL_MS);
		return () => clearTimeout(timer);
	}, [watch]);

	return {
		build: watch?.build ?? null,
		start: (sha: string) =>
			setWatch({ sha, build: { state: 'pending', url: '' }, since: Date.now() })
	};
}

// One quiet line: what the site is doing with the latest publish.
export function BuildLine({
	build,
	liveHref,
	className
}: {
	build: Build | null;
	// where to look once it is live
	liveHref?: string;
	className?: string;
}) {
	if (!build) return null;
	const line = 'inline-flex items-center gap-1.5 text-sm text-foreground/50';

	if (build.state === 'live') {
		return (
			<p className={cn(line, className)}>
				<span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
				Live
				{liveHref && (
					<Link href={liveHref} className="text-foreground">
						view
					</Link>
				)}
			</p>
		);
	}
	if (build.state === 'failed') {
		return (
			<p className={cn(line, 'text-destructive', className)}>
				Build failed
				{build.url && (
					<Link href={build.url} className="underline underline-offset-3">
						see why
					</Link>
				)}
			</p>
		);
	}
	if (build.state === 'unknown') {
		return <p className={cn(line, className)}>Build status unavailable</p>;
	}
	return (
		<p className={cn(line, className)}>
			<Spinner className="size-3.5" />
			{build.state === 'pending' ? 'Waiting to build' : 'Building'}
		</p>
	);
}
