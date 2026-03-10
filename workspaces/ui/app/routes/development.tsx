import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/development')({
	component: DevelopmentPage
});

function DevelopmentPage() {
	return (
		<div className="flex h-dvh items-center justify-center text-2xl font-semibold text-black md:text-5xl">
			<p>work in progress</p>
		</div>
	);
}
