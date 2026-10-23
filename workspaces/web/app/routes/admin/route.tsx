import {
	createFileRoute,
	Outlet,
	useRouter,
	type ErrorComponentProps
} from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { Button } from '~/components/ui/button';
import { getAdmin } from '~/lib/admin/api';
import { useWritingTheme } from '~/lib/writing-theme';

// /admin and everything under it: private pages for editing the site's
// content, saved to GitHub (lib/admin). Kept out of search engines here and
// in robots.txt.

// In the browser, who is signed in is asked once per visit rather than before
// every page; each server call still checks the cookie, and a lapsed sign-in
// shows AdminError.
let known: Awaited<ReturnType<typeof getAdmin>> | undefined;

export const Route = createFileRoute('/admin')({
	head: () => ({
		meta: [{ title: 'Admin | Rafe Autie' }, { name: 'robots', content: 'noindex, nofollow' }]
	}),
	beforeLoad: async () => {
		if (typeof window === 'undefined') return { admin: await getAdmin() };
		known ??= await getAdmin();
		return { admin: known };
	},
	component: AdminLayout,
	errorComponent: AdminError
});

function AdminLayout() {
	useWritingTheme();
	return (
		<div className="min-h-dvh bg-background px-6 py-8 text-base text-foreground sm:px-8">
			<Outlet />
		</div>
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
