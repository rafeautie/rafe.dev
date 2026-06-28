import { createFileRoute } from '@tanstack/react-router';

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

function DevelopmentPage() {
	return (
		<div className="flex flex-col gap-8 p-8 text-xl text-black">
			<div className="space-y-2">
				<p className="text-4xl font-medium tracking-wide">
					<a href="/">rafe / development</a>
				</p>
			</div>
			<div className="flex max-w-4xl flex-col gap-8">
				<p>
					I love building beautiful user experiences and impactful software — interfaces that feel
					as intentional as they are useful, backed by code that holds up.
				</p>
			</div>
		</div>
	);
}
