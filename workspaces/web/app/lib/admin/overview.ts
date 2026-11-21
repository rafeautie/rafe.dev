import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { DIMENSIONS } from '~/lib/stats/dimensions';
import { DAY, type Row, VISITOR } from '~/lib/stats/report';
import { stats } from '~/lib/stats/store.server';
import { zoneOffset } from '~/lib/stats/zone';
import { PHOTOS_DIR, PHOTOS_MANIFEST, WRITING_DIR } from './config';
import { readFields, splitPost } from './frontmatter';
import { gitHub } from './github.server';
import { requireToken } from './session.server';
import { postFiles } from './writing';

// What /admin's overview shows of each area: the few numbers and short lists
// that say how it is doing, never the whole of its page. Each area is its own
// server function, so the page asks for them side by side and one that fails
// leaves the others shown.

// how many drafts and posts the overview lists
const DRAFTS_SHOWN = 4;
const POSTS_SHOWN = 3;

// Today as a count of days since 1970, in Rafe's own calendar, from where his
// request comes from (as /admin/stats reckons days).
function today(now = Date.now()) {
	const cf = (getRequest() as { cf?: IncomingRequestCfProperties }).cf;
	const offset = zoneOffset(cf?.timezone ?? 'UTC', now);
	return { day: Math.floor((now + offset) / DAY), offset };
}

// ---------------------------------------------------------------- writing

export type DraftSummary = { slug: string; title: string; edited: string };

export const getWritingSummary = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const head = await github.readHead();
	const { files } = await github.contentTree(head);
	const posts = await Promise.all(
		postFiles(files).map(async ({ slug, sha }) => ({
			slug,
			...readFields(splitPost(await github.blobText(sha)).yaml)
		}))
	);
	// a post is a draft or published by its draft flag alone; one published
	// without a date still counts as published, it just sorts last
	const published = posts
		.filter((post) => !post.draft)
		.sort((a, b) => b.date.localeCompare(a.date));
	const dated = published.filter((post) => post.date);
	const allDrafts = posts.filter((post) => post.draft);
	// A draft's own date is often empty, so the one to pick up is the one last
	// worked on, from the commits to its folder: every draft's, so one edited
	// today is never left out by its date. Each is remembered by commit, so
	// GitHub is asked again only after the next one.
	const edited = await Promise.all(
		allDrafts.map(async (draft): Promise<DraftSummary> => {
			const [last] = await github.history(`${WRITING_DIR}/${draft.slug}`, 1, head);
			return { slug: draft.slug, title: draft.title || draft.slug, edited: last?.date ?? '' };
		})
	);
	const latest = dated[0];
	return {
		published: published.length,
		drafts: allDrafts.length,
		// how long the site has gone without something new
		daysSincePost: latest
			? Math.max(0, today().day - Math.floor(Date.parse(latest.date) / DAY))
			: null,
		recentPosts: dated
			.slice(0, POSTS_SHOWN)
			.map((post) => ({ slug: post.slug, title: post.title || post.slug, date: post.date })),
		recentDrafts: edited.sort((a, b) => b.edited.localeCompare(a.edited)).slice(0, DRAFTS_SHOWN)
	};
});

// ---------------------------------------------------------------- photos

// new photos go to the end of the manifest (as /admin/photos and `pnpm
// add-photo` add them), so the last few are the latest
const PHOTOS_SHOWN = 8;

export const getPhotosSummary = createServerFn({ method: 'GET' }).handler(async () => {
	const github = gitHub(await requireToken());
	const head = await github.readHead();
	const [{ files }, [last]] = await Promise.all([
		github.contentTree(head),
		github.history(PHOTOS_DIR, 1, head)
	]);
	const sha = files.get(PHOTOS_MANIFEST);
	// edited by hand too, so read loosely: a photo here only needs its file
	const listed: unknown = sha ? JSON.parse(await github.blobText(sha)) : [];
	const photos = (Array.isArray(listed) ? listed : []).flatMap((item) => {
		const { file, alt } = (item ?? {}) as Record<string, unknown>;
		return typeof file === 'string' ? [{ file, alt: typeof alt === 'string' ? alt : '' }] : [];
	});
	return {
		count: photos.length,
		// a photo with no alt text says nothing to someone who cannot see it
		missingAlt: photos.filter((photo) => !photo.alt.trim()).length,
		latest: photos.slice(-PHOTOS_SHOWN).reverse(),
		ref: head,
		changed: last ? { date: last.date, message: last.message } : null
	};
});

// ---------------------------------------------------------------- visits

// the chart's span, in days, today included
const CHART_DAYS = 30;
const RANKED = 5;

