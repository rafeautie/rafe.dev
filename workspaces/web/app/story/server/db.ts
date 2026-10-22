import { env } from 'cloudflare:workers';
import type { State } from '../nudges';

// Today's nudges and the daily job's progress live in D1. Once a chapter is
// out its nudge stats move into its frontmatter, and its nudges are pruned a
// week later.

export type Status = {
	chapter: number;
	state: State;
	detail: string | null;
	attempts: number;
	updatedAt: number;
};

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS nudges (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		chapter INTEGER NOT NULL,
		visitor TEXT NOT NULL,
		text TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		used INTEGER NOT NULL DEFAULT 0
	)`,
	'CREATE INDEX IF NOT EXISTS nudges_chapter ON nudges (chapter, used)',
	'CREATE UNIQUE INDEX IF NOT EXISTS nudges_visitor ON nudges (visitor, chapter)',
	`CREATE TABLE IF NOT EXISTS status (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		chapter INTEGER NOT NULL,
		state TEXT NOT NULL,
		detail TEXT,
		attempts INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL
	)`
];

// The tables are made on first use, so a fresh database needs no migration
// step. Once per isolate is enough.
let ready: Promise<unknown> | undefined;

export async function db(): Promise<D1Database> {
	ready ??= env.STORY_DB.batch(SCHEMA.map((sql) => env.STORY_DB.prepare(sql))).catch((error) => {
		ready = undefined;
		throw error;
	});
	await ready;
	return env.STORY_DB;
}

export async function getStatus(): Promise<Status | null> {
	const row = await (await db())
		.prepare('SELECT chapter, state, detail, attempts, updated_at FROM status WHERE id = 1')
		.first<{
			chapter: number;
			state: State;
			detail: string | null;
			attempts: number;
			updated_at: number;
		}>();
	return row && { ...row, updatedAt: row.updated_at };
}

export async function setStatus(chapter: number, state: State, detail: string | null = null) {
	await (
		await db()
	)
		.prepare(
			`INSERT INTO status (id, chapter, state, detail, attempts, updated_at) VALUES (1, ?1, ?2, ?3, 1, ?4)
			ON CONFLICT (id) DO UPDATE SET
				attempts = CASE WHEN chapter = ?1 AND ?2 = 'reading' THEN attempts + 1
					WHEN chapter = ?1 THEN attempts ELSE 1 END,
				chapter = ?1, state = ?2, detail = ?3, updated_at = ?4`
		)
		.bind(chapter, state, detail, Date.now())
		.run();
}
