import { createFileRoute } from '@tanstack/react-router';
import { SlashNav } from '~/components/SlashNav';

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

const projects = [
	{
		name: 'shmoney',
		description: 'personal finance app - private first, local first, personal first',
		url: '/shmoney',
		language: 'TypeScript',
		topics: ['local-first', 'self-hosted', 'personal-finance', 'local-llm']
	}
];

function DevelopmentPage() {
	return (
		<div className="flex flex-col items-center gap-8 p-8 text-base text-black">
			<div className="w-full max-w-4xl space-y-2">
				<SlashNav className="text-xl font-medium">
					<a href="/">rafe</a>
					development
				</SlashNav>
			</div>
			<div className="flex max-w-4xl flex-col gap-8">
				<p>
					I love building beautiful user experiences and impactful software, interfaces that feel as
					intentional as they are useful, backed by code that holds up.
				</p>
			</div>
			<div className="flex w-full max-w-4xl flex-col gap-6">
				{projects.map((project) => (
					<a
						key={project.name}
						href={project.url}
						target={project.url.startsWith('http') ? '_blank' : undefined}
						rel={project.url.startsWith('http') ? 'noreferrer' : undefined}
						className="flex flex-col gap-2 rounded-lg border border-black/10 p-6 transition-colors hover:border-black/30"
					>
						<div className="flex items-baseline justify-between">
							<p className="font-medium">{project.name}</p>
							<p className="text-sm text-black/60">{project.language}</p>
						</div>
						<p className="text-base text-black/80">{project.description}</p>
						<div className="flex flex-wrap gap-2 text-sm text-black/60">
							{project.topics.map((topic) => (
								<span key={topic}>#{topic}</span>
							))}
						</div>
					</a>
				))}
			</div>
		</div>
	);
}
