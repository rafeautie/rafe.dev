import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/admin')({
	head: () => ({
		meta: [{ title: 'Admin' }, { name: 'robots', content: 'noindex' }]
	}),
	component: () => (
		<div className="flex flex-col gap-8 p-8 text-black">
			<Outlet />
		</div>
	)
});
