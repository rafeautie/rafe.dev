import { describe, expect, it } from 'vitest';
import { BOT, readAgent } from './agent';

describe('readAgent', () => {
	it('reads desktop Chrome on macOS', () => {
		expect(
			readAgent(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
			)
		).toEqual({ browser: 'Chrome', version: '141', os: 'macOS', device: 'Desktop' });
	});

	it('reads Safari on an iPhone', () => {
		expect(
			readAgent(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
			)
		).toEqual({ browser: 'Safari', version: '18', os: 'iOS', device: 'Phone' });
	});

	it('tells Edge from the Chrome it is built on', () => {
		expect(
			readAgent(
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
			).browser
		).toBe('Edge');
	});

	it('names an app web view', () => {
		expect(
			readAgent(
				'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.31'
			).browser
		).toBe('LinkedIn');
	});

	it('reads an Android tablet', () => {
		expect(
			readAgent(
				'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
			)
		).toMatchObject({ os: 'Android', device: 'Tablet' });
	});

	it('spots crawlers', () => {
		expect(
			BOT.test('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
		).toBe(true);
		expect(BOT.test('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/141.0.0.0')).toBe(true);
	});
});
