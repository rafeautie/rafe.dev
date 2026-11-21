import { Link as RouterLink, useLocation } from '@tanstack/react-router';
import {
	ChartLineIcon,
	FlagIcon,
	HouseIcon,
	ImageIcon,
	LogOutIcon,
	PenLineIcon
} from 'lucide-react';
import { Link } from '~/components/Link';
import { SlashNav } from '~/components/SlashNav';
import { ThemeIcon } from '~/components/ThemeToggle';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarTrigger,
	useSidebar
} from '~/components/ui/sidebar';
import { setWritingTheme, useIsDark } from '~/lib/writing-theme';
import { cn } from '~/lib/utils';
import {
	foldAway,
	PAGE_TRANSITION,
	sidebarFooter,
	sidebarItem,
	sidebarMenu,
	sidebarTop
} from './sidebar-style';

const ADMIN_PAGES = [
	{ href: '/admin', label: 'overview', icon: HouseIcon },
	{ href: '/admin/writing', label: 'writing', icon: PenLineIcon },
	{ href: '/admin/photos', label: 'photos', icon: ImageIcon },
	{ href: '/admin/stats', label: 'stats', icon: ChartLineIcon },
	{ href: '/admin/race', label: 'race', icon: FlagIcon }
] as const;

// The admin's navigation: every page down the left, held in place while the
// page scrolls, with the theme and signing out at the foot, drawn as the same
// menu rows so they fold to icons with the rest. The button at its
// top (or ⌘/Ctrl+B, or a click on its edge) folds it down to a rail of icons,
// each named on hover. On a phone it slides in from the header's menu button.
export function AdminSidebar() {
	const { setOpenMobile } = useSidebar();
	// read, not applied: the admin's layout themes the page
	const dark = useIsDark();
	const pathname = useLocation({ select: (location) => location.pathname.replace(/\/$/, '') });
	const current = (href: string) =>
		href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

	return (
		<Sidebar collapsible="icon" className="[view-transition-name:admin-sidebar]">
			<SidebarHeader className={sidebarTop}>
				<SlashNav className={foldAway}>
					<Link href="/">rafe</Link>
					{/* on the overview itself it is where you are, not a way there, as in
					    the page's header */}
					{pathname === '/admin' ? (
						<span aria-current="page">admin</span>
					) : (
						<Link href="/admin">admin</Link>
					)}
				</SlashNav>
				<SidebarTrigger
					aria-label="Toggle the sidebar"
					className="size-8 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
				/>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup className={sidebarMenu}>
					<SidebarMenu aria-label="Admin" className="gap-0.5">
						{ADMIN_PAGES.map(({ href, label, icon: Icon }) => {
							const active = current(href);
							return (
								<SidebarMenuItem key={href}>
									<SidebarMenuButton
										isActive={active}
										tooltip={label}
										className={sidebarItem}
										render={
											<RouterLink
												to={href}
												aria-current={active ? 'page' : undefined}
												viewTransition={PAGE_TRANSITION}
											/>
										}
										onClick={() => setOpenMobile(false)}
									>
										<Icon />
										<span className={foldAway}>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className={sidebarFooter}>
				<SidebarMenu className="gap-0.5">
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="dark mode"
							aria-pressed={dark}
							onClick={() => setWritingTheme(!dark)}
							className={cn('theme-toggle', sidebarItem)}
						>
							<ThemeIcon className="size-4" />
							<span className={foldAway}>dark mode</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<form method="post" action="/admin/logout">
							<SidebarMenuButton type="submit" tooltip="sign out" className={sidebarItem}>
								<LogOutIcon />
								<span className={foldAway}>sign out</span>
							</SidebarMenuButton>
						</form>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
