import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '~/components/ui/select';
import type { Commit } from '~/lib/admin/types';
import { timeAgo } from '~/lib/admin/time';

export const LATEST = 'latest';

// The version dropdown: the latest version, then every earlier one, newest
// first. Picking one shows it in place of what is there now; publishing it
// makes it the newest.
export function VersionSelect({
	versions,
	value,
	onChange,
	disabled
}: {
	versions: Commit[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	// the first is the version on the site now
	const older = versions.slice(1);
	const label = (commit: Commit) =>
		`${timeAgo(commit.date)} · ${commit.message.replace(/^content:\s*/, '')}`;
	const items = [
		{ value: LATEST, label: 'Latest' },
		...older.map((commit) => ({ value: commit.sha, label: label(commit) }))
	];

	return (
		<Select
			items={items}
			value={value}
			onValueChange={(next) => next && onChange(String(next))}
			disabled={disabled || older.length === 0}
		>
			<SelectTrigger className="w-32" aria-label="Version">
				<SelectValue />
			</SelectTrigger>
			<SelectContent
				align="end"
				alignItemWithTrigger={false}
				className="w-auto max-w-[min(24rem,calc(100vw-2rem))]"
			>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value} className="[&_span]:truncate">
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
