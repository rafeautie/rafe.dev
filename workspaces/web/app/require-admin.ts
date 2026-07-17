import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getCookie, getRequestHeader, setResponseStatus } from '@tanstack/react-start/server';
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

// Throwing a Response looks right but never reaches the client: the server fn
// layer serializes whatever a handler throws, and a Response is not
// serializable, so the refusal crashed the serializer and surfaced as a bare
// 500 plus an opaque "Invariant failed" in the browser. An Error serializes, so
// the reason survives the trip.
//
// setResponseStatus only lands on server fns the client calls directly (the
// saves and deletes). A refusal during the page's own loader still leaves a 500,
// because the router turns any loader throw into its error path.
function forbidden(reason: string): never {
	setResponseStatus(403);
	throw new Error(`Forbidden: ${reason}`);
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
	if (!teamDomain || !aud) {
		forbidden('CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are unset. See ACCESS_SETUP.md.');
	}

	const token = getRequestHeader(ACCESS_HEADER) ?? getCookie(ACCESS_COOKIE);
	if (!token) forbidden('no Access token on this request.');

	const payload = await jwtVerify(token, getJwks(teamDomain), {
		issuer: `https://${teamDomain}`,
		audience: aud
	})
		.then((result) => result.payload)
		.catch((error) => forbidden(`Access token rejected (${error}).`));

	const email = payload.email;
	if (typeof email !== 'string') forbidden('Access token carries no email claim.');
	return { email };
}
