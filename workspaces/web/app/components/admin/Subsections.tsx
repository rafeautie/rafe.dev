import { createContext, useContext, type ReactNode } from 'react';
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

export type Subsection = { key: string; label: string; content: ReactNode };

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
// stays mounted, so switching keeps what was typed or picked in each.
//
// It takes the place of the page's usual centered column, and the admin
// layout drops its own padding around it on wide screens (data-subsections).
export function Subsections({
	title,
	sections,
	value,
	onChange,
	children
}: {
	title: string;
	sections: Subsection[];
	value: string | undefined;
	onChange: (key: string) => void;
	children: ReactNode;
}) {
	const current = sections.find((section) => section.key === value) ?? sections[0];
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
			<div className="min-w-0 flex-1 lg:px-12 lg:py-8">
				<div className="mx-auto max-w-4xl">
					<CurrentSection.Provider value={current.label}>{children}</CurrentSection.Provider>
					{sections.map((section) => (
						<div
							key={section.key}
							className={cn('mt-10', section.key !== current.key && 'lg:hidden')}
						>
							{section.content}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// The `section` search param, kept only when it names one of the page's sections.
export function readSection<K extends string>(
	keys: readonly K[],
	search: Record<string, unknown>
): { section?: K } {
	return keys.includes(search.section as K) ? { section: search.section as K } : {};
}
