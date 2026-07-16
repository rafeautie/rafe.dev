import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { LATEST_RELEASE_URL } from '~/components/shmoney/constants';

export function DownloadButton({ children }: { children: ReactNode }) {
	return (
		<Button asChild size="lg" className="px-4">
			<a href={LATEST_RELEASE_URL} target="_blank" rel="noreferrer">
				<Download data-icon="inline-start" className="size-4" />
				{children}
			</a>
		</Button>
	);
}
