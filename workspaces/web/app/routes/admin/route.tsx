import { createFileRoute, Outlet } from '@tanstack/react-router';
import { getAdmin } from '~/lib/admin/api';
import { useWritingTheme } from '~/lib/writing-theme';

// /admin and everything under it: private pages for editing the site's
// content, saved to GitHub (lib/admin). Kept out of search engines here and
// in robots.txt.
export const Route = createFileRoute('/admin')({
	head: () => ({
		meta: [{ title: 'Admin | Rafe Autie' }, { name: 'robots', content: 'noindex, nofollow' }]
	}),
	beforeLoad: async () => ({ admin: await getAdmin() }),
	component: AdminLayout
});

function AdminLayout() {
	useWritingTheme();
	return (
		<div className="min-h-dvh bg-background px-6 py-8 text-base text-foreground sm:px-8">
			<Outlet />
		</div>
	);
}
