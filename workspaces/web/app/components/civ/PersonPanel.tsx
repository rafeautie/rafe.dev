import { DAYS_PER_YEAR, TICKS_PER_DAY } from '~/lib/civ/config';
import { NEEDS, SKILLS, TRAITS, type ActivityKind, type Person } from '~/lib/civ/types';

// The person being followed: what they're doing, how they are, what they
// know and remember. Everything here comes from the simulation's own record
// of them, sent with each frame.

const DOING: Record<ActivityKind, string> = {
	idle: 'Resting a moment',
	sleep: 'Sleeping',
	walk: 'Walking',
	forage: 'Foraging',
	drink: 'Drinking',
	eat: 'Eating',
	hunt: 'Hunting',
	fish: 'Fishing',
	gather: 'Gathering',
	craft: 'Trying something',
	build: 'Building',
	socialize: 'Talking',
	teach: 'Teaching',
	care: 'Caring for someone',
	pray: 'Praying',
	wander: 'Wandering',
	flee: 'Running'
};

const label = (id: string) => id.replaceAll('-', ' ');

export function PersonPanel({
	person,
	tick,
	names,
	onFollow,
	onClose
}: {
	person: Person;
	tick: number;
	// names of people the record points to, by id
	names: Map<number, string>;
	onFollow: (id: number) => void;
	onClose: () => void;
}) {
	const day = Math.floor(tick / TICKS_PER_DAY);
	const age = Math.floor((day - person.born) / DAYS_PER_YEAR);
	const craft = person.activity.craft;
	const knowledge = Object.entries(person.knowledge).sort((a, b) => b[1] - a[1]);
	const traits = [...TRAITS].sort((a, b) => person.traits[b] - person.traits[a]).slice(0, 2);
	const skills = SKILLS.filter((skill) => person.skills[skill] >= 0.15).sort(
		(a, b) => person.skills[b] - person.skills[a]
	);
	const family = [
		person.partner !== undefined && ['partner', person.partner],
		person.mother !== undefined && ['mother', person.mother],
		person.father !== undefined && ['father', person.father]
	].filter(Boolean) as [string, number][];

	return (
		<div className="flex flex-col gap-4 text-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-base font-medium">{person.name}</div>
					<div className="text-foreground/50">
						{person.sex === 'f' ? 'Woman' : 'Man'}, {age} · {traits.join(', ')} · knack for{' '}
						{person.knack}
					</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="cursor-pointer text-foreground/40 hover:text-foreground"
				>
					Stop following
				</button>
			</div>

			<div className="text-foreground/80">
				{DOING[person.activity.kind]}
				{craft && (
					<span className="text-foreground/50">
						{' '}
						({craft.action} {craft.items.map(label).join(', ')})
					</span>
				)}
				{person.goal && <div className="text-foreground/50 italic">“{person.goal.text}”</div>}
			</div>

			<Section title="Needs">
				<div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
					<Bar name="health" value={person.health} />
					{NEEDS.map((need) => (
						<Bar key={need} name={need} value={person.needs[need]} />
					))}
				</div>
			</Section>

			{family.length > 0 && (
				<Section title="Family">
					<div className="flex flex-wrap gap-x-3 gap-y-1">
						{family.map(([role, id]) => (
							<button
								key={role}
								type="button"
								onClick={() => onFollow(id)}
								className="cursor-pointer text-foreground/70 hover:text-foreground"
							>
								<span className="text-foreground/40">{role}</span> {names.get(id) ?? 'someone'}
							</button>
						))}
					</div>
				</Section>
			)}

			<Section title="Knows">
				{knowledge.length ? (
					<div className="flex flex-col gap-1.5">
						{knowledge.map(([id, level]) => (
							<Bar key={id} name={label(id)} value={level} />
						))}
					</div>
				) : (
					<div className="text-foreground/40">Nothing yet beyond what everyone knows.</div>
				)}
			</Section>

			{skills.length > 0 && (
				<Section title="Good at">
					<div className="text-foreground/70">{skills.join(', ')}</div>
				</Section>
			)}

			{person.carrying.length > 0 && (
				<Section title="Carrying">
					<div className="text-foreground/70">
						{person.carrying.map((stack) => `${stack.count} ${label(stack.material)}`).join(', ')}
					</div>
				</Section>
			)}

			{person.memories.length > 0 && (
				<Section title="Remembers">
					<ul className="flex flex-col gap-1 text-foreground/70">
						{[...person.memories]
							.reverse()
							.slice(0, 8)
							.map((memory, i) => (
								<li key={i}>{memory.text}</li>
							))}
					</ul>
				</Section>
			)}
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-xs tracking-wide text-foreground/40 uppercase">{title}</div>
			{children}
		</div>
	);
}

function Bar({ name, value }: { name: string; value: number }) {
	const low = value < 0.3;
	return (
		<div className="flex items-center gap-2">
			<span className="w-20 shrink-0 truncate text-foreground/60">{name}</span>
			<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
				<span
					className={`block h-full rounded-full ${low ? 'bg-red-500/70' : 'bg-foreground/50'}`}
					style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
				/>
			</span>
		</div>
	);
}
