import { useState } from 'react';
import type { Frame } from '~/lib/civ/use-sim';
import { DOING } from './labels';

// Everyone alive right now, from the latest frame. Click a row to follow.

type Key = 'name' | 'age' | 'doing' | 'village';

const AGE_ORDER = { child: 0, adult: 1, elder: 2 } as const;

export function PeopleList({
	frame,
	followedId,
	onFollow
}: {
	frame: Frame | undefined;
	followedId: number | null;
	onFollow: (id: number) => void;
}) {
	const [sort, setSort] = useState<Key>('name');
	if (!frame) return <div className="text-foreground/40">Nobody yet.</div>;

	const village = new Map(frame.villages.map((v) => [v.id, v.name]));
	const rows = frame.people.map((p) => {
		const age: keyof typeof AGE_ORDER = p.child ? 'child' : p.elder ? 'elder' : 'adult';
		return {
			id: p.id,
			name: p.name,
			age,
			doing: DOING[p.activity],
			village: village.get(p.village) ?? ''
		};
	});
	rows.sort((a, b) =>
		sort === 'age'
			? AGE_ORDER[a.age] - AGE_ORDER[b.age] || a.name.localeCompare(b.name)
			: a[sort].localeCompare(b[sort]) || a.name.localeCompare(b.name)
	);

	const heading = (key: Key, text: string, className: string) => (
		<button
			type="button"
			onClick={() => setSort(key)}
			className={`cursor-pointer text-left text-xs tracking-wide uppercase ${className} ${
				sort === key ? 'text-foreground' : 'text-foreground/40 hover:text-foreground'
			}`}
		>
			{text}
		</button>
	);

	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex gap-2 px-1 pb-1">
				{heading('name', 'Name', 'w-28')}
				{heading('age', 'Age', 'w-12')}
				{heading('doing', 'Doing', 'flex-1')}
				{heading('village', 'Village', 'w-20')}
			</div>
			{rows.map((row) => (
				<button
					key={row.id}
					type="button"
					onClick={() => onFollow(row.id)}
					className={`flex cursor-pointer gap-2 rounded-md px-1 py-0.5 text-left hover:bg-foreground/5 ${
						row.id === followedId ? 'bg-foreground/10' : ''
					}`}
				>
					<span className="w-28 shrink-0 truncate">{row.name}</span>
					<span className="w-12 shrink-0 text-foreground/60">{row.age}</span>
					<span className="min-w-0 flex-1 truncate text-foreground/60">{row.doing}</span>
					<span className="w-20 shrink-0 truncate text-foreground/60">{row.village}</span>
				</button>
			))}
		</div>
	);
}
