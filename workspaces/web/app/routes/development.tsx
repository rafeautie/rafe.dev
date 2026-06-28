import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/development')({
	head: () => ({
		meta: [
			{ title: 'Development | Rafe Autie' },
			{
				name: 'description',
				content:
					'Rafe Autie builds beautiful user experiences and impactful software, and develops games for fun.'
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
				<p>
					For fun, I also develop games. You can{' '}
					<Link
						to="/games"
						className="underline decoration-dotted underline-offset-4 transition-colors hover:text-black/60"
					>
						find them on the games page
					</Link>
					.
				</p>
			</div>
		</div>
	);
}
