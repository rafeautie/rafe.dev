/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import '../styles/app.css';
import faviconUrl from '../assets/favicon.png?url';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'Rafe Autie' },
			{ property: 'og:site_name', content: 'Rafe Autie' }
		],
		links: [{ rel: 'icon', href: faviconUrl }]
	}),
	notFoundComponent: () => (
		<div className="flex h-dvh flex-col items-center justify-center text-3xl font-semibold text-black">
			<p>that page doesn't exist</p>
		</div>
	),
	component: RootComponent
});

function RootComponent() {
	return (
		<html lang="en" className="light">
			<head>
				<HeadContent />
			</head>
			<body>
				<main>
					<Toaster position="top-right" richColors />
					<Outlet />
				</main>
				<Scripts />
			</body>
		</html>
	);
}
