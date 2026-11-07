import { useState } from 'react';
import { DAYS_PER_YEAR, TICKS_PER_DAY } from '~/lib/civ/config';
import { NEEDS, SKILLS, TRAITS, type Person } from '~/lib/civ/types';
import { DOING, PANEL, label } from './labels';

// The person being followed: what they're doing, how they are, who they
// know, what they know and remember. Everything here comes from the
// simulation's own record of them, sent with each frame.

const TABS = [
	['overview', 'Overview'],
	['needs', 'Needs'],
	['social', 'Family & social'],
	['knowledge', 'Knowledge'],
	['memories', 'Memories']
] as const;
type TabId = (typeof TABS)[number][0];

export function PersonPanel({
	person,
	tick,
	villageName,
	nameOf,
	onFollow,
	onClose,
	className
}: {
	person: Person;
	tick: number;
	villageName?: string;
	// the name of someone the record points to
	nameOf: (id: number) => string | undefined;
	onFollow: (id: number) => void;
	onClose: () => void;
	className?: string;
}) {
	const [tab, setTab] = useState<TabId>('overview');
	const day = Math.floor(tick / TICKS_PER_DAY);
	const age = Math.floor((day - person.born) / DAYS_PER_YEAR);
	const traits = [...TRAITS].sort((a, b) => person.traits[b] - person.traits[a]).slice(0, 2);

	return (
		<div className={`pointer-events-auto flex flex-col text-xs ${PANEL} ${className ?? ''}`}>
			<div className="flex items-start justify-between gap-3 px-3 pt-2.5">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">{person.name}</div>
					<div className="text-foreground/50">
						{person.sex === 'f' ? 'Woman' : 'Man'}, {age} · {traits.join(', ')} · knack for{' '}
						{person.knack}
					</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Stop following"
					className="-mt-0.5 cursor-pointer rounded-md px-1.5 text-base leading-none text-foreground/40 hover:text-foreground"
				>
					×
				</button>
			</div>
			<div className="flex flex-wrap gap-0.5 px-2 pt-2">
				{TABS.map(([id, name]) => (
					<button
						key={id}
						type="button"
						onClick={() => setTab(id)}
						aria-pressed={tab === id}
						className={`cursor-pointer rounded-md px-1.5 py-0.5 ${
							tab === id
								? 'bg-foreground/10 text-foreground'
								: 'text-foreground/50 hover:text-foreground'
						}`}
					>
						{name}
					</button>
				))}
			</div>
			<div className="max-h-64 overflow-y-auto px-3 py-2.5">
				{tab === 'overview' && (
					<Overview person={person} villageName={villageName} nameOf={nameOf} />
				)}
				{tab === 'needs' && <Needs person={person} />}
				{tab === 'social' && <Social person={person} nameOf={nameOf} onFollow={onFollow} />}
				{tab === 'knowledge' && <Knowledge person={person} />}
				{tab === 'memories' && <Memories person={person} />}
			</div>
		</div>
	);
}

function Overview({
	person,
	villageName,
	nameOf
}: {
	person: Person;
	villageName?: string;
	nameOf: (id: number) => string | undefined;
}) {
	const craft = person.activity.craft;
	const withId = person.activity.with;
	return (
		<div className="flex flex-col gap-3">
			<div className="text-foreground/80">
				{DOING[person.activity.kind]}
				{withId !== undefined && nameOf(withId) && (
					<span className="text-foreground/50"> with {nameOf(withId)}</span>
				)}
				{craft && (
					<span className="text-foreground/50">
						{' '}
						({craft.action} {craft.items.map(label).join(', ')})
					</span>
				)}
				{person.goal && <div className="text-foreground/50 italic">“{person.goal.text}”</div>}
			</div>
			{villageName && <Row name="Village" value={villageName} />}
			<Section title="Carrying">
				{person.carrying.length ? (
					<div className="text-foreground/70">
						{person.carrying.map((stack) => `${stack.count} ${label(stack.material)}`).join(', ')}
					</div>
				) : (
					<div className="text-foreground/40">Nothing in hand.</div>
				)}
			</Section>
		</div>
	);
}

function Needs({ person }: { person: Person }) {
	return (
		<div className="flex flex-col gap-1.5">
			<Bar name="health" value={person.health} />
			{NEEDS.map((need) => (
				<Bar key={need} name={need} value={person.needs[need]} />
			))}
		</div>
	);
}

function Social({
	person,
	nameOf,
	onFollow
}: {
	person: Person;
	nameOf: (id: number) => string | undefined;
	onFollow: (id: number) => void;
}) {
	const family = [
		person.partner !== undefined && ['partner', person.partner],
		person.mother !== undefined && ['mother', person.mother],
		person.father !== undefined && ['father', person.father]
	].filter(Boolean) as [string, number][];
	// the people they feel most about, warmest first
	const relations = Object.entries(person.relations ?? {})
		.map(([id, r]) => ({ id: Number(id), ...r }))
		.sort((a, b) => b.affection - a.affection)
		.slice(0, 6);

	return (
		<div className="flex flex-col gap-3">
			<Section title="Family">
				{family.length ? (
					<div className="flex flex-wrap gap-x-3 gap-y-1">
						{family.map(([role, id]) => (
							<button
								key={role}
								type="button"
								onClick={() => onFollow(id)}
								className="cursor-pointer text-foreground/70 hover:text-foreground"
							>
								<span className="text-foreground/40">{role}</span> {nameOf(id) ?? 'someone'}
							</button>
						))}
					</div>
				) : (
					<div className="text-foreground/40">No family known.</div>
				)}
			</Section>
			{relations.length > 0 && (
				<Section title="Close to">
					<div className="flex flex-col gap-1.5">
						{relations.map((r) => (
							<div key={r.id} className="flex flex-col gap-0.5">
								<button
									type="button"
									onClick={() => onFollow(r.id)}
									className="cursor-pointer self-start text-foreground/70 hover:text-foreground"
								>
									{nameOf(r.id) ?? 'someone'}
								</button>
								<Bar name="affection" value={r.affection} />
								<Bar name="trust" value={r.trust} />
							</div>
						))}
					</div>
				</Section>
			)}
		</div>
	);
}

function Knowledge({ person }: { person: Person }) {
	const knowledge = Object.entries(person.knowledge).sort((a, b) => b[1] - a[1]);
	const skills = SKILLS.filter((skill) => person.skills[skill] >= 0.15).sort(
		(a, b) => person.skills[b] - person.skills[a]
	);
	return (
		<div className="flex flex-col gap-3">
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
					<div className="flex flex-col gap-1.5">
						{skills.map((skill) => (
							<Bar key={skill} name={skill} value={person.skills[skill]} />
						))}
					</div>
				</Section>
			)}
		</div>
	);
}

function Memories({ person }: { person: Person }) {
	if (!person.memories.length)
		return <div className="text-foreground/40">Nothing stands out yet.</div>;
	return (
		<ul className="flex flex-col gap-1 text-foreground/70">
			{[...person.memories]
				.reverse()
				.slice(0, 10)
				.map((memory, i) => (
					<li key={i}>{memory.text}</li>
				))}
		</ul>
	);
}

function Row({ name, value }: { name: string; value: string }) {
	return (
		<div className="flex justify-between gap-3">
			<span className="text-foreground/40">{name}</span>
			<span className="text-foreground/70">{value}</span>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="tracking-wide text-foreground/40 uppercase">{title}</div>
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
