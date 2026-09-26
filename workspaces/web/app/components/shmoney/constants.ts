export const GITHUB_URL = 'https://github.com/rafeautie/shmoney';
export const LATEST_RELEASE_URL = `${GITHUB_URL}/releases/latest`;

// The live web demo and its screenshots, deployed from the shmoney repo on
// every release. Point VITE_SHMONEY_DEMO_URL at `npm run dev:demo` to work
// against a local build.
export const DEMO_URL: string =
	import.meta.env.VITE_SHMONEY_DEMO_URL ?? 'https://shmoney-demo.rafe.dev';

// Where the page runs the live demo in its pinned tour. It needs width for the
// desktop layout and height for the demo plus its text around it, so a phone
// turned sideways, wide but short, gets the screenshots instead. Matches the
// `tour:` variant in app.css.
export const TOUR_QUERY = '(min-width: 768px) and (min-height: 576px)';
