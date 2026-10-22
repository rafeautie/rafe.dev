import { useEffect, useLayoutEffect, useRef } from 'react';

// Cloudflare's check that a nudge comes from a person. Invisible unless
// Cloudflare is unsure, when it shows a checkbox.

type TurnstileApi = {
	render: (element: HTMLElement, options: Record<string, unknown>) => string;
	reset: (id: string) => void;
	remove: (id: string) => void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

let script: Promise<TurnstileApi> | undefined;

function loadTurnstile() {
	script ??= new Promise((resolve, reject) => {
		const tag = document.createElement('script');
		tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		tag.async = true;
		tag.onload = () => resolve(window.turnstile!);
		tag.onerror = () => {
			script = undefined;
			reject(new Error('Turnstile did not load'));
		};
		document.head.appendChild(tag);
	});
	return script;
}

export function Turnstile({
	siteKey,
	onToken,
	resetKey
}: {
	siteKey: string;
	onToken: (token: string | null) => void;
	// change it to get a fresh token, since each is good for one try
	resetKey: number;
}) {
	const element = useRef<HTMLDivElement>(null);
	const widget = useRef<string | null>(null);
	const callback = useRef(onToken);
	useLayoutEffect(() => {
		callback.current = onToken;
	});

	useEffect(() => {
		let cancelled = false;
		loadTurnstile()
			.then((turnstile) => {
				if (cancelled || !element.current) return;
				widget.current = turnstile.render(element.current, {
					sitekey: siteKey,
					appearance: 'interaction-only',
					callback: (token: string) => callback.current(token),
					'expired-callback': () => callback.current(null),
					'error-callback': () => callback.current(null)
				});
			})
			.catch(() => callback.current(null));
		return () => {
			cancelled = true;
			if (widget.current) window.turnstile?.remove(widget.current);
			widget.current = null;
		};
	}, [siteKey]);

	useEffect(() => {
		if (resetKey && widget.current) {
			callback.current(null);
			window.turnstile?.reset(widget.current);
		}
	}, [resetKey]);

	return <div ref={element} />;
}
