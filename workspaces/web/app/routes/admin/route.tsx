import {
	createFileRoute,
	Outlet,
	useRouter,
	type ErrorComponentProps
} from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { Link } from '~/components/Link';
import { AdminSidebar } from '~/components/admin/AdminSidebar';
import { Button } from '~/components/ui/button';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { TooltipProvider } from '~/components/ui/tooltip';
import { getAdmin } from '~/lib/admin/api';
import { sidebarOpen } from '~/lib/admin/sidebar';
import { whoIsSignedIn } from '~/lib/admin/signed-in';
import { useWritingTheme } from '~/lib/writing-theme';

// /admin and everything under it: private pages for editing the site's
// content, saved to GitHub (lib/admin). Kept out of search engines here and
// in robots.txt.

export const Route = createFileRoute('/admin')({
	head: () => ({
		meta: [{ title: 'Admin | Rafe Autie' }, { name: 'robots', content: 'noindex, nofollow' }]
	}),
	beforeLoad: async () => {
		const [admin, open] = await Promise.all([
			// a lapsed sign-in shows AdminError on the next server call
			typeof window === 'undefined' ? getAdmin() : whoIsSignedIn(),
			sidebarOpen()
		]);
		return { admin, sidebarOpen: open };
	},
	component: AdminLayout,
	errorComponent: AdminError
});

// Signed in, the admin sidebar sits beside every page, open or folded to its
// icons as it was left (on a phone it slides in from the header); the sign-in
// page stands alone. A page with its own sidebar (Subsections) sets its own
// padding. The page's area, padding and all, is a size container, so the
// controls rail (AdminHeader) can stretch across the whole of it.

function AdminLayout() {
	useWritingTheme();
	const { admin, sidebarOpen } = Route.useRouteContext();
	const page = (
		<div className="@container min-w-0 flex-1">
			<div className="px-6 py-8 sm:px-8 lg:px-12 lg:has-[[data-subsections]]:p-0">
				<Outlet />
			</div>
		</div>
	);
	if (!admin) {
		return <main className="min-h-dvh bg-background text-base text-foreground">{page}</main>;
	}
	return (
		<TooltipProvider>
			<SidebarProvider
				defaultOpen={sidebarOpen}
				style={{ '--sidebar-width': '14rem' } as CSSProperties}
				className="text-base text-foreground"
			>
				<AdminSidebar />
				{/* min-w-0: a wide table scrolls inside its card instead of pushing the page sideways */}
				<SidebarInset className="min-w-0">{page}</SidebarInset>
			</SidebarProvider>
		</TooltipProvider>
	);
}

function AdminError({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const signedOut = error.message === 'Not signed in';
	return (
		<div className="min-h-dvh bg-background px-6 py-8 text-base text-foreground sm:px-8">
			<div className="mx-auto flex max-w-4xl flex-col items-start gap-4 pt-24">
				<p className="text-xl font-medium">
					{signedOut ? 'Your sign-in has run out' : 'Something went wrong'}
				</p>
				<p className="text-foreground/60">
					{signedOut
						? 'Sign in again to carry on. Unsaved edits are kept in this browser.'
						: error.message}
				</p>
				{signedOut ? (
					<Button render={<a href="/admin/login" />}>Sign in again</Button>
				) : (
					<div className="flex items-center gap-4">
						<Button
							onClick={() => {
								reset();
								router.invalidate();
							}}
						>
							Try again
						</Button>
						<Link href="/admin">back to admin</Link>
					</div>
				)}
			</div>
		</div>
	);
}
