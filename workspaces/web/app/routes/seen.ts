import { createFileRoute } from '@tanstack/react-router';
import { env } from 'cloudflare:workers';
import { BOT, readAgent } from '~/lib/stats/agent';
import { readBeacon, sourceOf } from '~/lib/stats/beacon';
import { addClick, addView, updateView } from '~/lib/stats/store.server';

// Where the public pages report visits (lib/stats/tracker.ts), for
// /admin/stats. Always answers 204, so a bad or refused report shows nothing.
const NOTHING = () => new Response(null, { status: 204 });
const MAX_BYTES = 8000;

export const Route = createFileRoute('/seen')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const site = new URL(request.url);
				// browsers always send their origin with a POST
				if (request.headers.get('origin') !== site.origin) return NOTHING();
				const ua = request.headers.get('user-agent') ?? '';
				if (!ua || BOT.test(ua)) return NOTHING();
				// a report is a few hundred bytes; anything big is not one, and is
				// turned away before it is read
				const length = Number(request.headers.get('content-length'));
				if (!length || length > MAX_BYTES) return NOTHING();
				const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
				if (!(await env.SEEN_LIMIT.limit({ key: address })).success) return NOTHING();
				let beacon;
				try {
					beacon = readBeacon(JSON.parse(await request.text()));
				} catch {
					return NOTHING();
				}
				const now = Date.now();
				if (beacon.type === 'update') {
					await updateView(beacon.id, beacon.engagedMs, beacon.scroll, beacon.loadMs, now);
				} else if (beacon.type === 'click') {
					await addClick(beacon.id, beacon.href, now);
				} else {
					const cf = (request as { cf?: IncomingRequestCfProperties }).cf;
					const agent = readAgent(ua);
					// iPads ask for the desktop site and say they are Macs
					if (agent.os === 'macOS' && beacon.touch) {
						agent.os = 'iPadOS';
						agent.device = 'Tablet';
					}
					await addView({
						id: beacon.id,
						at: now,
						visitor: beacon.visitor,
						session: beacon.session,
						landing: beacon.landing,
						newVisitor: beacon.newVisitor,
						path: beacon.path,
						referrer: sourceOf(beacon.referrer, site.hostname),
						referrerUrl: sourceOf(beacon.referrer, site.hostname) ? beacon.referrer : null,
						utmSource: beacon.utm.source,
						utmMedium: beacon.utm.medium,
						utmCampaign: beacon.utm.campaign,
						country: cf?.country ?? null,
						region: cf?.region ?? null,
						city: cf?.city ?? null,
						timezone: cf?.timezone ?? null,
						org: cf?.asOrganization ?? null,
						browser: agent.browser,
						browserVersion: agent.version,
						os: agent.os,
						device: agent.device,
						screen: beacon.screen,
						viewport: beacon.viewport,
						pixelRatio: beacon.pixelRatio,
						language: beacon.language,
						dark: beacon.dark,
						loadMs: beacon.loadMs
					});
				}
				return NOTHING();
			}
		}
	}
});
