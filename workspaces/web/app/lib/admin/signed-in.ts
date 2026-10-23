import { useEffect, useState } from 'react';
import { getAdmin } from './api';
import { SIGNED_IN_COOKIE } from './config';

// In the browser, who is signed in is asked at most every few minutes rather
// than on every page; each server call still checks the cookie. Shared by the
// admin pages and the public pages' admin links.
const RECHECK_MS = 5 * 60 * 1000;
let known: { admin: Awaited<ReturnType<typeof getAdmin>>; at: number } | undefined;

export async function whoIsSignedIn() {
	if (known?.admin && Date.now() - known.at < RECHECK_MS) return known.admin;
	const admin = await getAdmin();
	known = { admin, at: Date.now() };
	return admin;
}

// Whether Rafe is signed in, for the public pages' admin links. Only a browser
// holding the hint cookie asks the server, so visitors cost nothing. False
// until known, so the links never show to anyone else, even briefly.
export function useSignedIn() {
	const [signedIn, setSignedIn] = useState(false);
	useEffect(() => {
		if (!document.cookie.split('; ').includes(`${SIGNED_IN_COOKIE}=1`)) return;
		let current = true;
		whoIsSignedIn().then(
			(admin) => current && setSignedIn(Boolean(admin)),
			() => undefined
		);
		return () => {
			current = false;
		};
	}, []);
	return signedIn;
}
