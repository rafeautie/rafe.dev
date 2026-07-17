import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getCookie, getRequestHeader } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';

// Cloudflare Access protects a hostname, not a Worker. Any route that reaches
// the Worker by another hostname arrives with no Access token, and the token
// header is attacker-supplied on those paths, so its presence proves nothing.
// Only the signature and the aud claim do. See ACCESS_SETUP.md.
const ACCESS_COOKIE = 'CF_Authorization';
const ACCESS_HEADER = 'cf-access-jwt-assertion';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(teamDomain: string) {
	// createRemoteJWKSet caches the fetched keys, so it is reused across
	// requests rather than rebuilt per call.
	jwks ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	return jwks;
}

function forbidden(): never {
	throw new Response('Forbidden', { status: 403 });
}

export type AdminIdentity = { email: string };

export async function requireAdmin(): Promise<AdminIdentity> {
	// Access sits in front of the deployed hostname, not the dev server, so
	// there is never a token locally. Vite replaces import.meta.env.DEV with a
	// literal, so this branch is not present in the deployed bundle.
	if (import.meta.env.DEV) {
		return { email: 'dev@localhost' };
	}

	const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
	const aud = env.CF_ACCESS_AUD;
	// Refuse rather than fall open if the app is deployed unconfigured.
	if (!teamDomain || !aud) forbidden();

	const token = getRequestHeader(ACCESS_HEADER) ?? getCookie(ACCESS_COOKIE);
	if (!token) forbidden();

	const payload = await jwtVerify(token, getJwks(teamDomain), {
		issuer: `https://${teamDomain}`,
		audience: aud
	})
		.then((result) => result.payload)
		.catch(() => forbidden());

	const email = payload.email;
	if (typeof email !== 'string') forbidden();
	return { email };
}
