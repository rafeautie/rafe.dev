import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/games/the-race')({
	component: TheRaceLayout
});

function TheRaceLayout() {
	return (
		<div className="overflow-hidden bg-linear-to-b from-the-race-bg-from to-the-race-bg-to font-archivo">
			<Outlet />
		</div>
	);
}
