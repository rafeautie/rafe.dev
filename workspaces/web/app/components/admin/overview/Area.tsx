import { Link as RouterLink, useRouter } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

// One widget of the overview, in its own card: its name links to the admin
// page (and section) it comes from, and what it holds is a small view of that
// page: its headline numbers, a chart, a short list.

// The same view transition as the sidebar's (AdminSidebar), so leaving the
// overview from a card looks like leaving it from the sidebar.
const PAGE_TRANSITION = { types: ['admin-page'] };

// What a server function came back with, or why it did not.
export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

// A link to an admin page, moving there in the page. `to` is a plain path,
// such as a post's editor, which the router matches like any other; `section`
// opens one of a long page's sections (Subsections' ?section=).
export function PageLink({
	to,
	section,
	...props
}: { to: string; section?: string } & Omit<ComponentProps<'a'>, 'href'>) {
	return (
		<RouterLink
			to={to}
			// each page checks its own section names (readSection), and those
			// change with the page, so a name here is passed on as it is
			search={(section ? { section } : undefined) as never}
			viewTransition={PAGE_TRANSITION}
			{...props}
		/>
	);
}

// A heading that leads somewhere: the name and a small arrow.
function Lead({ to, section, children }: { to: string; section?: string; children: ReactNode }) {
	return (
		<PageLink
			to={to}
			section={section}
			className="group/lead inline-flex items-center gap-1.5 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		>
			{children}
			<ArrowRightIcon
				aria-hidden
				className="size-3.5 text-foreground/40 transition-transform group-hover/lead:translate-x-0.5 group-hover/lead:text-foreground/70"
			/>
		</PageLink>
	);
}

export function Area<T>({
	title,
	href,
	section,
	loaded,
	action,
	className,
	children
}: {
	title: string;
	// absent for what has no page of its own
	href?: string;
	section?: string;
	loaded: Loaded<T>;
	action?: ReactNode;
	className?: string;
	children: (value: T) => ReactNode;
}) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>
					{href ? (
						<Lead to={href} section={section}>
							{title}
						</Lead>
					) : (
						title
					)}
				</CardTitle>
				{action && loaded.ok && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-5">
				{loaded.ok ? children(loaded.value) : <AreaError message={loaded.error} />}
			</CardContent>
		</Card>
	);
}

// One area failing to load says so in its own card; the rest stay.
function AreaError({ message }: { message: string }) {
	const router = useRouter();
	return (
		<div className="flex flex-1 flex-col items-start justify-center gap-3 py-4">
			<p className="text-foreground/60">
				Could not load this. <span className="text-foreground/50">{message}</span>
			</p>
			<Button variant="outline" size="sm" onClick={() => router.invalidate()}>
				try again
			</Button>
		</div>
	);
}

// A headline number and what it counts.
export function Figure({
	value,
	label,
	className
}: {
	value: ReactNode;
	label: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn('min-w-0', className)}>
			<p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
			<p className="mt-0.5 text-sm text-foreground/50">{label}</p>
		</div>
	);
}

// A short list under a small heading: the drafts, the latest races.
export function Shortlist({ title, children }: { title: ReactNode; children: ReactNode }) {
	return (
		<div>
			<h3 className="text-xs text-foreground/50">{title}</h3>
			<ul className="mt-1.5 divide-y divide-foreground/5">{children}</ul>
		</div>
	);
}

// A small heading that leads to its section of a page.
export function SubLead({
	to,
	section,
	children
}: {
	to: string;
	section?: string;
	children: ReactNode;
}) {
	return (
		<PageLink to={to} section={section} className="hover:text-foreground">
			{children}
		</PageLink>
	);
}

// A row of a Shortlist: what, on the left, cut short if it has to be; a
// number or a time on the right.
export function ShortlistRow({ children, aside }: { children: ReactNode; aside: ReactNode }) {
	return (
		<li className="flex items-baseline justify-between gap-4 py-2">
			<span className="min-w-0 truncate">{children}</span>
			<span className="shrink-0 text-foreground/50 tabular-nums">{aside}</span>
		</li>
	);
}

// What an area has nothing of yet, said plainly.
export function Empty({ children }: { children: ReactNode }) {
	return <p className="text-foreground/50">{children}</p>;
}
