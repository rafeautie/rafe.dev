// The daily story at /story. A chapter is app/story/chapters/<NNN>/index.md;
// the daily job (server/job.ts) writes one each noon, with the readers' nudge
// stats in its frontmatter. premise.md and notes.md brief the writer and are
// never shown on the site.

export type Theme = { label: string; count: number };

export type Chapter = {
	chapter: number;
	title: string;
	// ISO yyyy-mm-dd, the California date it came out
	date: string;
	// one line, for the feed and for the writer's memory of the story so far
	summary: string;
	// how many nudges shaped it, grouped into themes
	nudges: number;
	themes: Theme[];
	// one line on what the story did with the themes
	shaped: string | null;
};

// Checked here rather than in the markdown plugin, since only the story has
// these fields. The daily job runs the same check before it saves a chapter.
export function readChapter(frontmatter: Record<string, unknown>, file: string): Chapter {
	const { chapter, title, date, summary, nudges = 0, themes = [], shaped = null } = frontmatter;
	const fail = (what: string) => {
		throw new Error(`${file}: frontmatter ${what}`);
	};
	if (!Number.isInteger(chapter) || (chapter as number) < 1) fail('needs a chapter number');
	for (const [key, value] of Object.entries({ title, summary })) {
		if (typeof value !== 'string' || !value.trim()) fail(`needs ${key}`);
	}
	if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
		fail('date must be yyyy-mm-dd');
	if (!Number.isInteger(nudges) || (nudges as number) < 0) fail('nudges must be a count');
	const themeList = Array.isArray(themes) ? themes : fail('themes must be a list');
	for (const theme of themeList as unknown[]) {
		const { label, count } = (theme ?? {}) as Partial<Theme>;
		if (typeof label !== 'string' || !Number.isInteger(count))
			fail('themes need a label and a count');
	}
	if (shaped !== null && typeof shaped !== 'string') fail('shaped must be a line or null');
	return {
		chapter: chapter as number,
		title: title as string,
		date: date as string,
		summary: summary as string,
		nudges: nudges as number,
		themes: themeList as Theme[],
		shaped: shaped as string | null
	};
}

const FRONTMATTER = import.meta.glob<Record<string, unknown>>('./chapters/*/index.md', {
	query: '?frontmatter',
	import: 'frontmatter',
	eager: true
});

// lazy, so each chapter's body is its own chunk
const HTML = import.meta.glob<string>('./chapters/*/index.md', { import: 'html' });

const FILES = new Map<number, string>();

// first to last
export const CHAPTERS: Chapter[] = Object.entries(FRONTMATTER)
	.map(([file, frontmatter]) => {
		const chapter = readChapter(frontmatter, file);
		FILES.set(chapter.chapter, file);
		return chapter;
	})
	.sort((a, b) => a.chapter - b.chapter);

CHAPTERS.forEach((chapter, index) => {
	if (chapter.chapter !== index + 1) {
		throw new Error(`story: chapter ${index + 1} is missing or numbered twice`);
	}
});

// the newest chapter readers can open; the one after it is the pending page
export const LATEST = CHAPTERS.length;

export const TOTAL_NUDGES = CHAPTERS.reduce((total, chapter) => total + chapter.nudges, 0);

export function getChapter(number: number): Chapter | undefined {
	return CHAPTERS[number - 1];
}

export function loadHtml(number: number): Promise<string> {
	return HTML[FILES.get(number)!]();
}

export function chapterUrl(number: number) {
	return `https://rafe.dev/story/${number}`;
}

// app/story/chapters/001/index.md, as the repo names it
export function chapterPath(number: number) {
	return `workspaces/web/app/story/chapters/${String(number).padStart(3, '0')}/index.md`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export function formatDate(date: string) {
	return DATE_FORMAT.format(new Date(date));
}
