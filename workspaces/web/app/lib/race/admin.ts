import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { requireToken } from '~/lib/admin/session.server';
import type { RaceRoom } from './room.server';
import { checkSettings } from './settings';

// What /admin/race asks of the race room. Each handler checks the admin is
// signed in first (requireToken), then calls the room over the Worker's
// binding, the only way its admin methods can be reached.

const room = () => env.RACE_ROOM.getByName('race');

/** What the page shows, as the room makes it. */
export type RaceAdminView = ReturnType<RaceRoom['adminView']>;

// A refusal from the room reaches the page as a plain message it can show.
function done(refused: string | null) {
	if (refused) throw new Error(refused);
	return null;
}

function object(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Bad request');
	return input as Record<string, unknown>;
}

function player(input: unknown) {
	const { id } = object(input);
	if (!Number.isInteger(id) || (id as number) < 1) throw new Error('Bad request: id');
	return id as number;
}

function flag(value: unknown, name: string) {
	if (typeof value !== 'boolean') throw new Error(`Bad request: ${name}`);
	return value;
}

export const getRaceAdmin = createServerFn({ method: 'GET' })
	.inputValidator((input: unknown) => {
		const { search } = object(input ?? {});
		return { search: typeof search === 'string' ? search.slice(0, 40) : '' };
	})
	.handler(async ({ data }) => {
		await requireToken();
		// what comes over RPC carries a disposer, which the page cannot be sent; a clone leaves it
		return structuredClone(await room().adminView(data.search)) as RaceAdminView;
	});

export const renameRacePlayer = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => {
		const { name } = object(input);
		if (typeof name !== 'string') throw new Error('Bad request: name');
		return { id: player(input), name: name.slice(0, 64) };
	})
	.handler(async ({ data }) => {
		await requireToken();
		return done(await room().adminRename(data.id, data.name));
	});

export const resetRacePlayer = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => ({ id: player(input) }))
	.handler(async ({ data }) => {
		await requireToken();
		return done(await room().adminReset(data.id));
	});

export const banRacePlayer = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => ({
		id: player(input),
		banned: flag(object(input).banned, 'banned')
	}))
	.handler(async ({ data }) => {
		await requireToken();
		return done(await room().adminBan(data.id, data.banned));
	});

export const pauseRace = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => ({ paused: flag(object(input).paused, 'paused') }))
	.handler(async ({ data }) => {
		await requireToken();
		return done(await room().adminPause(data.paused));
	});

export const voidRace = createServerFn({ method: 'POST' }).handler(async () => {
	await requireToken();
	return done(await room().adminVoid());
});

export const cautionRace = createServerFn({ method: 'POST' }).handler(async () => {
	await requireToken();
	return done(await room().adminCaution());
});

export const saveRaceSettings = createServerFn({ method: 'POST' })
	.inputValidator((input: unknown) => {
		const settings = checkSettings(object(input).settings);
		if (typeof settings === 'string') throw new Error(settings);
		return { settings };
	})
	.handler(async ({ data }) => {
		await requireToken();
		return done(await room().adminSaveSettings(data.settings));
	});

export const resetRaceSettings = createServerFn({ method: 'POST' }).handler(async () => {
	await requireToken();
	return done(await room().adminResetSettings());
});