export const getVisitsSummary = createServerFn({ method: 'GET' }).handler(async () => {
	await requireToken();
	const db = await stats();
	const now = Date.now();
	const { day: current, offset } = today(now);
	// this week is today and the six days before it; the week before, for the trend
	const week = (current - 6) * DAY - offset;
	const before = (current - 13) * DAY - offset;
	const chart = (current - CHART_DAYS + 1) * DAY - offset;
	const visitor = VISITOR;
	const source = DIMENSIONS.source.key;
	// Every range is bounded on both ends, up to now: with only a lower bound
	// SQLite reaches for the session or path index and reads the whole table;
	// with both it searches the time index for just the rows in range.
	const until = now + 1;

	const [totals, previous, days, pages, sources, here] = await db.batch([
		db
			.prepare(
				`SELECT count(DISTINCT ${visitor}) AS visitors, count(*) AS views
				FROM views WHERE at >= ? AND at < ?`
			)
			.bind(week, until),
		db
			.prepare(`SELECT count(DISTINCT ${visitor}) AS visitors FROM views WHERE at >= ? AND at < ?`)
			.bind(before, week),
		db
			.prepare(
				`SELECT CAST((at + ?) / ? AS INTEGER) AS day, count(DISTINCT ${visitor}) AS visitors
				FROM views WHERE at >= ? AND at < ? GROUP BY day`
			)
			.bind(offset, DAY, chart, until),
		db
			.prepare(
				`SELECT path AS key, path AS label, count(DISTINCT ${visitor}) AS visitors,
					count(*) AS views
				FROM views WHERE at >= ? AND at < ? GROUP BY path
				ORDER BY visitors DESC, views DESC LIMIT ${RANKED}`
			)
			.bind(week, until),
		// where visits came from is on their first page view, as /admin/stats counts it
		db
			.prepare(
				`SELECT ${source} AS key, ${source} AS label, count(DISTINCT ${visitor}) AS visitors,
					count(*) AS views
				FROM views WHERE at >= ? AND at < ? AND landing = 1
				GROUP BY key ORDER BY visitors DESC, views DESC LIMIT ${RANKED}`
			)
			.bind(week, until),
		// anyone whose page was still open and reporting in the last five minutes
		db
			.prepare(`SELECT count(DISTINCT ${visitor}) AS visitors FROM views WHERE seen >= ?`)
			.bind(now - 5 * 60 * 1000)
	]);
	const first = <T>(result: D1Result) => result.results[0] as T;
	const perDay = new Map(
		(days.results as { day: number; visitors: number }[]).map((row) => [row.day, row.visitors])
	);
	return {
		visitors: first<{ visitors: number }>(totals).visitors,
		views: first<{ views: number }>(totals).views,
		previous: first<{ visitors: number }>(previous).visitors,
		here: first<{ visitors: number }>(here).visitors,
		// oldest first; `at` is midnight of that day read as UTC, as getStats' buckets are
		days: Array.from({ length: CHART_DAYS }, (_, index) => {
			const day = current - CHART_DAYS + 1 + index;
			return { at: day * DAY, visitors: perDay.get(day) ?? 0 };
		}),
		pages: pages.results as Row[],
		sources: sources.results as Row[]
	};
});

// ---------------------------------------------------------------- race

const RACES_SHOWN = 5;
const RACES_CHARTED = 20;

export const getRaceSummary = createServerFn({ method: 'GET' }).handler(async () => {
	await requireToken();
	const view = await env.RACE_ROOM.getByName('race').adminView('');
	const { loop, history } = view;
	const week = Date.now() - 7 * DAY;
	return {
		round: loop.round,
		phase: loop.phase,
		paused: loop.paused,
		endsAt: loop.endsAt,
		// the room's clock, so the page can count down by it
		now: loop.now,
		watching: loop.viewers,
		watchingPlayers: loop.players,
		pools: loop.pools,
		// the room lists at most 100, most recently seen first
		playersThisWeek: view.players.filter((player) => player.seen >= week).length,
		run: history.totals.run,
		net: history.totals.net,
		staked: history.totals.staked,
		// newest first; a race still running is left out until it has been shown
		races: history.races.slice(0, RACES_SHOWN).map((race) => ({
			round: race.round,
			started: race.started,
			voided: race.voided,
			podium: race.order.slice(0, 3),
			net: race.net
		})),
		// the house's take, race by race, oldest first
		nets: history.races
			.slice(0, RACES_CHARTED)
			.reverse()
			.map((race) => ({ round: race.round, net: race.net, voided: race.voided }))
	};
});
