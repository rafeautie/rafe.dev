import { createFileRoute } from '@tanstack/react-router';
import { ArrowRightIcon, ArrowUpRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { GitHubIcon } from '~/components/GitHubIcon';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { Logo } from '~/components/shmoney/Logo';
import { Screenshot, type ScreenName } from '~/components/shmoney/Screenshot';

const GITHUB_PROFILE_URL = 'https://github.com/rafeautie';

// The screenshot takes the right 3/5 of a max-w-4xl card and bleeds 20% past
// its column; below md it spans the card.
const PREVIEW_SIZES = '(min-width: 768px) 660px, 120vw';

export const Route = createFileRoute('/development')({
	head: () => ({
		meta: [
			{ title: 'Development | Rafe Autie' },
			{
				name: 'description',
				content: 'Rafe Autie builds beautiful user experiences and impactful software.'
			}
		]
	}),
	component: DevelopmentPage
});

type Project = {
	name: string;
	description: string;
	url: string;
	language: string;
	topics: string[];
	icon: ReactNode;
	preview: { name: ScreenName; alt: string };
};

const projects: Project[] = [
	{
		name: 'shmoney',
		description: 'personal finance app - private first, local first, personal first',
		url: '/shmoney',
		language: 'TypeScript',
		topics: ['local-first', 'self-hosted', 'personal-finance', 'local-llm'],
		icon: <Logo className="size-10 rounded-xl" />,
		preview: {
			name: 'transactions',
			alt: 'shmoney transactions view with net worth, search and filters, and a categorized transaction list'
		}
	}
];

function DevelopmentPage() {
	return (
		<div className="flex flex-col items-center gap-10 p-8 text-base text-black sm:gap-12">
			<div className="rise flex w-full max-w-4xl items-center justify-between gap-4">
				<SlashNav className="text-xl font-medium">
					<Link href="/">rafe</Link>
					development
				</SlashNav>
				<Link
					href={GITHUB_PROFILE_URL}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 text-sm text-black/60 hover:text-black"
				>
					<GitHubIcon className="size-4" />
					GitHub
				</Link>
			</div>
			<p className="rise w-full max-w-4xl text-lg text-pretty text-black/80 [--delay:80ms] sm:text-xl">
				I love building beautiful user experiences and impactful software, interfaces that feel as
				intentional as they are useful, backed by code that holds up.
			</p>
			<section className="rise flex w-full max-w-4xl flex-col gap-4 [--delay:160ms]">
				<h2 className="flex items-center gap-3 text-sm text-black/50">
					projects
					<span className="h-px flex-1 bg-black/10" />
				</h2>
				{projects.map((project) => (
					<ProjectCard key={project.name} project={project} />
				))}
			</section>
		</div>
	);
}

function ProjectCard({ project }: { project: Project }) {
	const external = project.url.startsWith('http');
	const Arrow = external ? ArrowUpRightIcon : ArrowRightIcon;

	return (
		<Link
			plain
			href={project.url}
			target={external ? '_blank' : undefined}
			rel={external ? 'noreferrer' : undefined}
			className="group grid overflow-hidden rounded-xl border border-black/10 bg-black/[0.02] transition-colors duration-300 hover:border-black/25 hover:bg-black/[0.035] md:min-h-80 md:grid-cols-5"
		>
			<div className="flex flex-col gap-4 p-6 md:col-span-2 md:p-8">
				<div className="flex items-center gap-3">
					{project.icon}
					<div className="flex flex-col">
						<p className="text-lg leading-tight font-medium">{project.name}</p>
						<p className="text-sm text-black/50">{project.language}</p>
					</div>
					<Arrow className="ml-auto size-5 text-black/30 transition duration-300 group-hover:text-black motion-safe:group-hover:translate-x-0.5" />
				</div>
				<p className="text-black/70">{project.description}</p>
				<ul className="mt-auto flex flex-wrap gap-1.5">
					{project.topics.map((topic) => (
						<li
							key={topic}
							className="rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-xs text-black/60"
						>
							{topic}
						</li>
					))}
				</ul>
			</div>
			{/* Positioned out of flow so the text sets the card's height, and wider
			    than its column so the app reads as continuing past the card's edge. */}
			<div className="relative h-56 sm:h-72 md:col-span-3 md:h-auto">
				<Screenshot
					name={project.preview.name}
					alt={project.preview.alt}
					sizes={PREVIEW_SIZES}
					eager
					className="absolute top-0 left-6 w-[120%] max-w-none rounded-none rounded-tl-lg border-r-0 border-b-0 shadow-lg transition-transform duration-500 ease-out motion-safe:group-hover:-translate-y-1.5 md:top-8 md:left-0"
				/>
			</div>
		</Link>
	);
}
