import { redirect } from '@tanstack/react-router';

// beforeLoad for the pages under the overview: signed out goes back to /admin,
// which is the sign-in page. `admin` comes from the /admin layout route.
export function requireAdmin({ context }: { context: { admin: unknown } }) {
	if (!context.admin) throw redirect({ to: '/admin' });
}
