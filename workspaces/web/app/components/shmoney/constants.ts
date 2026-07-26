export const GITHUB_URL = 'https://github.com/rafeautie/shmoney';
export const LATEST_RELEASE_URL = `${GITHUB_URL}/releases/latest`;

// The screenshots are served straight out of the shmoney repo's
// docs/screenshots directory over jsDelivr's GitHub CDN, so the carousel tracks
// whatever the app currently looks like with no copies checked in here. `@main`
// follows the default branch; jsDelivr holds a branch ref for 12h at its edge
// and a week in the browser, so a new screenshot lands within the day.
const SCREENSHOT_BASE_URL = 'https://cdn.jsdelivr.net/gh/rafeautie/shmoney@main/docs/screenshots';

export function screenshotUrl(file: string) {
	return `${SCREENSHOT_BASE_URL}/${file}`;
}
