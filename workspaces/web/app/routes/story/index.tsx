import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Book, LAST_READ_KEY } from '~/components/story/Book';
import { storyHead } from '~/components/story/head';
import { LATEST, loadHtml } from '~/story';

// Opens on chapter 1, then on the client jumps to wherever the reader left off.
export const Route = createFileRoute('/story/')({
	loader: async () => ({ html: await loadHtml(1) }),
	head: () => storyHead(),
	component: StoryIndex
});

function StoryIndex() {
	const { html } = Route.useLoaderData();
	const navigate = useNavigate();

	useEffect(() => {
		let last = 0;
		try {
			last = Number(localStorage.getItem(LAST_READ_KEY));
		} catch {
			// private window
		}
		if (Number.isInteger(last) && last > 1 && last <= LATEST + 1) {
			navigate({ to: '/story/$chapter', params: { chapter: String(last) }, replace: true });
		}
	}, [navigate]);

	return <Book page={1} html={html} />;
}
