import { SIDEBAR_MOTION } from '~/components/ui/sidebar';
import { cn } from '~/lib/utils';

// What the admin's two sidebars (both shadcn's Sidebar) share, so they read
// as one: the admin's own on the far left (AdminSidebar), and a long page's
// sections beside it (Subsections).
//
// The top row, 28px from 32px down, is the page header's row: rafe / admin,
// the fold button, the sections' sidebar's heading and the page's title all
// sit centered on it. The menus start 16px under it, both at the same height.
//
// Folded to its 48px rail of icons (collapsible="icon"), the admin's sidebar
// keeps to 8px all round: 8px either side of each 32px button, 8px from the
// top to the fold button, 8px from it to the icons and 8px from the last icon
// to the foot. The sections' sidebar beside it is not folded and keeps its
// header level with the page's title, as a panel beside an icon rail does.
// Only what is inside the folded sidebar changes (group-data, inside it).
//
// Horizontally, open, words and icons start 24px in from the column's edge:
// the top row is padded 24px, and the menu 16px with 8px inside each row.
//
// Every one of these changes moves in time with the width, so nothing jumps,
// and words fade as they are clipped.

const moving = cn('transition-[padding,gap,margin,height]', SIDEBAR_MOTION);

export const sidebarTop = cn(
	// mt-8 clears the window's edge as the page's content does; pr-4 sets the
	// fold button's icon 24px in from the right, as icons are from the left
	'mt-8 h-7 flex-row items-center justify-between gap-2 py-0 pr-4 pl-6 text-xl leading-7 font-medium',
	// folded: as tall as the fold button, 8px down
	'group-data-[collapsible=icon]:mt-2 group-data-[collapsible=icon]:h-8',
	'group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-2',
	moving
);
export const sidebarMenu = cn(
	'mt-4 px-4 py-0',
	'group-data-[collapsible=icon]:mt-2',
	'group-data-[collapsible=icon]:px-2',
	moving
);
export const sidebarFooter = cn(
	// mb-8 clears the window's foot as the top row clears its top
	'mb-8 px-4 py-0',
	'group-data-[collapsible=icon]:mb-2',
	'group-data-[collapsible=icon]:px-2',
	moving
);

// Every row in both sidebars, its icon included: full strength, as the header
// beside them is; the current one is told by its background (shadcn's
// data-active). Rounded as the site's buttons are (rounded-xl, the fold
// button's too), rather than shadcn's tighter rows.
export const sidebarItem = 'rounded-xl text-sidebar-foreground';

// Words that give way when the sidebar folds: they fade, and shrink to nothing
// so what sits beside them ends up centered in the rail.
export const foldAway =
	'min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none group-data-[collapsible=icon]:opacity-0';

// Moving between the admin's pages stays in the page (the sidebar, and whether
// it is folded, carry over) and plays as a view transition of this type, which
// styles/app.css times: the page crossfades while the sidebar holds still, and
// a page's own sidebar (Subsections) slides out from under it or back. The
// overview's cards (PageLink) leave the same way.
export const PAGE_TRANSITION = { types: ['admin-page'] };
