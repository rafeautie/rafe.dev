import { getIronSession, type CookieJar } from 'iron-session';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionOptions, type AdminSession } from './session';

const PASSWORD = 'a test secret that is at least thirty-two characters';

// A browser's cookie jar, as far as the session needs one: whatever was last
// written under a name is what the next request sends.
function browser() {
	const cookies = new Map<string, { value: string; options: Parameters<CookieJar['write']>[2] }>();
	const jar: CookieJar = {
		read: (name) => cookies.get(name)?.value,
		write: (name, value, options) => {
			cookies.set(name, { value, options });
		}
	};
	return { cookies, jar };
}

const open = (jar: CookieJar, password = PASSWORD) =>
	getIronSession<AdminSession>(jar, sessionOptions(password));

describe('the admin session', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('is sealed into an HTTP-only cookie and read back on the next request', async () => {
		const { cookies, jar } = browser();
		const session = await open(jar);
		Object.assign(session, { token: 'gho_token', userId: 1, login: 'rafe' });
		await session.save();

		const cookie = cookies.get('rafe-admin')!;
		expect(cookie.value).not.toContain('gho_token');
		expect(cookie.options).toMatchObject({
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/'
		});
		expect(await open(jar)).toMatchObject({ token: 'gho_token', userId: 1, login: 'rafe' });
	});

	it('comes back empty when the cookie was changed or sealed with another secret', async () => {
		const { cookies, jar } = browser();
		const session = await open(jar);
		session.token = 'gho_token';
		await session.save();

		expect(
			(await open(jar, 'another secret, also thirty-two characters long')).token
		).toBeUndefined();
		const cookie = cookies.get('rafe-admin')!;
		cookies.set('rafe-admin', { ...cookie, value: cookie.value.slice(0, -2) + 'xx' });
		expect((await open(jar)).token).toBeUndefined();
	});

	it('lapses after 8 hours', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-21T09:00:00Z'));
		const { jar } = browser();
		const session = await open(jar);
		session.token = 'gho_token';
		await session.save();

		vi.setSystemTime(new Date('2026-11-21T16:50:00Z'));
		expect((await open(jar)).token).toBe('gho_token');
		vi.setSystemTime(new Date('2026-11-21T17:01:00Z'));
		expect((await open(jar)).token).toBeUndefined();
	});

	it('is gone after signing out', async () => {
		const { jar } = browser();
		const session = await open(jar);
		session.token = 'gho_token';
		await session.save();

		(await open(jar)).destroy();
		expect((await open(jar)).token).toBeUndefined();
	});
});
