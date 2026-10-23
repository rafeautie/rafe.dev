import { createFileRoute } from '@tanstack/react-router';
import { Link } from '~/components/Link';
import { AdminHeader } from '~/components/admin/AdminHeader';
import { Badge } from '~/components/ui/badge';
import { listPosts } from '~/lib/admin/api';
import { formatPostDate } from '~/lib/admin/time';
import { requireAdmin } from '~/lib/admin/guard';

// Every post, drafts included, laid out like /writing.
export const Route = createFileRoute('/admin/writing/')({
	beforeLoad: requireAdmin,
	loader: () => listPosts(),
	component: PostList
});

function PostList() {
	const posts = Route.useLoaderData();
	return (
		<div className="mx-auto max-w-4xl">
			<AdminHeader
				path={[
					<Link key="rafe" href="/">
						rafe
					</Link>,
					<Link key="admin" href="/admin">
						admin
					</Link>,
					'writing'
				]}
			>
				<Link href="/admin/writing/new">new post</Link>
			</AdminHeader>
			{posts.length ? (
				<ol className="mt-16 flex flex-col gap-12 sm:mt-24">
					{posts.map((post) => (
						<li key={post.slug}>
							<Link href={`/admin/writing/${post.slug}`} className="block hover:scale-[1.004]">
								<article>
									<p className="text-sm text-foreground/50">
										{post.draft || !post.date ? 'not published' : formatPostDate(post.date)}
									</p>
									<h2 className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight text-balance">
										{post.title || post.slug}
										{post.draft && (
											<Badge variant="outline" className="font-normal text-foreground/60">
												draft
											</Badge>
										)}
									</h2>
									{post.description && (
										<p className="mt-2 text-pretty text-foreground/60">{post.description}</p>
									)}
								</article>
							</Link>
						</li>
					))}
				</ol>
			) : (
				<p className="mt-16 text-foreground/60 sm:mt-24">No posts yet.</p>
			)}
		</div>
	);
}
