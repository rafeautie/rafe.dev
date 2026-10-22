import { env } from 'cloudflare:workers';
import { parse, stringify } from 'yaml';
import { CHAPTERS, chapterPath, LATEST, readChapter, type Chapter, type Theme } from '..';
import { NUDGE_CAP } from '../nudges';
import { pacificDate, pacificHour } from '../time';
import { groupNudges, writeChapter, type Draft } from './claude';
import { db, getStatus, setStatus } from './db';
import { commit, exists, readFile } from './github';
import { log } from './log';

// The daily job: at noon in California it reads the nudges waiting for the
// next chapter, has Claude write the chapter, and commits it with its nudge
// stats to the repo, which deploys it. Progress goes in the status table so
// the page can show it.

const STORY = 'workspaces/web/app/story';
const RECENT = 3;
const WEEK = 7 * 24 * 60 * 60 * 1000;

export type Outcome =
	| { ran: false; reason: string }
	| { ran: true; chapter: number; title: string };

export async function runDailyJob(now: Date, { force = false } = {}): Promise<Outcome> {
	// The crons fire at 19:00 and 20:00 UTC, so one of them is noon whatever
	// the season.
	if (!force && pacificHour(now) !== 12) return { ran: false, reason: 'not noon in California' };

	// The deployed site may lag the branch by a few minutes, and a test branch
	// may run ahead of it, so the branch decides which chapter is next.
	let pending = LATEST + 1;
	while (await exists(chapterPath(pending))) pending++;
	const previous = await chapterOn(pending - 1);
	const date = pacificDate(now);
	if (!force && previous?.date === date)
		return { ran: false, reason: `chapter ${pending - 1} is already out today` };

	const status = await getStatus();
	const busy =
		status?.chapter === pending &&
		status.state !== 'late' &&
		Date.now() - status.updatedAt < 20 * 60 * 1000;
	if (busy) return { ran: false, reason: `chapter ${pending} is already being written` };

	try {
		await setStatus(pending, 'reading', 'Reading your nudges');
		const database = await db();
		const { results } = await database
			.prepare('SELECT text FROM nudges WHERE chapter <= ? AND used = 0 ORDER BY RANDOM() LIMIT ?')
			.bind(pending, NUDGE_CAP)
			.all<{ text: string }>();
		const texts = results.map((row) => row.text);
		const themes = await groupNudges(texts);

		await setStatus(pending, 'writing', 'Writing the chapter');
		const [premise, notes, summaries, recent] = await Promise.all([
			readFile(`${STORY}/premise.md`),
			readFile(`${STORY}/notes.md`),
			storySoFar(pending),
			recentChapters(pending)
		]);
		if (!premise || !notes) throw new Error('premise.md or notes.md is missing');

		const brief = {
			chapter: pending,
			date,
			premise,
			notes,
			summaries,
			recent,
			themes,
			nudges: texts.length
		};
		let file: string;
		let draft = await writeChapter(brief);
		try {
			file = buildChapter(pending, date, draft, texts.length, themes);
		} catch (error) {
			log(`retrying chapter ${pending}: ${(error as Error).message}`);
			draft = await writeChapter({ ...brief, retry: (error as Error).message });
			file = buildChapter(pending, date, draft, texts.length, themes);
		}

		await setStatus(pending, 'publishing', 'Publishing');
		await commit(`Story: chapter ${pending}`, {
			[chapterPath(pending)]: file,
			[`${STORY}/notes.md`]: draft.notes.trim() + '\n'
		});

		// Every nudge for this chapter has had its day, including any past the
		// cap. Nudges sent while it was being written went to the next one.
		await database.batch([
			database.prepare('UPDATE nudges SET used = 1 WHERE chapter <= ? AND used = 0').bind(pending),
			database
				.prepare('DELETE FROM nudges WHERE used = 1 AND created_at < ?')
				.bind(Date.now() - WEEK)
		]);
		log(`chapter ${pending} "${draft.title}" committed from ${texts.length} nudges`);
		return { ran: true, chapter: pending, title: draft.title };
	} catch (error) {
		console.error(`story: chapter ${pending} failed`, error);
		await setStatus(pending, 'late', 'Running late').catch(() => {});
		throw error;
	}
}

// Checks a draft and turns it into the chapter file; throws with a reason
// the writer can act on.
export function buildChapter(
	chapter: number,
	date: string,
	draft: Draft,
	nudges: number,
	themes: Theme[]
) {
	const words = draft.body.split(/\s+/).filter(Boolean).length;
	if (words < 500 || words > 1600)
		throw new Error(`the body was ${words} words, and it should be 700 to 1,000`);
	if (/^chapter\s+\d+/i.test(draft.title.trim()))
		throw new Error('the title should not be "Chapter N"');
	if (/^#\s/m.test(draft.body)) throw new Error('the body should not have a title heading');
	if (!draft.notes.trim()) throw new Error('the notes were empty');
	const frontmatter = {
		chapter,
		title: draft.title.trim(),
		date,
		summary: draft.summary.trim(),
		nudges,
		themes,
		shaped: nudges && draft.shaped.trim() ? draft.shaped.trim() : null
	};
	readChapter(frontmatter, `chapter ${chapter}`);
	return `---\n${stringify(frontmatter, { lineWidth: 0 })}---\n\n${draft.body.trim()}\n`;
}

export function splitFrontmatter(file: string): {
	frontmatter: Record<string, unknown>;
	body: string;
} {
	const match = file.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) throw new Error('chapter has no frontmatter');
	return { frontmatter: parse(match[1]) ?? {}, body: match[2].trim() };
}

async function chapterOn(number: number): Promise<Chapter | undefined> {
	if (number < 1) return undefined;
	if (number <= LATEST) return CHAPTERS[number - 1];
	const file = await readFile(chapterPath(number));
	return file ? readChapter(splitFrontmatter(file).frontmatter, chapterPath(number)) : undefined;
}

async function storySoFar(pending: number) {
	const chapters = await Promise.all(
		Array.from({ length: pending - 1 }, (_, i) => chapterOn(i + 1))
	);
	return chapters
		.filter((chapter): chapter is Chapter => !!chapter)
		.map((chapter) => `${chapter.chapter}. ${chapter.title}: ${chapter.summary}`)
		.join('\n');
}

async function recentChapters(pending: number) {
	const numbers = Array.from({ length: RECENT }, (_, i) => pending - RECENT + i).filter(
		(n) => n >= 1
	);
	const files = await Promise.all(numbers.map((n) => readFile(chapterPath(n))));
	return files
		.map((file, i) => {
			if (!file) return '';
			const { frontmatter, body } = splitFrontmatter(file);
			return `<chapter number="${numbers[i]}" title="${String(frontmatter.title)}">\n${body}\n</chapter>`;
		})
		.filter(Boolean)
		.join('\n\n');
}

// For /api/story/run: the admin token as a bearer token.
export async function authorized(request: Request) {
	const given = request.headers.get('Authorization') ?? '';
	const expected = `Bearer ${env.STORY_ADMIN_TOKEN}`;
	// Hashed first so the two are the same length for the constant-time check.
	const [a, b] = await Promise.all(
		[given, expected].map((text) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
	);
	// workerd's own addition to Web Crypto
	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean;
	};
	return env.STORY_ADMIN_TOKEN.length > 0 && subtle.timingSafeEqual(a, b);
}
