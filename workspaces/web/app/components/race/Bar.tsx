import type { ReactNode } from 'react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeToggle } from '~/components/ThemeToggle';

// The page is the window: the site's header on top, and the race filling
// everything under it, with a little room round the edge.
export const PAGE = 'flex h-dvh flex-col gap-2 p-2 text-base text-foreground sm:gap-3 sm:p-4';

/** A 32px icon button, the same for every control in the bar. */
export const iconButton =
	'grid size-8 shrink-0 cursor-pointer place-items-center rounded-md p-0 text-foreground outline-none transition-colors hover:bg-foreground/10 hover:scale-100 focus-visible:ring-2 focus-visible:ring-ring';

// The header is the site's own: "rafe / race" on the left, and the sandbox,
// the sound and the theme on the right. Everything about the game is drawn on
// the race itself. Bare, it is the same size the game fills in, so nothing
// moves when the game arrives.
export function Bar({ sound }: { sound?: ReactNode }) {
	return (
		<header className="flex h-10 shrink-0 items-center justify-between gap-4">
			<SlashNav className="text-xl leading-7 font-medium whitespace-nowrap">
				<Link href="/">rafe</Link>
				race
			</SlashNav>
			<div className="flex items-center gap-5">
				<Link href="/race/sandbox" className="text-sm text-muted-foreground">
					sandbox
				</Link>
				{sound}
				<ThemeToggle className={iconButton} />
			</div>
		</header>
	);
}
