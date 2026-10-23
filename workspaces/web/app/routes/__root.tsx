/// <reference types="vite/client" />
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState
} from '@tanstack/react-router';
import { Toaster } from 'sonner';
import '../styles/app.css';
import faviconUrl from '../assets/favicon.png?url';
import { THEME_SCRIPT } from '../lib/writing-theme';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'Rafe Autie' },
			{ property: 'og:site_name', content: 'Rafe Autie' }
		],
		links: [
			{ rel: 'icon', href: faviconUrl },
			{
				rel: 'alternate',
				type: 'application/atom+xml',
				title: 'Rafe Autie',
				href: '/writing/feed.xml'
			}
		]
	}),
	notFoundComponent: () => (
		<div className="flex h-dvh flex-col items-center justify-center text-3xl font-semibold text-black">
			<p>that page doesn't exist</p>
		</div>
	),
	component: RootComponent
});

function RootComponent() {
	// the admin keeps its Publish buttons top right, so its toasts go below
	const admin = useRouterState({ select: (state) => state.location.pathname.startsWith('/admin') });
	return (
		// THEME_SCRIPT adds a class to <html> before hydration on /writing, /chess and /admin
		<html lang="en" className="light" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
				<HeadContent />
			</head>
			<body>
				<main>
					<Toaster position={admin ? 'bottom-right' : 'top-right'} />
					<Outlet />
				</main>
				<Scripts />
			</body>
		</html>
	);
}
