import { useEffect, useState } from 'react';
import { getAdmin } from './api';
import { SIGNED_IN_COOKIE } from './config';

// Whether Rafe is signed in to the admin, for the public pages' admin links.
// Only a browser holding the hint cookie asks the server, once per visit, so
// visitors cost nothing. False until known, so the links never show to anyone
// else, even briefly.
let check: Promise<boolean> | undefined;

export function useSignedIn() {
	const [signedIn, setSignedIn] = useState(false);
	useEffect(() => {
		if (!document.cookie.split('; ').includes(`${SIGNED_IN_COOKIE}=1`)) return;
		check ??= getAdmin().then(Boolean, () => false);
		let current = true;
		check.then((value) => current && setSignedIn(value));
		return () => {
			current = false;
		};
	}, []);
	return signedIn;
}
