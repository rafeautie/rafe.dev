import { Activity, createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '~/lib/utils';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem
} from '~/components/ui/sidebar';
import { sidebarItem, sidebarMenu, sidebarTop } from './sidebar-style';
import { sectionId } from '~/lib/admin/section';

export type Subsection<K extends string = string> = { key: K; label: string; content: ReactNode };

// The section showing, for the page's header (AdminHeader): where this sidebar
// shows, headed with the page's name, the header names the section instead,
// so the two read across as one path (race | players) rather than the page's
// name twice side by side.
const CurrentSection = createContext<string | null>(null);
export const useCurrentSection = () => useContext(CurrentSection);

// A long page split into sections. On wide screens the page gets a second
// sidebar of its own, right beside the admin's (AdminSidebar), headed with the
// page's name (title) and listing the sections, and only
// the chosen one shows to the right of both, under the page's header (the
// children). On a phone the sections stack, one under the next. Every section
// stays mounted, so switching keeps what was typed or picked in each; where
// only one shows, the rest are kept as React Activity in hidden mode, so they
// hold their state but run no effects (the stats globe starts only once its
// section is opened) and redraw only when the browser is otherwise idle.
//
// It takes the place of the page's usual centered column, and the admin
// layout drops its own padding around it on wide screens (data-subsections).
export function Subsections<K extends string>({
	title,
	sections,
	value,
	onChange,
	children
}: {
	title: string;
	sections: Subsection<K>[];
	value: K | undefined;
	onChange: (key: K) => void;
	children: ReactNode;
}) {
	const current = sections.find((section) => section.key === value) ?? sections[0];
	const oneAtATime = useWide();
	return (
		<div data-subsections className="lg:flex">
			{/* shadcn's Sidebar, standing still: it lives with the page, not the app */}
			<Sidebar
				collapsible="none"
				aria-label="Sections"
				className="sticky top-0 hidden h-svh w-48 shrink-0 self-start border-r border-sidebar-border bg-clip-padding [view-transition-name:admin-sections] lg:flex"
			>
				{/* level with rafe / admin, so the menus start level too */}
				<SidebarHeader className={sidebarTop}>
					<h2 className="min-w-0 truncate">{title}</h2>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup className={sidebarMenu}>
						<SidebarMenu className="gap-0.5">
							{sections.map((section) => {
								const active = section.key === current.key;
								return (
									<SidebarMenuItem key={section.key}>
										<SidebarMenuButton
											isActive={active}
											aria-current={active ? 'true' : undefined}
											onClick={() => onChange(section.key)}
											className={sidebarItem}
										>
											{section.label}
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroup>
				</SidebarContent>
			</Sidebar>
			{/* beside this sidebar, the page's area starts here: a size container,
			    so the controls rail (AdminHeader) stretches across this, not
			    under the sidebar too */}
			<div className="min-w-0 flex-1 lg:@container">
				<div className="lg:px-12 lg:py-8">
					<div className="mx-auto max-w-4xl">
						<CurrentSection.Provider value={current.label}>{children}</CurrentSection.Provider>
						{sections.map((section) => {
							const shown = section.key === current.key;
							return (
								<Activity key={section.key} mode={oneAtATime && !shown ? 'hidden' : 'visible'}>
									{/* lg:hidden too: it hides the rest from the first paint, before
								    the page knows how wide it is */}
									<div
										id={sectionId(section.key)}
										className={cn('mt-10 scroll-mt-24', !shown && 'lg:hidden')}
									>
										{section.content}
									</div>
								</Activity>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

// Whether the page is as wide as Tailwind's lg, where this sidebar shows and
// one section at a time. False on the server and while hydrating, so the
// first render matches the server's, where every section is visible.
const WIDE = '(min-width: 64rem)';
function useWide() {
	return useSyncExternalStore(
		(onChange) => {
			const query = window.matchMedia(WIDE);
			query.addEventListener('change', onChange);
			return () => query.removeEventListener('change', onChange);
		},
		() => window.matchMedia(WIDE).matches,
		() => false
	);
}
