import { useEffect, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';
import { getBuild } from '~/lib/admin/api';
import type { Build } from '~/lib/admin/types';
import { cn } from '~/lib/utils';

const POLL_MS = 6000;
// Cloudflare builds take a minute or two; past this something is stuck.
const GIVE_UP_MS = 10 * 60 * 1000;

// After a publish: follows Cloudflare's build of the new commit until it is
// live or has failed.
// `since` is when the commit was made, when known, so an old commit with no
// build is not waited on.
export function useBuildWatch(initial?: { sha: string; build: Build; since?: number }) {
	const [watch, setWatch] = useState<{ sha: string; build: Build; since: number } | null>(() =>
		initial ? { ...initial, since: initial.since ?? Date.now() } : null
	);

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

// What the site is doing with the latest publish, as a badge.
export function BuildBadge({ build, className }: { build: Build | null; className?: string }) {
	if (!build) return null;
	if (build.state === 'live') {
		return (
			<Badge variant="secondary" className={className}>
				<span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
				Live
			</Badge>
		);
	}
	if (build.state === 'failed') {
		const badge = (
			<Badge variant="destructive" className={className}>
				Build failed
			</Badge>
		);
		return build.url ? (
			<a href={build.url} target="_blank" rel="noreferrer" title="See why on GitHub">
				{badge}
			</a>
		) : (
			badge
		);
	}
	if (build.state === 'unknown') {
		return (
			<Badge variant="outline" className={cn('text-foreground/60', className)}>
				Build status unavailable
			</Badge>
		);
	}
	return (
		<Badge variant="secondary" className={className}>
			<Spinner />
			{build.state === 'pending' ? 'Waiting to build' : 'Building'}
		</Badge>
	);
}
