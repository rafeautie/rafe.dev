import { createFileRoute, notFound } from '@tanstack/react-router';
import { Book } from '~/components/story/Book';
import { LATEST, loadHtml } from '~/story';
import { storyHead } from '~/components/story/head';

// Pages 1 to LATEST are chapters; the one after is the chapter to come.
export const Route = createFileRoute('/story/$chapter')({
	loader: async ({ params }) => {
		const page = /^\d+$/.test(params.chapter) ? Number(params.chapter) : 0;
		if (page < 1 || page > LATEST + 1) throw notFound();
		return { page, html: page <= LATEST ? await loadHtml(page) : null };
	},
	head: ({ loaderData }) => storyHead(loaderData?.page),
	component: ChapterRoute
});

function ChapterRoute() {
	const { page, html } = Route.useLoaderData();
	return <Book page={page} html={html} />;
}
