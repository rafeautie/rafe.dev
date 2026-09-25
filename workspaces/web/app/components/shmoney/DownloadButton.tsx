import { Download } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from '~/components/Link';
import { Button } from '~/components/ui/button';
import { LATEST_RELEASE_URL } from '~/components/shmoney/constants';
import { AppleIcon, LinuxIcon, WindowsIcon } from '~/components/shmoney/OSIcons';

type OS = 'windows' | 'macos' | 'linux';

const OS_LABEL: Record<OS, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

const OS_ICON: Record<OS, typeof AppleIcon> = {
	windows: WindowsIcon,
	macos: AppleIcon,
	linux: LinuxIcon
};

// Release assets carry the version in their names (shmoney-0.3.5-setup.exe),
// so the installer for each OS is picked out of the latest release by suffix.
// The AppImage runs on any distro, so Linux gets that over the .deb.
const OS_ASSET: Record<OS, (name: string) => boolean> = {
	windows: (name) => name.endsWith('-setup.exe'),
	macos: (name) => name.endsWith('.dmg'),
	linux: (name) => name.endsWith('.AppImage')
};

const LATEST_RELEASE_API = 'https://api.github.com/repos/rafeautie/shmoney/releases/latest';

function detectOS(): OS | null {
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	const platform = (nav.userAgentData?.platform || nav.userAgent).toLowerCase();
	// phones and tablets have no build; iPadOS claims to be a Mac but has touch
	if (/android|iphone|ipad|ipod/.test(platform) || navigator.maxTouchPoints > 1) return null;
	if (platform.includes('win')) return 'windows';
	if (platform.includes('mac')) return 'macos';
	if (platform.includes('linux') || platform.includes('x11')) return 'linux';
	return null;
}

type Asset = { name: string; browser_download_url: string };

// Both buttons on the page share one request.
let assetsRequest: Promise<Asset[]> | undefined;

function latestAssets() {
	assetsRequest ??= fetch(LATEST_RELEASE_API)
		.then((response) => {
			if (!response.ok) throw new Error(`GitHub responded ${response.status}`);
			return response.json() as Promise<{ assets?: Asset[] }>;
		})
		.then((release) => release.assets ?? [])
		.catch(() => []);
	return assetsRequest;
}

// Links straight to the installer for the visitor's OS once it is known. The
// server render, and anyone we can't place, gets the release page instead.
export function DownloadButton() {
	// null during SSR and hydration, then the visitor's OS
	const os = useSyncExternalStore(
		() => () => {},
		detectOS,
		() => null
	);
	const [href, setHref] = useState(LATEST_RELEASE_URL);

	useEffect(() => {
		if (!os) return;
		let cancelled = false;
		latestAssets().then((assets) => {
			const asset = assets.find((a) => OS_ASSET[os](a.name));
			if (asset && !cancelled) setHref(asset.browser_download_url);
		});
		return () => {
			cancelled = true;
		};
	}, [os]);

	// the installer downloads in place; only the release page opens a new tab
	const Icon = os ? OS_ICON[os] : Download;
	const newTab = href === LATEST_RELEASE_URL ? { target: '_blank', rel: 'noreferrer' } : {};

	return (
		<Button size="lg" className="px-4" render={<Link plain href={href} {...newTab} />}>
			<Icon data-icon="inline-start" className="size-4" />
			{os ? `Download for ${OS_LABEL[os]}` : 'Download'}
		</Button>
	);
}
